/**
 * `provisionalMatchFacets` — what a match cost (T204, FIT-01, FIT-03).
 *
 * ## Why this function exists at all
 *
 * T203's decision (a) makes matching deliberately permissive: a facet the
 * visitor's selection is silent about is treated as unrestricted rather than
 * as a mismatch. Its own docstring accepts the cost in as many words — "a
 * listing filtered on the FIT-03 quadruple alone will show some entries that a
 * fully-specified truck would not match" — and the T203 review made that
 * acceptance conditional (F8, binding on T204): the trade-off is only safe if
 * the reader can *see* it.
 *
 * This is the function a page sees it with, and it lives in the fitment engine
 * for the same reason everything else here does: a component that re-derived
 * "did this match depend on silence?" would be reading a fitment, and a second
 * reading is a second truth (FIT-01).
 *
 * The contract, in one line: **it names exactly the facets `matchesVehicle`
 * waved through**, and it empties out the moment the visitor answers them.
 *
 * refs specs/001-foundation (FIT-01, FIT-03, FIT-04)
 */
import { describe, expect, it } from "vitest";

import {
  OPTIONAL_SELECTION_FACETS,
  buildTaxonomy,
  entryProvisionalFacets,
  matchesVehicle,
  provisionalMatchFacets,
  type VehicleSelection,
} from "../../../src/lib/fitment/index.ts";

const taxonomy = buildTaxonomy([
  { id: "gen2", kind: "generation", production: { from: 1991, to: 1999 } },
  {
    id: "gen2-5",
    kind: "generation",
    production: { from: 1997, to: 1999 },
    parentGeneration: "gen2",
  },
  { id: "gen3", kind: "generation", production: { from: 1999, to: 2006 } },
]);

/** Gitana Blanca, as FIT-03 lets a visitor describe her: the quadruple only. */
const quadruple: VehicleSelection = {
  gen: "gen3",
  market: "us",
  year: 2002,
  engine: "6g74-sohc",
};

describe("OPTIONAL_SELECTION_FACETS", () => {
  it("is exactly the facets FIT-03's quadruple leaves unanswered", () => {
    expect([...OPTIONAL_SELECTION_FACETS]).toEqual([
      "transmission",
      "transferCase",
      "trim",
      "drive",
    ]);
  });
});

describe("provisionalMatchFacets", () => {
  it("is empty when the fitment restricts nothing the visitor left unsaid", () => {
    const fitment = { gens: ["gen3"], markets: ["us"] };

    expect(matchesVehicle(fitment, quadruple, taxonomy)).toBe(true);
    expect(provisionalMatchFacets(fitment, quadruple, taxonomy)).toEqual([]);
  });

  it("names the facet a match leaned on", () => {
    const fitment = { gens: ["gen3"], transferCases: ["super-select-ii"] };

    // The entry is shown — that is decision (a) working as designed …
    expect(matchesVehicle(fitment, quadruple, taxonomy)).toBe(true);
    // … and this is the reader being told what it cost.
    expect(provisionalMatchFacets(fitment, quadruple, taxonomy)).toEqual([
      "transferCase",
    ]);
  });

  it("names several facets in a stable order", () => {
    const fitment = {
      gens: ["gen3"],
      drive: ["4wd"],
      transmissions: ["automatic-5-speed"],
      trims: ["limited"],
    };

    expect(provisionalMatchFacets(fitment, quadruple, taxonomy)).toEqual([
      "transmission",
      "trim",
      "drive",
    ]);
  });

  it("empties as the visitor narrows the selection", () => {
    const fitment = { gens: ["gen3"], drive: ["4wd"] };

    expect(provisionalMatchFacets(fitment, quadruple, taxonomy)).toEqual([
      "drive",
    ]);
    // "Narrowing the selection is what removes the indicator" (T203 review).
    expect(
      provisionalMatchFacets(fitment, { ...quadruple, drive: "4wd" }, taxonomy)
    ).toEqual([]);
  });

  it("reports nothing for an entry that does not match at all", () => {
    // A row that is not shown has no provisional-ness to report, and saying
    // otherwise would put a "provisional" mark on a filtered-out entry.
    const fitment = { gens: ["gen2"], transferCases: ["easy-select"] };

    expect(matchesVehicle(fitment, quadruple, taxonomy)).toBe(false);
    expect(provisionalMatchFacets(fitment, quadruple, taxonomy)).toEqual([]);
  });

  it("reports nothing when the visitor's answer is the mismatch", () => {
    const fitment = { gens: ["gen3"], drive: ["2wd"] };

    expect(
      matchesVehicle(fitment, { ...quadruple, drive: "4wd" }, taxonomy)
    ).toBe(false);
    expect(
      provisionalMatchFacets(fitment, { ...quadruple, drive: "4wd" }, taxonomy)
    ).toEqual([]);
  });

  it("does not treat the quadruple's own facets as provisional", () => {
    // `markets` and `engines` are always answered, so restricting them can
    // never make a match provisional — only a real match or a real miss.
    const fitment = { gens: ["gen3"], markets: ["us"], engines: ["6g74-sohc"] };

    expect(provisionalMatchFacets(fitment, quadruple, taxonomy)).toEqual([]);
  });

  it("follows parentGeneration exactly as the match does", () => {
    const fitment = { gens: ["gen2"], trims: ["gls"] };
    const facelift: VehicleSelection = {
      ...quadruple,
      gen: "gen2-5",
      year: 1998,
    };

    expect(matchesVehicle(fitment, facelift, taxonomy)).toBe(true);
    expect(provisionalMatchFacets(fitment, facelift, taxonomy)).toEqual([
      "trim",
    ]);
  });

  it("reports nothing for an unreadable fitment", () => {
    expect(provisionalMatchFacets(null, quadruple, taxonomy)).toEqual([]);
    expect(provisionalMatchFacets({}, quadruple, taxonomy)).toEqual([]);
  });

  it("is deterministic", () => {
    const fitment = { gens: ["gen3"], trims: ["limited"], drive: ["4wd"] };
    expect(provisionalMatchFacets(fitment, quadruple, taxonomy)).toEqual(
      provisionalMatchFacets(fitment, quadruple, taxonomy)
    );
  });
});

describe("entryProvisionalFacets", () => {
  it("reads the entry's fitment, pairing with entryAppliesTo", () => {
    const entry = {
      id: "problems/transfer-case-chain",
      fitment: { gens: ["gen3"], transferCases: ["super-select-ii"] },
    };

    expect(entryProvisionalFacets(entry, quadruple, taxonomy)).toEqual([
      "transferCase",
    ]);
  });

  it("reports nothing for something that is not an entry", () => {
    expect(entryProvisionalFacets("nope", quadruple, taxonomy)).toEqual([]);
  });
});
