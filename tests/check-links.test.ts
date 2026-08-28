/**
 * Graders — `check:links` (SCF-02/SCF-03 link check, source half).
 *
 * Every reachability test injects a fake `fetchImpl` — this suite must never
 * touch the network.
 *
 * refs specs/001-foundation (SCF-02, SCF-03)
 */
import { describe, expect, it } from "vitest";
import {
  auditLinks,
  collectLinkTargets,
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

describe("findUnreachableLinks", () => {
  it("is clean when every fetched URL responds 2xx", async () => {
    const fetchImpl = async () => ({ ok: true, status: 200 });
    const issues = await findUnreachableLinks([entry()], { fetchImpl });
    expect(issues).toEqual([]);
  });

  it("flags a URL that responds 404, naming the entry, field, and status", async () => {
    const fetchImpl = async () => ({ ok: false, status: 404 });
    const issues = await findUnreachableLinks([entry()], { fetchImpl });
    // Both sources[0].url and sources[0].archiveUrl point at the same host in
    // the fixture, so both fail — assert on the first.
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0]?.entry.file).toBe("src/content/reference/x.md");
    expect(issues[0]?.message).toMatch(/HTTP 404/);
  });

  it("retries with GET when HEAD is rejected (405), and passes if GET succeeds", async () => {
    const calls: string[] = [];
    const fetchImpl = async (_url: string, init: { method: string }) => {
      calls.push(init.method);
      if (init.method === "HEAD") return { ok: false, status: 405 };
      return { ok: true, status: 200 };
    };
    const issues = await findUnreachableLinks([entry()], { fetchImpl });
    expect(issues).toEqual([]);
    expect(calls).toContain("HEAD");
    expect(calls).toContain("GET");
  });

  it("flags a network error (thrown fetch) naming the reason", async () => {
    const fetchImpl = async () => {
      throw new Error("getaddrinfo ENOTFOUND example.invalid");
    };
    const issues = await findUnreachableLinks([entry()], { fetchImpl });
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0]?.message).toMatch(/ENOTFOUND/);
  });
});

describe("auditLinks", () => {
  it("combines archive-shape and reachability problems", async () => {
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
    const issues = await auditLinks([badArchive], { fetchImpl });
    expect(
      issues.some((i: { message: string }) =>
        /web\.archive\.org/.test(i.message)
      )
    ).toBe(true);
    expect(
      issues.some((i: { message: string }) => /HTTP 500/.test(i.message))
    ).toBe(true);
  });
});
