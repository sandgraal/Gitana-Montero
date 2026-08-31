/**
 * Graders — FIT-02, build-time resolution of every declared fitment.
 *
 * > **FIT-02** WHEN an entry declares a fitment, THE build SHALL resolve it
 * > against the taxonomy and fail on any reference to a nonexistent ID or an
 * > impossible combination (per VEH-03).
 *
 * Three separable claims, graded separately:
 *
 * 1. **Nonexistent ids are an error, not a silent non-match.** This is the
 *    failure mode the requirement exists to prevent: an entry whose fitment
 *    says `engines: ["6g47-sohc"]` matches no vehicle at all, so a resolver
 *    that only answered "does it match" would ship a page nobody can ever
 *    reach and no test would notice. The build has to *say so*.
 * 2. **Ids resolve by kind.** `src/schemas/vehicles.ts`: "References between
 *    taxonomy nodes are `(kind, id)` pairs — `offerings[].engine` resolves
 *    against `engine` entries only — so an id need only be unique within its
 *    kind." A real id in the wrong slot is as wrong as an invented one.
 * 3. **Impossible combinations fail; unknown ones do not.** VEH-03 rules 1–3,
 *    graded here as build outcomes rather than as verdicts (that is
 *    `combination-semantics.test.ts`'s job). The asymmetry is the whole point:
 *    "Never rejectable" in rule 2 is a claim about the *build*.
 *
 * Every negative has its positive control in the same describe block, and the
 * strongest control of all is the last one: T201's 46 merged entries — plus
 * every other entry in `src/content/` — must validate clean. A grader that
 * rejects real, correct content is a broken grader, and this is where that
 * shows up.
 *
 * SCF-04 ("names the file and the field") is graded on the issue `path`, not
 * merely on the presence of an issue: a build error that says only "a fitment
 * is wrong somewhere" is not the error the spec asks for.
 *
 * ## Expected-failure convention
 *
 * `it.fails` is the marker; T203 activates a grader by deleting exactly that
 * `.fails`. Full note in `tests/lib/fitment/resolution.test.ts`.
 *
 * refs specs/001-foundation (FIT-01, FIT-02, VEH-03, SCF-04)
 */
import { describe, expect, it } from "vitest";
import {
  assertFitmentsResolve,
  buildTaxonomy,
  validateEntryFitments,
  type FitmentIssue,
} from "../../../src/lib/fitment/index.ts";
import {
  SYNTHETIC,
  makeFitmentEntry,
  makeSyntheticTaxonomyEntries,
  readAllContentEntries,
  readVehicleEntries,
} from "../../fixtures/fitment-fixtures.ts";

const realTaxonomy = () => buildTaxonomy(readVehicleEntries());
const syntheticTaxonomy = () => buildTaxonomy(makeSyntheticTaxonomyEntries());

/** Dotted issue paths, so a grader can name the field like SCF-04 requires. */
const paths = (issues: readonly FitmentIssue[]): string[] =>
  issues.map((issue) => issue.path.map(String).join("."));

const codes = (issues: readonly FitmentIssue[]): string[] =>
  issues.map((issue) => issue.code);

/* -------------------------------------------------------------------------
 * 1. Nonexistent ids
 * ---------------------------------------------------------------------- */

describe("nonexistent ids are a build error (FIT-02)", () => {
  it.each<[string, Record<string, unknown>, string]>([
    ["gens", { gens: ["gen9"] }, "fitment.gens.0"],
    ["markets", { gens: ["gen3"], markets: ["mars"] }, "fitment.markets.0"],
    [
      "engines",
      { gens: ["gen3"], engines: ["6g47-sohc"] },
      "fitment.engines.0",
    ],
    [
      "transmissions",
      { gens: ["gen3"], transmissions: ["automatic-9-speed"] },
      "fitment.transmissions.0",
    ],
    [
      "transferCases",
      { gens: ["gen3"], transferCases: ["super-select-iv"] },
      "fitment.transferCases.0",
    ],
    [
      "trims",
      { gens: ["gen3"], trims: ["platinum-edition"] },
      "fitment.trims.0",
    ],
  ])(
    "an unknown `%s` id is reported at its own path",
    (_facet, fitment, expectedPath) => {
      const entry = makeFitmentEntry(fitment);

      const issues = validateEntryFitments([entry], realTaxonomy());

      expect(codes(issues)).toContain("unknown-id");
      expect(paths(issues)).toContain(expectedPath);
      expect(issues[0]?.entryId).toBe("test-fitment-alpha");
    }
  );

  it("names the offending id in the message", () => {
    const entry = makeFitmentEntry({ gens: ["gen3"], engines: ["6g47-sohc"] });

    const issues = validateEntryFitments([entry], realTaxonomy());

    expect(issues.map((issue) => issue.message).join("\n")).toContain(
      "6g47-sohc"
    );
  });

  it("reports the second bad id as well as the first", () => {
    // Returned rather than thrown so one build reports every bad fitment; a
    // resolver that stops at the first issue makes fixing content a game of
    // whack-a-mole.
    const entry = makeFitmentEntry({
      gens: ["gen9"],
      engines: ["6g47-sohc"],
    });

    const issues = validateEntryFitments([entry], realTaxonomy());

    expect(paths(issues)).toContain("fitment.gens.0");
    expect(paths(issues)).toContain("fitment.engines.0");
  });

  it("accepts the same fitment once every id is real", () => {
    const entry = makeFitmentEntry({
      gens: ["gen3"],
      markets: ["us"],
      engines: ["6g74-sohc"],
      transmissions: ["automatic-5-speed"],
      transferCases: ["super-select-ii"],
      trims: ["limited"],
    });

    expect(validateEntryFitments([entry], realTaxonomy())).toEqual([]);
  });

  it("is an error even though no vehicle could ever match it", () => {
    // The point of FIT-02: a nonexistent id is not "matches nothing", it is
    // "this entry is wrong". Silence here is a page the site can never reach.
    const entry = makeFitmentEntry({ gens: ["gen3"], engines: ["6g47-sohc"] });

    expect(validateEntryFitments([entry], realTaxonomy())).not.toEqual([]);
  });
});

describe("ids resolve against their own kind (VEH-01)", () => {
  it.each<[string, Record<string, unknown>, string]>([
    [
      "a generation id in `engines`",
      { gens: ["gen3"], engines: ["gen3"] },
      "fitment.engines.0",
    ],
    [
      "an engine id in `transmissions`",
      { gens: ["gen3"], transmissions: ["6g74-sohc"] },
      "fitment.transmissions.0",
    ],
    [
      "a trim id in `transferCases`",
      { gens: ["gen3"], transferCases: ["limited"] },
      "fitment.transferCases.0",
    ],
    ["a market id in `gens`", { gens: ["us"] }, "fitment.gens.0"],
    [
      "a combination id in `gens`",
      { gens: ["combos-gen3-us"] },
      "fitment.gens.0",
    ],
  ])("%s is an unknown id", (_label, fitment, expectedPath) => {
    const issues = validateEntryFitments(
      [makeFitmentEntry(fitment)],
      realTaxonomy()
    );

    expect(codes(issues)).toContain("unknown-id");
    expect(paths(issues)).toContain(expectedPath);
  });

  it("accepts each of those ids in the slot it belongs to", () => {
    const taxonomy = realTaxonomy();

    expect(
      validateEntryFitments(
        [
          makeFitmentEntry({
            gens: ["gen3"],
            markets: ["us"],
            engines: ["6g74-sohc"],
            transferCases: ["super-select-ii"],
            trims: ["limited"],
          }),
        ],
        taxonomy
      )
    ).toEqual([]);
  });
});

/* -------------------------------------------------------------------------
 * 2. Impossible combinations
 * ---------------------------------------------------------------------- */

describe("impossible combinations fail the build (FIT-02, VEH-03 rule 1)", () => {
  it("rejects a fitment whose every candidate tuple is impossible", () => {
    // gen3 × us is `coverage: "complete"` in the synthetic taxonomy and does
    // not list this gearbox with this engine at any year.
    const entry = makeFitmentEntry({
      gens: ["gen3"],
      markets: ["us"],
      engines: [SYNTHETIC.engineListed],
      transmissions: [SYNTHETIC.gearboxUnlisted],
      transferCases: [SYNTHETIC.transferCase],
    });

    const issues = validateEntryFitments([entry], syntheticTaxonomy());

    expect(codes(issues)).toContain("impossible-combination");
    expect(issues[0]?.entryId).toBe("test-fitment-alpha");
  });

  it("accepts a fitment where one candidate tuple did exist", () => {
    // Same entry plus the gearbox the complete entry does list: a fitment is a
    // query over a set of vehicles, so it is only impossible when *nothing* it
    // names could have existed. RATIFIED as a ruling in the T202 review
    // (2026-08-30) and recorded on tasks.md's T203 line — the existential
    // quantifier is the contract, not an implementation detail.
    const entry = makeFitmentEntry({
      gens: ["gen3"],
      markets: ["us"],
      engines: [SYNTHETIC.engineListed],
      transmissions: [SYNTHETIC.gearboxUnlisted, SYNTHETIC.gearboxListed],
      transferCases: [SYNTHETIC.transferCase],
    });

    expect(validateEntryFitments([entry], syntheticTaxonomy())).toEqual([]);
  });

  it("accepts the tuple the complete entry lists", () => {
    const entry = makeFitmentEntry({
      gens: ["gen3"],
      markets: ["us"],
      engines: [SYNTHETIC.engineListed],
      transmissions: [SYNTHETIC.gearboxListed],
      transferCases: [SYNTHETIC.transferCase],
    });

    expect(validateEntryFitments([entry], syntheticTaxonomy())).toEqual([]);
  });
});

describe("unknown combinations never fail the build (VEH-03 rules 2 and 3)", () => {
  it("accepts a tuple absent from a `partial` entry", () => {
    // Identical shape to the rejected fitment above, in the market whose
    // combination entry is `partial`. "The entry only claims that what it
    // lists existed. Never rejectable."
    const entry = makeFitmentEntry({
      gens: ["gen3"],
      markets: ["cr"],
      engines: [SYNTHETIC.engineListed],
      transmissions: [SYNTHETIC.gearboxUnlisted],
      transferCases: [SYNTHETIC.transferCase],
    });

    expect(validateEntryFitments([entry], syntheticTaxonomy())).toEqual([]);
  });

  it("accepts a (generation, market) pair with no combination entry", () => {
    // "Missing scope belongs in the gaps report (GAP-01), not in a build
    // error."
    const entry = makeFitmentEntry({
      gens: ["gen2"],
      markets: ["us"],
      engines: [SYNTHETIC.engineListed],
      transmissions: [SYNTHETIC.gearboxUnlisted],
      transferCases: [SYNTHETIC.transferCase],
    });

    expect(validateEntryFitments([entry], syntheticTaxonomy())).toEqual([]);
  });

  it("accepts a trim the offering does not list (VEH-03 rule 4)", () => {
    // `coverage` is "a claim about the offering list and not about any
    // offering's internals", so an unlisted trim is unknown and unknown is
    // never a build error — even inside the complete entry.
    const entry = makeFitmentEntry({
      gens: ["gen3"],
      markets: ["us"],
      engines: [SYNTHETIC.engineListed],
      transmissions: [SYNTHETIC.gearboxListed],
      transferCases: [SYNTHETIC.transferCase],
      trims: [SYNTHETIC.trimUnlisted],
    });

    expect(validateEntryFitments([entry], syntheticTaxonomy())).toEqual([]);
  });
});

/* -------------------------------------------------------------------------
 * 3. The build path
 * ---------------------------------------------------------------------- */

describe("assertFitmentsResolve is the build path (FIT-02)", () => {
  it("throws on an entry whose fitment names a nonexistent id", () => {
    const bad = makeFitmentEntry(
      { gens: ["gen3"], engines: ["6g47-sohc"] },
      "test-fitment-bogus"
    );

    expect(() => assertFitmentsResolve([bad], realTaxonomy())).toThrow(
      /6g47-sohc/
    );
  });

  it("names the entry and the field it failed on (SCF-04)", () => {
    const bad = makeFitmentEntry(
      { gens: ["gen3"], engines: ["6g47-sohc"] },
      "test-fitment-bogus"
    );

    expect(() => assertFitmentsResolve([bad], realTaxonomy())).toThrow(
      /test-fitment-bogus/
    );
    expect(() => assertFitmentsResolve([bad], realTaxonomy())).toThrow(
      /engines/
    );
  });

  it("throws on an impossible combination too", () => {
    const bad = makeFitmentEntry(
      {
        gens: ["gen3"],
        markets: ["us"],
        engines: [SYNTHETIC.engineListed],
        transmissions: [SYNTHETIC.gearboxUnlisted],
        transferCases: [SYNTHETIC.transferCase],
      },
      "test-fitment-impossible"
    );

    expect(() => assertFitmentsResolve([bad], syntheticTaxonomy())).toThrow(
      /test-fitment-impossible/
    );
  });

  it("does not throw when every fitment resolves", () => {
    const good = makeFitmentEntry({ gens: ["gen3"], markets: ["us"] });

    expect(() => assertFitmentsResolve([good], realTaxonomy())).not.toThrow();
  });

  it("reports one bad entry among many, and says which", () => {
    const good = makeFitmentEntry({ gens: ["gen3"] }, "test-fitment-good");
    const bad = makeFitmentEntry(
      { gens: ["gen3"], markets: ["mars"] },
      "test-fitment-bad"
    );

    const issues = validateEntryFitments([good, bad, good], realTaxonomy());

    expect(issues.map((issue) => issue.entryId)).toEqual(["test-fitment-bad"]);
  });
});

/* -------------------------------------------------------------------------
 * 4. The real corpus
 * ---------------------------------------------------------------------- */

describe("real content resolves clean (FIT-02 positive control)", () => {
  it("every entry in T201's merged vehicle taxonomy validates", () => {
    const entries = readVehicleEntries();

    expect(validateEntryFitments(entries, buildTaxonomy(entries))).toEqual([]);
  });

  it("every fitment-declaring entry in every collection validates", () => {
    // The taxonomy is the vehicles collection; the fitments being resolved are
    // every entry the site ships. A grader that only checked the taxonomy
    // against itself would miss exactly the entries FIT-02 is written for.
    expect(
      validateEntryFitments(readAllContentEntries(), realTaxonomy())
    ).toEqual([]);
  });

  it("the build path passes on today's content", () => {
    expect(() =>
      assertFitmentsResolve(readAllContentEntries(), realTaxonomy())
    ).not.toThrow();
  });

  it("turns red the moment one bogus entry joins that corpus", () => {
    // The pair that makes the control above meaningful: clean content passing
    // proves nothing unless dirty content fails in the same call.
    const corpus = [
      ...readAllContentEntries(),
      makeFitmentEntry({ gens: ["gen9"] }, "test-fitment-intruder"),
    ];

    const issues = validateEntryFitments(corpus, realTaxonomy());

    expect(issues.map((issue) => issue.entryId)).toEqual([
      "test-fitment-intruder",
    ]);
  });
});
