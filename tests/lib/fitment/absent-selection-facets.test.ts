/**
 * Graders — **decision (a)**: what happens when a fitment restricts a facet
 * the visitor's selection is silent about.
 *
 * T202 raised this as an open question and refused to settle it by grader:
 *
 * > FIT-03 fixes a selection as "gen + market + year + engine" … What the spec
 * > does not say is what should happen when a fitment restricts
 * > `transmissions`, `transferCases` or `trims` and the visitor's selection is
 * > silent about them: hiding the entry withholds information the reader may
 * > need, and showing it asserts a fitment the selection never satisfied. Both
 * > readings are defensible and the choice is user-facing (FIT-03's listing
 * > filter) … T203 must state its choice in `src/lib/fitment/`'s docstring and
 * > add the graders for it in that task's own test pass.
 *
 * ## The decision
 *
 * **An absent selection facet is unrestricted: the entry is shown.** The full
 * reasoning is in `src/lib/fitment/index.ts`'s module docstring; in short,
 * hiding is the destructive answer. A visitor who said "Gen 3, US, 2002, 6G74
 * SOHC" is not asserting their truck has no transfer case — they have not said
 * which one. Hiding a Super Select II article from them withholds information
 * *and gives no signal that anything was withheld*, which is the same failure
 * VEH-03's `unknown`-over-`impossible` asymmetry exists to prevent. Showing is
 * recoverable in one click: the visitor narrows the selection and the entry
 * disappears.
 *
 * The rule is therefore symmetrical, and the symmetry is what these graders
 * pin: **a facet neither side names is not a constraint.** An omitted *fitment*
 * facet was already the documented rule (`src/schemas/vehicles.ts`: "omitting
 * it correctly means 'no market restriction'"); this extends the same reading
 * to the other side of the comparison.
 *
 * ## The accepted cost, graded rather than hidden
 *
 * A listing filtered on the FIT-03 quadruple alone shows entries a
 * fully-specified truck would not match. That is deliberate, and the last
 * describe block below states it out loud so a future reader meets the
 * trade-off rather than discovering it. T204's selector is where a visitor
 * buys precision by saying more.
 *
 * refs specs/001-foundation (FIT-03, FIT-04)
 */
import { describe, expect, it } from "vitest";
import {
  buildTaxonomy,
  matchesVehicle,
  type VehicleSelection,
} from "../../../src/lib/fitment/index.ts";
import { readVehicleEntries } from "../../fixtures/fitment-fixtures.ts";

const realTaxonomy = () => buildTaxonomy(readVehicleEntries());

/** Exactly FIT-03's quadruple and nothing more — the honest minimum. */
const QUADRUPLE: VehicleSelection = {
  gen: "gen3",
  market: "us",
  year: 2002,
  engine: "6g74-sohc",
};

/**
 * The same truck with every optional facet stated. Real ids: a 2002 US
 * Limited with the 5-speed automatic and Super Select II, which
 * `combos-gen3-us` lists.
 */
const FULLY_STATED: VehicleSelection = {
  ...QUADRUPLE,
  transmission: "automatic-5-speed",
  transferCase: "super-select-ii",
  trim: "limited",
  drive: "4wd",
};

/** One row per optional facet: the fitment restriction, and a value that misses. */
const OPTIONAL_FACETS: readonly [
  label: string,
  fitment: Record<string, unknown>,
  otherValue: Partial<VehicleSelection>,
][] = [
  [
    "transmissions",
    { gens: ["gen3"], transmissions: ["automatic-5-speed"] },
    { transmission: "manual-5-speed" },
  ],
  [
    "transferCases",
    { gens: ["gen3"], transferCases: ["super-select-ii"] },
    { transferCase: "easy-select" },
  ],
  ["trims", { gens: ["gen3"], trims: ["limited"] }, { trim: "xls" }],
  ["drive", { gens: ["gen3"], drive: ["4wd"] }, { drive: "2wd" }],
];

describe("an absent selection facet is not a constraint (decision a)", () => {
  it.each(OPTIONAL_FACETS)(
    "a fitment restricting `%s` still matches a selection silent about it",
    (_label, fitment) => {
      expect(matchesVehicle(fitment, QUADRUPLE, realTaxonomy())).toBe(true);
    }
  );

  it.each(OPTIONAL_FACETS)(
    "…and matches when the selection states the value the fitment names (`%s`)",
    (_label, fitment) => {
      expect(matchesVehicle(fitment, FULLY_STATED, realTaxonomy())).toBe(true);
    }
  );

  it.each(OPTIONAL_FACETS)(
    "…and does NOT match once the selection states a different `%s`",
    (_label, fitment, otherValue) => {
      // The control that keeps the rule from degenerating into "always true":
      // silence is unrestricted, but a stated disagreement is still a miss.
      expect(
        matchesVehicle(
          fitment,
          { ...FULLY_STATED, ...otherValue },
          realTaxonomy()
        )
      ).toBe(false);
    }
  );
});

describe("the rule is symmetrical: neither side naming it is no constraint", () => {
  it.each<[string, Partial<VehicleSelection>]>([
    ["transmission", { transmission: "manual-5-speed" }],
    ["transferCase", { transferCase: "easy-select" }],
    ["trim", { trim: "xls" }],
    ["drive", { drive: "2wd" }],
  ])(
    "a fitment silent about `%s` matches whatever the selection states",
    (_label, stated) => {
      expect(
        matchesVehicle(
          { gens: ["gen3"] },
          { ...QUADRUPLE, ...stated },
          realTaxonomy()
        )
      ).toBe(true);
    }
  );

  it("a facet neither side names is not a constraint", () => {
    expect(matchesVehicle({ gens: ["gen3"] }, QUADRUPLE, realTaxonomy())).toBe(
      true
    );
  });
});

describe("the four required facets are NOT softened by this rule (FIT-03)", () => {
  it.each<[string, Record<string, unknown>]>([
    ["gens", { gens: ["gen4"] }],
    ["markets", { gens: ["gen3"], markets: ["jdm"] }],
    ["years", { gens: ["gen3"], years: { from: 2004, to: 2006 } }],
    ["engines", { gens: ["gen3"], engines: ["6g75"] }],
  ])(
    "a disagreeing `%s` still hides the entry from the bare quadruple",
    (_label, fitment) => {
      // FIT-03 guarantees these four are always stated, so "the visitor did
      // not say" never arises for them and the decision does not reach them.
      expect(matchesVehicle(fitment, QUADRUPLE, realTaxonomy())).toBe(false);
    }
  );
});

describe("the accepted cost, stated out loud (decision a)", () => {
  it("shows an entry the fully-specified truck would not match", () => {
    // This is the trade-off in one assertion: the same fitment answers `true`
    // for the bare quadruple and `false` for the same truck once its gearbox
    // is known. Filtering on FIT-03's quadruple alone is deliberately
    // permissive; precision is bought by saying more, not by hiding.
    const taxonomy = realTaxonomy();
    const fitment = { gens: ["gen3"], transmissions: ["manual-5-speed"] };

    expect(matchesVehicle(fitment, QUADRUPLE, taxonomy)).toBe(true);
    expect(matchesVehicle(fitment, FULLY_STATED, taxonomy)).toBe(false);
  });

  it("never widens a selection that disagrees on a required facet", () => {
    // The cost is bounded: permissiveness only ever comes from silence, so no
    // amount of unstated facets can rescue a wrong generation.
    expect(
      matchesVehicle(
        { gens: ["gen2"], transmissions: ["manual-5-speed"] },
        QUADRUPLE,
        realTaxonomy()
      )
    ).toBe(false);
  });
});
