/**
 * Graders — `check:links` (SCF-02/SCF-03 link check, source half), including
 * the T105 review's F2 policy change: a source fails only when **both**
 * `url` and `archiveUrl` are unreachable; one dead side with a live other is
 * a warning (exit 0), not a build failure.
 *
 * Every reachability test injects a fake `fetchImpl` — this suite must never
 * touch the network.
 *
 * refs specs/001-foundation (SCF-02, SCF-03, GAP-01)
 */
import { describe, expect, it } from "vitest";
import {
  auditLinks,
  collectLinkTargets,
  collectSourcePairs,
  findArchiveShapeIssues,
  findUnreachableLinks,
  isArchiveUrl,
} from "../scripts/check-links.mjs";

interface Entry {
  collection: string;
  file: string;
  data: unknown;
}

function entry(overrides: Partial<Entry> = {}): Entry {
  return {
    collection: "reference",
    file: "src/content/reference/x.md",
    data: {
      id: "x",
      sources: [
        {
          title: "TEST source",
          url: "https://example.invalid/page",
          archiveUrl:
            "https://web.archive.org/web/20260101000000/https://example.invalid/page",
          accessed: "2026-08-27",
          kind: "forum",
        },
      ],
      prose: {},
    },
    ...overrides,
  };
}

describe("isArchiveUrl", () => {
  it("accepts a web.archive.org URL", () => {
    expect(
      isArchiveUrl(
        "https://web.archive.org/web/20260101000000/https://x.invalid"
      )
    ).toBe(true);
  });

  it("rejects a non-archive host", () => {
    expect(isArchiveUrl("https://example.invalid/not-an-archive")).toBe(false);
  });

  it("rejects an unparseable URL", () => {
    expect(isArchiveUrl("not a url")).toBe(false);
  });
});

describe("collectLinkTargets", () => {
  it("collects both url and archiveUrl from every source, entry-scoped", () => {
    const targets = collectLinkTargets([entry()]);
    expect(targets).toHaveLength(2);
    expect(targets.map((t: { field: string }) => t.field)).toEqual([
      "sources[0].url",
      "sources[0].archiveUrl",
    ]);
  });

  it("returns [] for an entry with no sources", () => {
    expect(
      collectLinkTargets([entry({ data: { id: "x", sources: [], prose: {} } })])
    ).toEqual([]);
  });
});

describe("collectSourcePairs", () => {
  it("pairs url and archiveUrl for the same source", () => {
    const pairs = collectSourcePairs([entry()]);
    expect(pairs).toHaveLength(1);
    expect(pairs[0]?.url).toBe("https://example.invalid/page");
    expect(pairs[0]?.archiveUrl).toMatch(/web\.archive\.org/);
  });

  it("skips a source with neither url nor archiveUrl", () => {
    const pairs = collectSourcePairs([
      entry({
        data: {
          id: "x",
          sources: [{ title: "T", accessed: "2026-08-27", kind: "forum" }],
          prose: {},
        },
      }),
    ]);
    expect(pairs).toEqual([]);
  });
});

describe("findArchiveShapeIssues", () => {
  it("is clean when archiveUrl is a real web.archive.org snapshot", () => {
    expect(findArchiveShapeIssues([entry()])).toEqual([]);
  });

  it("flags an archiveUrl that is not on web.archive.org", () => {
    const issues = findArchiveShapeIssues([
      entry({
        data: {
          id: "x",
          sources: [
            {
              title: "T",
              url: "https://example.invalid/a",
              archiveUrl: "https://example.invalid/a",
              accessed: "2026-08-27",
              kind: "forum",
            },
          ],
          prose: {},
        },
      }),
    ]);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.message).toMatch(/not a web\.archive\.org snapshot/);
  });
});

describe("findUnreachableLinks — F2 both-sides-dead policy", () => {
  it("is clean when both sides respond 2xx", async () => {
    const fetchImpl = async () => ({ ok: true, status: 200 });
    const { issues, warnings } = await findUnreachableLinks([entry()], {
      fetchImpl,
    });
    expect(issues).toEqual([]);
    expect(warnings).toEqual([]);
  });

  it("issues (fails) when both url and archiveUrl are unreachable", async () => {
    const fetchImpl = async () => ({ ok: false, status: 404 });
    const { issues, warnings } = await findUnreachableLinks([entry()], {
      fetchImpl,
    });
    expect(issues).toHaveLength(1);
    expect(issues[0]?.entry.file).toBe("src/content/reference/x.md");
    expect(issues[0]?.message).toMatch(/unreachable on both sides/);
    expect(issues[0]?.message).toMatch(/HTTP 404/);
    expect(warnings).toEqual([]);
  });

  it("warns (does not fail) when only url is dead and archiveUrl lives", async () => {
    const fetchImpl = async (url: string) => {
      if (url.includes("web.archive.org")) return { ok: true, status: 200 };
      return { ok: false, status: 404 };
    };
    const { issues, warnings } = await findUnreachableLinks([entry()], {
      fetchImpl,
    });
    expect(issues).toEqual([]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.field).toBe("sources[0].url");
    expect(warnings[0]?.message).toMatch(/archiveUrl.*still resolves/);
    expect(warnings[0]?.message).toMatch(/GAP-01, T703/);
  });

  it("warns (does not fail) when only archiveUrl is dead and url lives", async () => {
    const fetchImpl = async (url: string) => {
      if (url.includes("web.archive.org")) return { ok: false, status: 404 };
      return { ok: true, status: 200 };
    };
    const { issues, warnings } = await findUnreachableLinks([entry()], {
      fetchImpl,
    });
    expect(issues).toEqual([]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.field).toBe("sources[0].archiveUrl");
    expect(warnings[0]?.message).toMatch(/url.*still resolves/);
  });

  it("retries with GET when HEAD is rejected (405), and passes if GET succeeds", async () => {
    const calls: string[] = [];
    const fetchImpl = async (_url: string, init: { method: string }) => {
      calls.push(init.method);
      if (init.method === "HEAD") return { ok: false, status: 405 };
      return { ok: true, status: 200 };
    };
    const { issues, warnings } = await findUnreachableLinks([entry()], {
      fetchImpl,
    });
    expect(issues).toEqual([]);
    expect(warnings).toEqual([]);
    expect(calls).toContain("HEAD");
    expect(calls).toContain("GET");
  });

  it("retries once on a thrown network error before falling back to GET", async () => {
    let headAttempts = 0;
    const fetchImpl = async (_url: string, init: { method: string }) => {
      if (init.method === "HEAD") {
        headAttempts += 1;
        throw new Error("getaddrinfo ENOTFOUND example.invalid");
      }
      return { ok: true, status: 200 };
    };
    const { issues, warnings } = await findUnreachableLinks([entry()], {
      fetchImpl,
    });
    expect(issues).toEqual([]);
    expect(warnings).toEqual([]);
    // One initial HEAD attempt plus exactly one retry, per side (url +
    // archiveUrl) — 2 sides * 2 attempts = 4.
    expect(headAttempts).toBe(4);
  });

  it("declares a side unreachable after its retry also fails", async () => {
    const fetchImpl = async () => {
      throw new Error("getaddrinfo ENOTFOUND example.invalid");
    };
    const { issues } = await findUnreachableLinks([entry()], { fetchImpl });
    expect(issues).toHaveLength(1);
    expect(issues[0]?.message).toMatch(/ENOTFOUND/);
  });
});

describe("findUnreachableLinks — offline notice", () => {
  it("is null when nothing fails", async () => {
    const fetchImpl = async () => ({ ok: true, status: 200 });
    const { offlineNotice } = await findUnreachableLinks([entry()], {
      fetchImpl,
    });
    expect(offlineNotice).toBeNull();
  });

  it("is null for a single dead link (one failure proves nothing about the network)", async () => {
    const fetchImpl = async (url: string) => {
      if (url.includes("web.archive.org")) return { ok: true, status: 200 };
      throw new Error("getaddrinfo ENOTFOUND example.invalid");
    };
    const { offlineNotice } = await findUnreachableLinks([entry()], {
      fetchImpl,
    });
    expect(offlineNotice).toBeNull();
  });

  it("fires when every check fails identically across multiple entries", async () => {
    const entries = [
      entry(),
      entry({
        file: "src/content/reference/y.md",
        data: {
          id: "y",
          sources: [
            {
              title: "T",
              url: "https://another.invalid/page",
              archiveUrl:
                "https://web.archive.org/web/20260101000000/https://another.invalid/page",
              accessed: "2026-08-27",
              kind: "forum",
            },
          ],
          prose: {},
        },
      }),
    ];
    const fetchImpl = async () => {
      throw new Error("fetch failed");
    };
    const { offlineNotice, issues } = await findUnreachableLinks(entries, {
      fetchImpl,
    });
    expect(issues.length).toBeGreaterThan(0);
    expect(offlineNotice).toMatch(/no outbound network access/);
    expect(offlineNotice).toMatch(/fetch failed/);
  });

  it("does not fire when failures have different reasons (real, unrelated dead links)", async () => {
    const entries = [
      entry(),
      entry({
        file: "src/content/reference/y.md",
        data: {
          id: "y",
          sources: [
            {
              title: "T",
              url: "https://another.invalid/page",
              archiveUrl:
                "https://web.archive.org/web/20260101000000/https://another.invalid/page",
              accessed: "2026-08-27",
              kind: "forum",
            },
          ],
          prose: {},
        },
      }),
    ];
    let call = 0;
    const fetchImpl = async () => {
      call += 1;
      if (call % 2 === 0) return { ok: false, status: 404 };
      throw new Error("getaddrinfo ENOTFOUND");
    };
    const { offlineNotice } = await findUnreachableLinks(entries, {
      fetchImpl,
    });
    expect(offlineNotice).toBeNull();
  });
});

describe("auditLinks", () => {
  it("combines archive-shape issues, reachability issues, and warnings", async () => {
    const badArchive = entry({
      file: "src/content/reference/bad-archive.md",
      data: {
        id: "bad-archive",
        sources: [
          {
            title: "T",
            url: "https://example.invalid/a",
            archiveUrl: "https://example.invalid/a",
            accessed: "2026-08-27",
            kind: "forum",
          },
        ],
        prose: {},
      },
    });
    const fetchImpl = async () => ({ ok: false, status: 500 });
    const { issues, warnings } = await auditLinks([badArchive], {
      fetchImpl,
    });
    expect(
      issues.some((i: { message: string }) =>
        /web\.archive\.org/.test(i.message)
      )
    ).toBe(true);
    expect(
      issues.some((i: { message: string }) => /HTTP 500/.test(i.message))
    ).toBe(true);
    expect(warnings).toEqual([]);
  });
});
