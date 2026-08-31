/**
 * The selector's option lists (T204, FIT-03) and the projection they are built
 * from.
 *
 * The behaviour under test is one rule stated three ways: **only `impossible`
 * is filtered out.** `existed` and `unknown` are both offered, in labelled
 * groups, because VEH-03's whole asymmetry is that "not listed" and "never
 * existed" are different answers and only the second one licenses hiding a
 * truck from the person who owns it.
 *
 * Fixtures rather than real content on purpose: every combination entry in the
 * corpus today is honestly `coverage: "partial"`, so nothing in it can produce
 * an `impossible` verdict at all (the T203 review's F3 warning). A gate whose
 * positive control cannot fire is not a gate.
 *
 * refs specs/001-foundation (FIT-03, VEH-02, VEH-03)
 */
import { describe, expect, it } from "vitest";

import {
  createVehicleOptions,
  selectionIsOfferable,
  type SelectorTaxonomyData,
} from "../../src/lib/vehicle-options.ts";
import { selectorTaxonomyData } from "../../src/lib/vehicle-taxonomy.ts";

/**
 * Two generations, two engines, and one **closed** US scope for Gen 3 that
 * lists the SOHC petrol V6 and nothing else — so the diesel is genuinely
 * `impossible` there and the same diesel is merely `unknown` in the CR scope
 * nobody has written up.
 */
const ENTRIES = [
  {
    id: "gen2",
    kind: "generation",
    production: { from: 1991, to: 1999 },
    chassisCodes: ["V20", "V40"],
    marketNames: [
      { market: "us", name: "Montero" },
      { market: "jdm", name: "Pajero" },
    ],
    fitment: { gens: ["gen2"] },
  },
  {
    id: "gen3",
    kind: "generation",
    production: { from: 1999, to: 2006 },
    chassisCodes: ["V60", "V70", "V73W"],
    marketNames: [
      { market: "us", name: "Montero" },
      { market: "cr", name: "Montero" },
    ],
    fitment: { gens: ["gen3"] },
  },
  {
    id: "gen4",
    kind: "generation",
    // An open span: no source states an end year.
    production: { from: 2006, to: null },
    chassisCodes: ["V80", "V90"],
    marketNames: [{ market: "jdm", name: "Pajero" }],
    fitment: { gens: ["gen4"] },
  },
  {
    id: "6g74-sohc",
    kind: "engine",
    engineFamily: "6g74",
    displacementCc: 3497,
    valvetrain: "sohc",
    fuelSystem: "mpi",
    fitment: { gens: ["gen3"] },
  },
  {
    id: "4m41",
    kind: "engine",
    engineFamily: "4m41",
    displacementCc: 3200,
    valvetrain: "dohc",
    fuelSystem: "di-d",
    fitment: { gens: ["gen3"] },
  },
  {
    id: "6g72-sohc",
    kind: "engine",
    engineFamily: "6g72",
    displacementCc: 2972,
    valvetrain: "sohc",
    // Gen 2 only: never offered in the generation the tests select.
    fitment: { gens: ["gen2"] },
  },
  {
    id: "combos-gen3-us",
    kind: "combination",
    generation: "gen3",
    market: "us",
    coverage: "complete",
    offerings: [
      {
        years: { from: 1999, to: 2006 },
        engine: "6g74-sohc",
        transmission: "automatic-4-speed",
        transferCase: "super-select-ii",
      },
    ],
    fitment: { gens: ["gen3"], markets: ["us"] },
  },
];

const data: SelectorTaxonomyData = selectorTaxonomyData(ENTRIES);
const options = createVehicleOptions(data, new Date("2026-08-30T00:00:00Z"));

describe("selectorTaxonomyData", () => {
  it("orders generations chronologically, not by filename", () => {
    expect(data.generations.map((entry) => entry.id)).toEqual([
      "gen2",
      "gen3",
      "gen4",
    ]);
  });

  it("carries only what the fitment engine and the chrome need", () => {
    const gen3 = data.generations.find((entry) => entry.id === "gen3");
    expect(gen3?.chassisCodes).toEqual(["V60", "V70", "V73W"]);
    expect(gen3?.markets).toEqual([
      { id: "us", name: "Montero" },
      { id: "cr", name: "Montero" },
    ]);
  });

  it("keeps fuelSystem, the only thing separating two same-family engines", () => {
    const engine = data.engines.find((entry) => entry.id === "4m41");
    expect(engine?.fuelSystem).toBe("di-d");
  });

  it("carries no prose into the payload", () => {
    // The payload is shared `data` only; every translated word is looked up
    // by the component in the page's own locale (AGENTS.md).
    expect(JSON.stringify(data)).not.toContain("prose");
  });
});

describe("marketsFor", () => {
  it("offers the markets the generation says it was sold in (VEH-02)", () => {
    expect(options.marketsFor("gen3").map((market) => market.id)).toEqual([
      "us",
      "cr",
    ]);
  });

  it("offers nothing for a generation the taxonomy does not have", () => {
    expect(options.marketsFor("gen9")).toEqual([]);
  });
});

describe("yearsFor", () => {
  it("spans the recorded production years inclusively", () => {
    expect(options.yearsFor("gen3")).toEqual([
      1999, 2000, 2001, 2002, 2003, 2004, 2005, 2006,
    ]);
  });

  it("reads an open span as running to today, never inventing an end year", () => {
    const years = options.yearsFor("gen4");
    expect(years[0]).toBe(2006);
    expect(years.at(-1)).toBe(2026);
  });
});

describe("enginesFor", () => {
  it("groups a listed powertrain as recorded", () => {
    const choices = options.enginesFor("gen3", "us", 2002);
    const sohc = choices.find((choice) => choice.option.id === "6g74-sohc");
    expect(sohc?.recorded).toBe(true);
  });

  it("filters out a powertrain a complete scope excludes (VEH-03 rule 1)", () => {
    // `combos-gen3-us` is `complete` and does not list the diesel, so for a
    // US Gen 3 the taxonomy positively says it never existed.
    const choices = options.enginesFor("gen3", "us", 2002);
    expect(choices.map((choice) => choice.option.id)).not.toContain("4m41");
  });

  it("offers the same powertrain as unknown in an unwritten scope (rule 3)", () => {
    // Nobody has written up Gen 3 in Costa Rica. That is a gap, not a claim.
    const choices = options.enginesFor("gen3", "cr", 2002);
    const diesel = choices.find((choice) => choice.option.id === "4m41");
    expect(diesel).toBeDefined();
    expect(diesel?.recorded).toBe(false);
  });

  it("never offers an engine whose own fitment excludes the generation", () => {
    const choices = options.enginesFor("gen3", "cr", 2002);
    expect(choices.map((choice) => choice.option.id)).not.toContain(
      "6g72-sohc"
    );
  });

  it("is deterministic — same question, same list, same order", () => {
    expect(options.enginesFor("gen3", "cr", 2002)).toEqual(
      options.enginesFor("gen3", "cr", 2002)
    );
  });
});

describe("selectionIsOfferable", () => {
  const gitana = { gen: "gen3", market: "us", year: 2002, engine: "6g74-sohc" };

  it("accepts a selection this taxonomy can still produce", () => {
    expect(selectionIsOfferable(gitana, options)).toBe(true);
  });

  it("rejects a selection whose generation is gone", () => {
    expect(selectionIsOfferable({ ...gitana, gen: "gen9" }, options)).toBe(
      false
    );
  });

  it("rejects a market the generation does not name", () => {
    expect(selectionIsOfferable({ ...gitana, market: "uk" }, options)).toBe(
      false
    );
  });

  it("rejects a year outside the generation's production", () => {
    expect(selectionIsOfferable({ ...gitana, year: 1995 }, options)).toBe(
      false
    );
  });

  it("rejects an engine the scope says never existed", () => {
    // The stale-selection guard and the option list agree by construction:
    // both ask the same question of the same engine.
    expect(selectionIsOfferable({ ...gitana, engine: "4m41" }, options)).toBe(
      false
    );
  });
});
