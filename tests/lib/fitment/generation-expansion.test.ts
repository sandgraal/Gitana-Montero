/**
 * Graders — `gen2-5`'s `parentGeneration: "gen2"`, expanded by the resolver.
 *
 * `src/schemas/vehicles.ts` hands this task to T203 in as many words:
 *
 * > `gen2-5` is the 1997 facelift. Spec §2 files it under Gen 2, but FIT-04
 * > requires a 1999 vehicle to be able to match "both Gen 2.5 and Gen 3", so
 * > it needs an id a fitment can name. It is therefore a generation id whose
 * > entry declares `parentGeneration: "gen2"`; the containment is content,
 * > stated once, and the resolver (T203) is what expands `gens: ["gen2"]` to
 * > its children.
 *
 * Containment runs one way only, and that asymmetry is the whole grader:
 *
 * - A fact scoped to **Gen 2** is a fact about the facelift too — the
 *   facelift *is* a Gen 2 truck (spec §2: "Gen 2 (V20/V40, 1991–2000, incl.
 *   Gen 2.5 facelift 1997–)"). So `gens: ["gen2"]` must match a `gen2-5`
 *   vehicle, or every pre-facelift-authored entry silently stops applying to
 *   half the generation.
 * - A fact scoped to **Gen 2.5** is not a fact about all of Gen 2. So
 *   `gens: ["gen2-5"]` must not match a `gen2` vehicle: the reverse direction
 *   would publish a facelift-only claim to owners of 1991 trucks, which is the
 *   confident-wrong-answer failure this taxonomy is built to avoid.
 *
 * Both the direct API (`expandGenerations`) and the observable behaviour
 * (`matchesVehicle`) are graded, because either can be right while the other
 * is wrong: an expansion nobody calls is dead code, and a match rule that
 * hardcodes `gen2-5` bypasses the content that states the containment.
 *
 * ## Expected-failure convention
 *
 * `it.fails` is the marker; T203 activates a grader by deleting exactly that
 * `.fails`. Full note in `tests/lib/fitment/resolution.test.ts`.
 *
 * refs specs/001-foundation (FIT-04, VEH-01, VEH-02)
 */
import { describe, expect, it } from "vitest";
import {
  buildTaxonomy,
  expandGenerations,
  matchesVehicle,
  type VehicleSelection,
} from "../../../src/lib/fitment/index.ts";
import { readVehicleEntries } from "../../fixtures/fitment-fixtures.ts";

const realTaxonomy = () => buildTaxonomy(readVehicleEntries());

const expandedAt = (gens: string[]): string[] =>
  [...expandGenerations(gens, realTaxonomy())].sort();

const GEN2_TRUCK: VehicleSelection = {
  gen: "gen2",
  market: "jdm",
  year: 1995,
  engine: "6g72-sohc",
};

const GEN25_TRUCK: VehicleSelection = {
  gen: "gen2-5",
  market: "jdm",
  year: 1998,
  engine: "6g74-gdi",
};

const GEN3_TRUCK: VehicleSelection = {
  gen: "gen3",
  market: "us",
  year: 2002,
  engine: "6g74-sohc",
};

describe("expandGenerations follows parentGeneration downwards (VEH-01)", () => {
  it("expands `gen2` to itself and its facelift child", () => {
    expect(expandedAt(["gen2"])).toEqual(["gen2", "gen2-5"]);
  });

  it("does not expand `gen2-5` upwards to its parent", () => {
    expect(expandedAt(["gen2-5"])).toEqual(["gen2-5"]);
  });

  it.each<[string]>([["gen1"], ["gen3"], ["gen4"]])(
    "leaves %s alone — it has no children in the taxonomy",
    (gen) => {
      expect(expandedAt([gen])).toEqual([gen]);
    }
  );

  it("expands each id of a multi-generation fitment", () => {
    expect(expandedAt(["gen2", "gen3"])).toEqual(["gen2", "gen2-5", "gen3"]);
  });

  it("returns each generation once when parent and child are both named", () => {
    expect(expandedAt(["gen2", "gen2-5"])).toEqual(["gen2", "gen2-5"]);
  });

  it("returns nothing for an empty list", () => {
    expect(expandedAt([])).toEqual([]);
  });
});

describe("the observable contract through matchesVehicle (FIT-04)", () => {
  it("a gen2-scoped entry applies to a gen2-5 vehicle", () => {
    expect(
      matchesVehicle({ gens: ["gen2"] }, GEN25_TRUCK, realTaxonomy())
    ).toBe(true);
  });

  it("a gen2-5-scoped entry does NOT apply to a gen2 vehicle", () => {
    expect(
      matchesVehicle({ gens: ["gen2-5"] }, GEN2_TRUCK, realTaxonomy())
    ).toBe(false);
  });

  it("a gen2-scoped entry still applies to a plain gen2 vehicle", () => {
    expect(matchesVehicle({ gens: ["gen2"] }, GEN2_TRUCK, realTaxonomy())).toBe(
      true
    );
  });

  it("a gen2-5-scoped entry applies to a gen2-5 vehicle", () => {
    expect(
      matchesVehicle({ gens: ["gen2-5"] }, GEN25_TRUCK, realTaxonomy())
    ).toBe(true);
  });

  it.each<[string, string[]]>([
    ["gen2", ["gen2"]],
    ["gen2-5", ["gen2-5"]],
  ])("a %s-scoped entry never leaks onto a gen3 vehicle", (_label, gens) => {
    expect(matchesVehicle({ gens }, GEN3_TRUCK, realTaxonomy())).toBe(false);
  });

  it("expansion respects the other facets of the fitment", () => {
    const taxonomy = realTaxonomy();

    // Inheriting the parent's generation must not inherit a market the entry
    // never claimed: `gen2` expanded to `gen2-5` is still `us`-only here.
    expect(
      matchesVehicle({ gens: ["gen2"], markets: ["us"] }, GEN25_TRUCK, taxonomy)
    ).toBe(false);
    expect(
      matchesVehicle(
        { gens: ["gen2"], markets: ["jdm"] },
        GEN25_TRUCK,
        taxonomy
      )
    ).toBe(true);
  });
});
