/**
 * Graders — the boundary years FIT-04 names by hand.
 *
 * > **FIT-04** … with boundary-year tests (e.g. a 1999 vehicle matching both
 * > Gen 2.5 and Gen 3 where production overlapped).
 *
 * Every expectation below is read off T201's merged taxonomy, not invented
 * here. The `production` spans in `src/content/vehicles/`:
 *
 * | generation | span        | note                                   |
 * |------------|-------------|----------------------------------------|
 * | `gen1`     | 1982–1991   |                                        |
 * | `gen2`     | 1991–1999   | overlaps gen1 at 1991                  |
 * | `gen2-5`   | 1997–1999   | the facelift, `parentGeneration: gen2` |
 * | `gen3`     | 1999–2006   | **overlaps gen2 and gen2-5 at 1999**   |
 * | `gen4`     | 2006–2021   | overlaps gen3 at 2006                  |
 *
 * **RULING (conductor, 2026-08-30): those spans are the JDM spans, on
 * purpose** — T201's fact-checked `gen2` prose says so — so
 * `generationsInProduction` is JDM-scoped by contract, not a global
 * production calendar. The `2000 → gen3 only` row rides entirely on that
 * recorded-JDM-span contract; spec §2's "1991–2000" parenthetical is stale
 * text pending a docs alignment. Per-market production spans are a
 * gaps-report item (GAP-01), not a defect in this table.
 *
 * Three separate things are graded, because they fail separately:
 *
 * 1. `generationsInProduction(year)` — which generations a year belongs to at
 *    all. This is the question FIT-04's example asks, and the one T204's
 *    year picker has to answer.
 * 2. Inclusivity of each span's first and last year — the off-by-one that
 *    would silently drop every 1982 Gen 1 and every 2021 Gen 4.
 * 3. That a *vehicle* at an overlap year still resolves by its own
 *    generation: 1999 being ambiguous as a year does not make a 1999 Gen 3
 *    match a Gen 2.5-scoped entry.
 *
 * ## Expected-failure convention
 *
 * `it.fails` is the marker; T203 activates a grader by deleting exactly that
 * `.fails`. Full note in `tests/lib/fitment/resolution.test.ts`.
 *
 * refs specs/001-foundation (FIT-04, VEH-01)
 */
import { describe, expect, it } from "vitest";
import {
  buildTaxonomy,
  generationsInProduction,
  matchesVehicle,
  type VehicleSelection,
} from "../../../src/lib/fitment/index.ts";
import {
  readVehicleEntries,
  shuffled,
} from "../../fixtures/fitment-fixtures.ts";

const realTaxonomy = () => buildTaxonomy(readVehicleEntries());

/** Structural, for the same reason as in `resolution.test.ts`. */
type FitmentQuery = Record<string, unknown>;

/** Sorted so the table pins the *set*, leaving ordering to T203. */
const generationsAt = (year: number): string[] =>
  [...generationsInProduction(year, realTaxonomy())].sort();

describe("generationsInProduction: boundary years (FIT-04)", () => {
  it.fails.each<[string, number, string[]]>([
    ["1981, before any Montero", 1981, []],
    ["1982, gen1's first year", 1982, ["gen1"]],
    ["1990, mid-gen1", 1990, ["gen1"]],
    ["1991, gen1's last and gen2's first", 1991, ["gen1", "gen2"]],
    ["1996, gen2 before the facelift", 1996, ["gen2"]],
    ["1997, gen2-5's first year", 1997, ["gen2", "gen2-5"]],
    ["1998, mid-facelift", 1998, ["gen2", "gen2-5"]],
    [
      "1999, the Gen 2.5 / Gen 3 overlap FIT-04 names",
      1999,
      ["gen2", "gen2-5", "gen3"],
    ],
    ["2000, gen2 and gen2-5 both ended", 2000, ["gen3"]],
    ["2006, gen3's last and gen4's first", 2006, ["gen3", "gen4"]],
    ["2021, gen4's last year", 2021, ["gen4"]],
    ["2022, after production ended", 2022, []],
  ])("%s", (_label, year, expected) => {
    expect(generationsAt(year)).toEqual(expected);
  });

  it.fails("answers 1999 the same way however the taxonomy was indexed", () => {
    const entries = readVehicleEntries();

    const answers = [7, 11, 13].map((seed) =>
      [...generationsInProduction(1999, buildTaxonomy(shuffled(entries, seed)))]
        .sort()
        .join(",")
    );

    expect(new Set(answers).size).toBe(1);
    expect(answers[0]).toBe("gen2,gen2-5,gen3");
  });
});

describe("first and last year of every generation are inclusive (FIT-04)", () => {
  it.fails.each<[string, number, number]>([
    ["gen1", 1982, 1991],
    ["gen2", 1991, 1999],
    ["gen2-5", 1997, 1999],
    ["gen3", 1999, 2006],
    ["gen4", 2006, 2021],
  ])("%s covers both %i and %i", (gen, first, last) => {
    expect(generationsAt(first)).toContain(gen);
    expect(generationsAt(last)).toContain(gen);
  });

  it.fails.each<[string, number, number]>([
    ["gen1", 1981, 1992],
    ["gen2", 1990, 2000],
    ["gen2-5", 1996, 2000],
    ["gen3", 1998, 2007],
    ["gen4", 2005, 2022],
  ])("%s covers neither %i nor %i", (gen, before, after) => {
    expect(generationsAt(before)).not.toContain(gen);
    expect(generationsAt(after)).not.toContain(gen);
  });
});

describe("a 1999 vehicle still resolves by its own generation (FIT-04)", () => {
  const gen25At1999: VehicleSelection = {
    gen: "gen2-5",
    market: "jdm",
    year: 1999,
    engine: "6g74-gdi",
  };

  const gen3At1999: VehicleSelection = {
    gen: "gen3",
    market: "jdm",
    year: 1999,
    engine: "6g74-gdi",
  };

  it.fails.each<[string, FitmentQuery, boolean, boolean]>([
    ["a gen2-5 fitment", { gens: ["gen2-5"] }, true, false],
    ["a gen3 fitment", { gens: ["gen3"] }, false, true],
    ["a fitment naming both", { gens: ["gen2-5", "gen3"] }, true, true],
    ["a gen2 fitment (gen2-5 is its child)", { gens: ["gen2"] }, true, false],
  ])(
    "%s at 1999 resolves by generation, not by year",
    (_label, fitment, matchesGen25, matchesGen3) => {
      const taxonomy = realTaxonomy();

      expect(matchesVehicle(fitment, gen25At1999, taxonomy)).toBe(matchesGen25);
      expect(matchesVehicle(fitment, gen3At1999, taxonomy)).toBe(matchesGen3);
    }
  );

  it.fails(
    "year 1999 alone never widens a fitment to another generation",
    () => {
      const taxonomy = realTaxonomy();
      const fitment = { gens: ["gen3"], years: { from: 1999, to: 1999 } };

      // Both trucks are 1999 and both generations were in production; only the
      // one whose generation the fitment names may match.
      expect(matchesVehicle(fitment, gen3At1999, taxonomy)).toBe(true);
      expect(matchesVehicle(fitment, gen25At1999, taxonomy)).toBe(false);
    }
  );
});
