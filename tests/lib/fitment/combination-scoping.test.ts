/**
 * Graders — **decision (b)**: whether parent-scope combination data applies to
 * a child generation.
 *
 * tasks.md's T203 line records this as an open item from the T202 review:
 *
 * > (d) open item: what `classifyCombination` answers for a `gen2-5` vehicle
 * > when only a `gen2` combination entry exists — real content carries both
 * > `combos-gen2-jdm` and `combos-gen2-5-jdm`, so T203 decides and documents
 * > whether parent-scope combination data applies to a child generation.
 *
 * ## The decision
 *
 * **Combination scoping is exact. `classifyCombination` consults only the
 * entries whose `generation` is the selection's own generation id;
 * `parentGeneration` is never followed, in either direction.**
 *
 * The reasoning (in full in `src/lib/fitment/index.ts`'s docstring): expansion
 * is a rule about *facts* — a torque figure scoped to Gen 2 applies to a
 * facelift truck, because the facelift is a Gen 2 truck. A combination entry
 * is not a fact about a truck; it is a **record of one offering list, sourced
 * for one exact scope**. Inheriting it fails in both directions:
 *
 * - upwards-into-the-child, a `complete` parent entry could call a
 *   facelift-only powertrain *impossible* — the confident wrong answer VEH-03
 *   is built to prevent;
 * - as a positive, it would report a tuple as having *existed* on a truck the
 *   source never mentioned. `combos-gen2-jdm`'s own prose says so out loud:
 *   "Ranges close at the last listing before the mid-cycle facelift, which has
 *   its own entry."
 *
 * So a child generation in a scope with only a parent entry lands on VEH-03
 * rule 3 — `unknown`, never `impossible` — which is already the graded answer
 * for any unwritten scope.
 *
 * ## What this does NOT change
 *
 * `validateEntryFitments` still **expands** a fitment's `gens` when choosing
 * which scopes to interrogate: a `gens: ["gen2"]` fitment genuinely names
 * `gen2-5` trucks, so `gen2-5`'s own scope is one of the candidates. Expansion
 * decides *which* scopes are asked; scoping decides that each scope answers
 * only for itself. The last describe block below is what keeps those two
 * rules from being confused for each other.
 *
 * The ids and years asserted here are read off T201's merged content:
 * `combos-gen2-jdm` lists 6G72 SOHC + 4-speed auto + Super Select for
 * 1991–1996 and does **not** list the GDI; `combos-gen2-5-jdm` lists 6G74 GDI
 * + 5-speed auto + Super Select for 1997–1999 and does **not** list the 6G72.
 *
 * refs specs/001-foundation (VEH-03, FIT-02, FIT-04)
 */
import { describe, expect, it } from "vitest";
import {
  buildTaxonomy,
  classifyCombination,
  expandGenerations,
  validateEntryFitments,
  type FitmentIssue,
  type VehicleSelection,
} from "../../../src/lib/fitment/index.ts";
import {
  makeFitmentEntry,
  readVehicleEntries,
} from "../../fixtures/fitment-fixtures.ts";

const realTaxonomy = () => buildTaxonomy(readVehicleEntries());

const codes = (issues: readonly FitmentIssue[]): string[] =>
  issues.map((issue) => issue.code);

/** A tuple `combos-gen2-jdm` lists, at a year inside its recorded range. */
const PARENT_ONLY_TUPLE = {
  market: "jdm",
  year: 1996,
  engine: "6g72-sohc",
  transmission: "automatic-4-speed",
  transferCase: "super-select",
} as const;

/** A tuple `combos-gen2-5-jdm` lists, at a year inside its recorded range. */
const CHILD_ONLY_TUPLE = {
  market: "jdm",
  year: 1998,
  engine: "6g74-gdi",
  transmission: "automatic-5-speed",
  transferCase: "super-select",
} as const;

describe("the real content this decision is about (VEH-03)", () => {
  it("carries a combination entry for the parent and for the child", () => {
    // If T201's data ever stops carrying both, this decision stops being live
    // and that shows up here rather than as a mysterious verdict below.
    const ids = readVehicleEntries().map((entry) => entry.id);

    expect(ids).toContain("combos-gen2-jdm");
    expect(ids).toContain("combos-gen2-5-jdm");
  });

  it("still expands gen2 to gen2-5 for *facts* — the rule this one is not", () => {
    expect([...expandGenerations(["gen2"], realTaxonomy())].sort()).toEqual([
      "gen2",
      "gen2-5",
    ]);
  });
});

describe("a parent's offering list does not answer for the child", () => {
  it("recognises the parent-only tuple on a gen2 truck", () => {
    // Positive control: the tuple really is recorded, in the parent's scope.
    expect(
      classifyCombination({ gen: "gen2", ...PARENT_ONLY_TUPLE }, realTaxonomy())
    ).toBe("existed");
  });

  it("answers `unknown` for the same tuple on a gen2-5 truck", () => {
    // Not `existed`: no source says the facelift shipped this pairing, and
    // inheriting the parent's rows would fabricate the citation.
    const verdict = classifyCombination(
      { gen: "gen2-5", ...PARENT_ONLY_TUPLE },
      realTaxonomy()
    );

    expect(verdict).not.toBe("existed");
    expect(verdict).toBe("unknown");
  });
});

describe("a child's offering list does not answer for the parent either", () => {
  it("recognises the child-only tuple on a gen2-5 truck", () => {
    expect(
      classifyCombination(
        { gen: "gen2-5", ...CHILD_ONLY_TUPLE },
        realTaxonomy()
      )
    ).toBe("existed");
  });

  it("answers `unknown` for the same tuple on a gen2 truck", () => {
    // Containment runs one way for facts and no way at all for offering
    // records, so this direction was never in question — but a resolver that
    // merged the two scopes into one pool would answer `existed` here.
    const verdict = classifyCombination(
      { gen: "gen2", ...CHILD_ONLY_TUPLE },
      realTaxonomy()
    );

    expect(verdict).not.toBe("existed");
    expect(verdict).toBe("unknown");
  });
});

/**
 * A closed parent scope with an unwritten child scope — the shape that makes
 * the *dangerous* half of this decision observable. Built here rather than in
 * the shared T202 fixture: no real entry claims `complete`, and the shared
 * fixture belongs to T202.
 */
function completeParentTaxonomy() {
  return buildTaxonomy([
    {
      id: "gen2",
      kind: "generation",
      production: { from: 1991, to: 1999 },
      marketNames: [{ market: "us", name: "Montero" }],
    },
    {
      id: "gen2-5",
      kind: "generation",
      parentGeneration: "gen2",
      production: { from: 1997, to: 1999 },
      marketNames: [{ market: "us", name: "Montero" }],
    },
    { id: "us", kind: "market" },
    { id: "test-engine-alpha", kind: "engine" },
    { id: "test-gearbox-alpha", kind: "transmission" },
    { id: "test-gearbox-beta", kind: "transmission" },
    { id: "test-tcase-alpha", kind: "transfer-case" },
    {
      id: "combos-gen2-us",
      kind: "combination",
      generation: "gen2",
      market: "us",
      coverage: "complete",
      offerings: [
        {
          years: { from: 1991, to: 1996 },
          engine: "test-engine-alpha",
          transmission: "test-gearbox-alpha",
          transferCase: "test-tcase-alpha",
        },
      ],
    },
  ]);
}

describe("a `complete` parent never denies a child (the dangerous half)", () => {
  const absentTuple = {
    market: "us",
    year: 1998,
    engine: "test-engine-alpha",
    transmission: "test-gearbox-beta",
    transferCase: "test-tcase-alpha",
  } as const;

  it("calls the absent tuple impossible in the parent's own scope", () => {
    // Positive control: the closed world really is closed, for gen2.
    expect(
      classifyCombination(
        { gen: "gen2", ...absentTuple },
        completeParentTaxonomy()
      )
    ).toBe("impossible");
  });

  it("answers `unknown` for the child, never `impossible`", () => {
    // The failure this decision exists to prevent: a pre-facelift offering
    // list declaring a facelift truck's powertrain a thing that never existed,
    // and the site hiding content from the person who owns it.
    const verdict = classifyCombination(
      { gen: "gen2-5", ...absentTuple },
      completeParentTaxonomy()
    );

    expect(verdict).not.toBe("impossible");
    expect(verdict).toBe("unknown");
  });

  it("does not let the child's silence close the parent's scope either", () => {
    // The tuple the parent *does* list, asked of the child: unknown, because
    // gen2-5 has no entry — not `existed` borrowed from gen2.
    expect(
      classifyCombination(
        {
          gen: "gen2-5",
          market: "us",
          year: 1998,
          engine: "test-engine-alpha",
          transmission: "test-gearbox-alpha",
          transferCase: "test-tcase-alpha",
        },
        completeParentTaxonomy()
      )
    ).toBe("unknown");
  });
});

describe("expansion still chooses which scopes a fitment is checked against", () => {
  /**
   * Both scopes closed, and neither lists the queried gearbox — so every
   * candidate is impossible and the fitment must fail. The point of the
   * fixture is that the *child's* scope is one of the candidates for a fitment
   * that only names the parent.
   */
  function bothScopesCompleteTaxonomy() {
    return buildTaxonomy([
      {
        id: "gen2",
        kind: "generation",
        production: { from: 1991, to: 1999 },
        marketNames: [{ market: "us", name: "Montero" }],
      },
      {
        id: "gen2-5",
        kind: "generation",
        parentGeneration: "gen2",
        production: { from: 1997, to: 1999 },
        marketNames: [{ market: "us", name: "Montero" }],
      },
      { id: "us", kind: "market" },
      { id: "test-engine-alpha", kind: "engine" },
      { id: "test-gearbox-alpha", kind: "transmission" },
      { id: "test-gearbox-beta", kind: "transmission" },
      { id: "test-tcase-alpha", kind: "transfer-case" },
      {
        id: "combos-gen2-us",
        kind: "combination",
        generation: "gen2",
        market: "us",
        coverage: "complete",
        offerings: [
          {
            years: { from: 1991, to: 1996 },
            engine: "test-engine-alpha",
            transmission: "test-gearbox-alpha",
            transferCase: "test-tcase-alpha",
          },
        ],
      },
      {
        id: "combos-gen2-5-us",
        kind: "combination",
        generation: "gen2-5",
        market: "us",
        coverage: "complete",
        offerings: [
          {
            years: { from: 1997, to: 1999 },
            engine: "test-engine-alpha",
            transmission: "test-gearbox-alpha",
            transferCase: "test-tcase-alpha",
          },
        ],
      },
    ]);
  }

  const impossibleEverywhere = {
    gens: ["gen2"],
    markets: ["us"],
    engines: ["test-engine-alpha"],
    transmissions: ["test-gearbox-beta"],
    transferCases: ["test-tcase-alpha"],
  };

  it("interrogates the child scope for a fitment naming only the parent", () => {
    const issues = validateEntryFitments(
      [makeFitmentEntry(impossibleEverywhere)],
      bothScopesCompleteTaxonomy()
    );

    expect(codes(issues)).toEqual(["impossible-combination"]);
    // The message names both scopes: proof the expansion happened and that
    // each scope answered for itself rather than one answering for both.
    expect(issues[0]?.message).toContain("gen2 × us");
    expect(issues[0]?.message).toContain("gen2-5 × us");
  });

  it("accepts when the child's scope survives and the parent's does not", () => {
    // Existential impossibility (ratified 2026-08-30) meeting exact scoping:
    // gen2's world is closed against this 1998 window, gen2-5's is not.
    const entry = makeFitmentEntry({
      ...impossibleEverywhere,
      transmissions: ["test-gearbox-alpha"],
      years: { from: 1998, to: 1998 },
    });

    expect(
      validateEntryFitments([entry], bothScopesCompleteTaxonomy())
    ).toEqual([]);
  });
});

describe("the decision holds across a real gen2-5 vehicle query (FIT-04)", () => {
  const facelift: VehicleSelection = {
    gen: "gen2-5",
    market: "jdm",
    year: 1998,
    engine: "6g74-gdi",
  };

  it("never answers `impossible` anywhere in today's content", () => {
    // Every real combination entry is honestly `partial`, so no scoping choice
    // can produce a rejection today. This is the guard that says so.
    expect(classifyCombination(facelift, realTaxonomy())).not.toBe(
      "impossible"
    );
    expect(
      classifyCombination({ ...facelift, gen: "gen2" }, realTaxonomy())
    ).not.toBe("impossible");
  });
});
