/**
 * Graders — `check:citations` (REF-02).
 *
 * refs specs/001-foundation (REF-02)
 */
import { describe, expect, it } from "vitest";
import {
  auditCitations,
  findCitationIssues,
  findTierSourceIssues,
} from "../scripts/check-citations.mjs";

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
