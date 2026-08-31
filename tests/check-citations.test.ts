/**
 * Graders — `check:citations` (REF-02).
 *
 * refs specs/001-foundation (REF-02)
 */
import { describe, expect, it, vi } from "vitest";

/**
 * The kind→tier legacy register (`KIND_TIER_LEGACY_EXCEPTIONS`) is content
 * state, not grader state — the re-kind sweep (`fix/001-source-rekind-sweep`,
 * 2026-08-31) emptied it, which is the register working exactly as designed
 * (a ratchet that only shrinks). But `auditCitations` and
 * `findStaleLegacyExceptions` still need coverage for "a listed file" and "a
 * stale listed file", so this file supplies its own fixture entry instead of
 * reading `KIND_TIER_LEGACY_EXCEPTIONS[0]` — pinning grader mechanics to
 * whatever the register happens to contain today would make this suite pass
 * or fail based on unrelated content edits, which is the same coupling
 * mistake the register's docstring warns against for content authors.
 */
const { MOCK_LEGACY_EXCEPTIONS } = vi.hoisted(() => ({
  MOCK_LEGACY_EXCEPTIONS: ["src/content/vehicles/_test-legacy-fixture.json"],
}));

vi.mock("../scripts/lib/content-entries.mjs", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../scripts/lib/content-entries.mjs")>();
  return { ...actual, KIND_TIER_LEGACY_EXCEPTIONS: MOCK_LEGACY_EXCEPTIONS };
});

import {
  auditCitations,
  findCitationIssues,
  findKindTierIssues,
  findStaleLegacyExceptions,
  findTierSourceIssues,
} from "../scripts/check-citations.mjs";
import { KIND_TIER_LEGACY_EXCEPTIONS } from "../scripts/lib/content-entries.mjs";

const SOURCE = {
  title: "TEST fixture source",
  url: "https://example.invalid/x",
  archiveUrl:
    "https://web.archive.org/web/20260101000000/https://example.invalid/x",
  accessed: "2026-08-27",
  kind: "fsm",
};

interface Entry {
  collection: string;
  file: string;
  data: unknown;
}

function entry(overrides: Partial<Entry> = {}): Entry {
  return {
    collection: "reference",
    file: "src/content/reference/g3-torque-headbolt.md",
    data: {
      id: "g3-torque-headbolt",
      fitment: { gens: ["gen3"] },
      confidence: "first-hand",
      sources: [],
      torqueNm: 88,
      prose: { en: {}, es: {} },
    },
    ...overrides,
  };
}

describe("findCitationIssues", () => {
  it("flags a numeric shared-data field with no sources", () => {
    const issues = findCitationIssues(entry());
    expect(issues).toHaveLength(1);
    expect(issues[0]?.field).toBe("torqueNm");
    expect(issues[0]?.message).toMatch(/torqueNm.*88.*cites no sources/);
  });

  it("is clean when the entry has at least one source", () => {
    const issues = findCitationIssues(
      entry({
        data: {
          id: "x",
          confidence: "fsm-confirmed",
          sources: [SOURCE],
          torqueNm: 88,
          prose: {},
        },
      })
    );
    expect(issues).toEqual([]);
  });

  it("is clean when the entry has no numeric shared data at all", () => {
    const issues = findCitationIssues(
      entry({
        data: {
          id: "x",
          confidence: "anecdotal",
          sources: [],
          oemPartNumber: "TEST-MB000001",
          prose: {},
        },
      })
    );
    expect(issues).toEqual([]);
  });

  it("finds a numeric field nested inside shared data, naming the dotted path", () => {
    const issues = findCitationIssues(
      entry({
        data: {
          id: "x",
          confidence: "anecdotal",
          sources: [],
          capacities: { oilQt: 5.5 },
          prose: {},
        },
      })
    );
    expect(issues).toHaveLength(1);
    expect(issues[0]?.field).toBe("capacities.oilQt");
  });

  it("ignores numbers inside the reserved entry envelope (fitment.years)", () => {
    const issues = findCitationIssues(
      entry({
        data: {
          id: "x",
          confidence: "anecdotal",
          sources: [],
          fitment: { gens: ["gen3"], years: { from: 1999, to: 2006 } },
          prose: {},
        },
      })
    );
    expect(issues).toEqual([]);
  });

  it("fires regardless of confidence tier (the gap the schema gate leaves)", () => {
    // The schema's CITATION_REQUIRED_TIERS gate only fires for
    // fsm-confirmed/tsb. community-consensus with an uncited number is
    // exactly what check:citations exists to catch on top of that.
    const issues = findCitationIssues(
      entry({
        data: {
          id: "x",
          confidence: "community-consensus",
          sources: [],
          torqueNm: 88,
          prose: {},
        },
      })
    );
    expect(issues).toHaveLength(1);
  });
});

describe("findTierSourceIssues", () => {
  // Negative control: the case this grader exists to catch (2026-08-29
  // erratum) — community-consensus with zero sources and no numeric shared
  // data at all (findCitationIssues alone would never see this one).
  it("FAILS a community-consensus entry with empty sources", () => {
    const issues = findTierSourceIssues(
      entry({
        data: {
          id: "glossary-term-x",
          confidence: "community-consensus",
          sources: [],
          prose: {},
        },
      })
    );
    expect(issues).toHaveLength(1);
    expect(issues[0]?.message).toMatch(/glossary-term-x/);
    expect(issues[0]?.message).toMatch(/community-consensus/);
    expect(issues[0]?.message).toMatch(/first-hand/);
  });

  // Positive control: first-hand with zero sources passes.
  it("passes a first-hand entry with zero sources", () => {
    const issues = findTierSourceIssues(
      entry({
        data: {
          id: "x",
          confidence: "first-hand",
          sources: [],
          prose: {},
        },
      })
    );
    expect(issues).toEqual([]);
  });

  // Positive control: anecdotal with zero sources passes.
  it("passes an anecdotal entry with zero sources", () => {
    const issues = findTierSourceIssues(
      entry({
        data: {
          id: "x",
          confidence: "anecdotal",
          sources: [],
          prose: {},
        },
      })
    );
    expect(issues).toEqual([]);
  });

  // Positive control: community-consensus with one source passes.
  it("passes a community-consensus entry with one source", () => {
    const issues = findTierSourceIssues(
      entry({
        data: {
          id: "x",
          confidence: "community-consensus",
          sources: [SOURCE],
          prose: {},
        },
      })
    );
    expect(issues).toEqual([]);
  });

  // fsm-confirmed / tsb still require sources (already schema-enforced, but
  // this rule is an independent gate that must not regress it).
  it.each(["fsm-confirmed", "tsb"])(
    "FAILS a %s entry with empty sources",
    (confidence) => {
      const issues = findTierSourceIssues(
        entry({ data: { id: "x", confidence, sources: [], prose: {} } })
      );
      expect(issues).toHaveLength(1);
    }
  );
});

/**
 * The kind→tier coherence rule (T207). Replaces the schema-level
 * "does not yet constrain which kind may support which tier" pin in
 * `src/schemas/entry.test.ts`, which now records that the coupling lives here
 * rather than in the schema.
 */
describe("findKindTierIssues", () => {
  const sourceOfKind = (kind: string) => ({ ...SOURCE, kind });

  const tiered = (confidence: string, kinds: string[]) =>
    entry({
      data: {
        id: "g3-brakes-caliper-bolt",
        confidence,
        sources: kinds.map(sourceOfKind),
        prose: {},
      },
    });

  // Negative control: the case the rule exists to catch.
  it("FAILS an fsm-confirmed entry cited only by a forum thread", () => {
    const issues = findKindTierIssues(tiered("fsm-confirmed", ["forum"]));
    expect(issues).toHaveLength(1);
    expect(issues[0]?.field).toBe("sources");
    expect(issues[0]?.message).toMatch(/g3-brakes-caliper-bolt/);
    expect(issues[0]?.message).toMatch(/fsm-confirmed/);
    expect(issues[0]?.message).toMatch(/factory-documented/);
    // Names what it actually cites, so the author can see the mismatch.
    expect(issues[0]?.message).toMatch(/`forum`/);
  });

  it.each(["vendor", "video", "reference", "first-hand"])(
    "FAILS an fsm-confirmed entry cited only by a `%s` source",
    (kind) => {
      expect(findKindTierIssues(tiered("fsm-confirmed", [kind]))).toHaveLength(
        1
      );
    }
  );

  it("FAILS a tsb entry with no documentary source", () => {
    expect(findKindTierIssues(tiered("tsb", ["vendor", "forum"]))).toHaveLength(
      1
    );
  });

  // Positive controls: one documentary source anywhere in the list is enough.
  it.each(["fsm", "tsb", "manufacturer"])(
    "passes an fsm-confirmed entry with a `%s` source among weaker ones",
    (kind) => {
      expect(
        findKindTierIssues(tiered("fsm-confirmed", ["vendor", kind, "forum"]))
      ).toEqual([]);
    }
  );

  it("passes a community-consensus entry cited only by forums", () => {
    // Scope: the rule is deliberately about the documentary tiers only —
    // `community-consensus` has no document in its definition.
    expect(
      findKindTierIssues(tiered("community-consensus", ["forum"]))
    ).toEqual([]);
  });

  it.each(["first-hand", "anecdotal"])(
    "passes a %s entry whatever it cites",
    (confidence) => {
      expect(findKindTierIssues(tiered(confidence, ["forum"]))).toEqual([]);
    }
  );

  it("stays silent on a documentary entry with no sources at all", () => {
    // That is findTierSourceIssues' finding; reporting one mistake twice
    // sends the author chasing two problems.
    expect(findKindTierIssues(tiered("fsm-confirmed", []))).toEqual([]);
  });

  it("ignores a malformed source rather than crediting it", () => {
    const issues = findKindTierIssues(
      entry({
        data: {
          id: "x",
          confidence: "fsm-confirmed",
          sources: [{ kind: 7 }, sourceOfKind("forum")],
          prose: {},
        },
      })
    );
    expect(issues).toHaveLength(1);
  });
});

describe("the kind→tier legacy register", () => {
  const violating = (file: string) => ({
    collection: "vehicles",
    file,
    data: {
      id: "legacy",
      confidence: "fsm-confirmed",
      sources: [{ ...SOURCE, kind: "vendor" }],
      prose: {},
    },
  });

  const listed = MOCK_LEGACY_EXCEPTIONS[0] as string;

  it("suppresses a listed file's violation in auditCitations", () => {
    expect(findKindTierIssues(violating(listed))).toHaveLength(1);
    expect(auditCitations([violating(listed)])).toEqual([]);
  });

  it("does not suppress an unlisted file's violation", () => {
    const issues = auditCitations([
      violating("src/content/reference/not-listed.json"),
    ]);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.file).toBe("src/content/reference/not-listed.json");
  });

  it("FAILS on a stale exception — a listed file that no longer violates", () => {
    // The ratchet: the register can only shrink. A fixed, renamed or deleted
    // file that kept its exception would hide the next violation to land in
    // that file.
    const stale = findStaleLegacyExceptions([]);
    expect(stale.length).toBe(KIND_TIER_LEGACY_EXCEPTIONS.length);
    expect(stale[0]?.message).toMatch(/stale/);
    expect(stale[0]?.message).toMatch(/KIND_TIER_LEGACY_EXCEPTIONS/);
  });

  it("reports no stale exception while every listed file still violates", () => {
    const entries = KIND_TIER_LEGACY_EXCEPTIONS.map((file: string) =>
      violating(file)
    );
    expect(findStaleLegacyExceptions(entries)).toEqual([]);
  });
});

describe("auditCitations", () => {
  it("aggregates issues across multiple entries", () => {
    const issues = auditCitations([
      entry(),
      entry({
        file: "src/content/reference/other.md",
        data: {
          id: "other",
          confidence: "anecdotal",
          sources: [SOURCE],
          torqueNm: 10,
          prose: {},
        },
      }),
    ]);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.file).toBe("src/content/reference/g3-torque-headbolt.md");
  });

  it("catches a tier/source violation with no numeric data at all", () => {
    // findCitationIssues alone would report [] here (no numeric leaves) —
    // this is what auditCitations adds findTierSourceIssues for.
    const issues = auditCitations([
      entry({
        file: "src/content/glossary/some-term.md",
        data: {
          id: "some-term",
          confidence: "community-consensus",
          sources: [],
          prose: {},
        },
      }),
    ]);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.file).toBe("src/content/glossary/some-term.md");
  });
});
