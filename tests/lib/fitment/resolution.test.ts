/**
 * Graders — FIT-04, "does entry E apply to vehicle V", answered
 * deterministically against the real merged taxonomy.
 *
 * > **FIT-04** THE fitment engine SHALL answer "does entry E apply to vehicle
 * > V" deterministically, with boundary-year tests (e.g. a 1999 vehicle
 * > matching both Gen 2.5 and Gen 3 where production overlapped).
 *
 * The boundary-year half lives in `boundary-years.test.ts`; this file grades
 * the query semantics and determinism. Every expectation is derived from
 * spec §2's fitment shape ("`{gens, markets?, years?, engines?,
 * transmissions?, transferCases?, trims?, drive?}` … an entry's fitment names
 * every vehicle its facts apply to"), from FIT-03's definition of a selection
 * ("gen + market + year + engine"), and from `src/schemas/vehicles.ts`'s
 * ruling that an omitted facet is no restriction:
 *
 * > `fitment.markets` is optional in the base fitment shape, where omitting it
 * > correctly means "no market restriction" — a torque figure applies in every
 * > market.
 *
 * The vehicles used are real: the project truck (spec §2, "2002 Mitsubishi
 * Montero, Gen 3, 6G74 SOHC 3.5L"), a Gen 2.5 JDM truck and a Gen 2 JDM
 * truck, each of which exists in T201's combination data.
 *
 * ## Expected-failure convention (read before editing)
 *
 * Every grader below is declared `it.fails(...)` / `it.fails.each(...)`.
 * `src/lib/fitment/index.ts` is a T202 seam stub, so each body throws today
 * and Vitest records the test as passing *because it failed*. The marker is
 * the literal text `.fails` on the `it` line — nothing else. That today's
 * throw is the seam throw, and not a typo'd import, is the job of the separate
 * canary in `tests/lib/fitment/seam-contract.test.ts`.
 *
 * T203 activates a grader by **deleting exactly that `.fails`** and nothing
 * else. Leaving one on after the seam is implemented turns the suite red
 * ("expected test to fail"), so activation cannot be forgotten silently.
 * Implementers must not otherwise edit this file (AGENTS.md separation rule,
 * audited by T901).
 *
 * refs specs/001-foundation (FIT-01, FIT-03, FIT-04)
 */
import { describe, expect, it } from "vitest";
import {
  buildTaxonomy,
  entryAppliesTo,
  matchesVehicle,
  type VehicleSelection,
} from "../../../src/lib/fitment/index.ts";
import {
  makeFitmentEntry,
  readVehicleEntries,
  shuffled,
} from "../../fixtures/fitment-fixtures.ts";

/**
 * Built inside each test, never at module scope: at module scope the seam
 * stub's throw would abort collection and report an unhandled suite error
 * instead of a clean expected failure.
 */
const realTaxonomy = () => buildTaxonomy(readVehicleEntries());

/**
 * Fitment queries are typed structurally here, not as the schema's inferred
 * `Fitment`: `matchesVehicle` takes `unknown` so that T203 can narrow its own
 * parameter type without an implementer ever editing a test file.
 */
type YearWindow = { from?: number; to?: number };
type FitmentQuery = Record<string, unknown>;

/** Spec §2, "The truck": 2002 Montero, Gen 3, 6G74 SOHC, US market. */
const TRUCK: VehicleSelection = {
  gen: "gen3",
  market: "us",
  year: 2002,
  engine: "6g74-sohc",
  transmission: "automatic-5-speed",
  transferCase: "super-select-ii",
  trim: "limited",
};

/** A 1998 JDM Gen 2.5 — `combos-gen2-5-jdm` lists this exact powertrain. */
const JDM_GEN25: VehicleSelection = {
  gen: "gen2-5",
  market: "jdm",
  year: 1998,
  engine: "6g74-gdi",
  transmission: "automatic-5-speed",
  transferCase: "super-select",
};

/** A 1995 JDM Gen 2 — `combos-gen2-jdm` lists this exact powertrain. */
const JDM_GEN2: VehicleSelection = {
  gen: "gen2",
  market: "jdm",
  year: 1995,
  engine: "6g72-sohc",
  transmission: "manual-5-speed",
  transferCase: "super-select",
};

describe("matchesVehicle: gens (FIT-04)", () => {
  it.fails("matches a vehicle of the generation the fitment names", () => {
    expect(matchesVehicle({ gens: ["gen3"] }, TRUCK, realTaxonomy())).toBe(
      true
    );
  });

  it.fails("does not match a vehicle of another generation", () => {
    expect(matchesVehicle({ gens: ["gen4"] }, TRUCK, realTaxonomy())).toBe(
      false
    );
  });

  it.fails("matches when the vehicle's generation is one of several", () => {
    expect(
      matchesVehicle({ gens: ["gen1", "gen3", "gen4"] }, TRUCK, realTaxonomy())
    ).toBe(true);
  });
});

describe("matchesVehicle: an omitted facet is no restriction (VEH-03 note)", () => {
  it.fails.each<[string, VehicleSelection]>([
    ["us", TRUCK],
    ["jdm", JDM_GEN25],
  ])(
    "a fitment with no `markets` applies in the %s market too",
    (_market, vehicle) => {
      const gens = [vehicle.gen];

      expect(matchesVehicle({ gens }, vehicle, realTaxonomy())).toBe(true);
    }
  );

  it.fails("a fitment with no `years` applies in every production year", () => {
    const taxonomy = realTaxonomy();

    expect(
      matchesVehicle({ gens: ["gen3"] }, { ...TRUCK, year: 2001 }, taxonomy)
    ).toBe(true);
    expect(
      matchesVehicle({ gens: ["gen3"] }, { ...TRUCK, year: 2005 }, taxonomy)
    ).toBe(true);
  });

  it.fails("a fitment with no `engines` applies to every engine", () => {
    expect(
      matchesVehicle(
        { gens: ["gen3"] },
        { ...TRUCK, engine: "6g75" },
        realTaxonomy()
      )
    ).toBe(true);
  });
});

describe("matchesVehicle: markets (FIT-03, FIT-04)", () => {
  it.fails("matches when the vehicle's market is named", () => {
    expect(
      matchesVehicle({ gens: ["gen3"], markets: ["us"] }, TRUCK, realTaxonomy())
    ).toBe(true);
  });

  it.fails("does not match when the vehicle's market is not named", () => {
    expect(
      matchesVehicle(
        { gens: ["gen3"], markets: ["jdm", "au"] },
        TRUCK,
        realTaxonomy()
      )
    ).toBe(false);
  });
});

describe("matchesVehicle: years (FIT-04)", () => {
  it.fails.each<[string, YearWindow, boolean]>([
    ["a closed window containing the year", { from: 2001, to: 2002 }, true],
    ["a closed window ending before it", { from: 1999, to: 2001 }, false],
    ["a closed window starting after it", { from: 2003, to: 2006 }, false],
    ["an open-ended `from` at or before it", { from: 1999 }, true],
    ["an open-ended `from` after it", { from: 2003 }, false],
    ["an open-ended `to` at or after it", { to: 2002 }, true],
    ["an open-ended `to` before it", { to: 2001 }, false],
  ])("%s resolves as expected for a 2002 truck", (_label, years, expected) => {
    expect(
      matchesVehicle({ gens: ["gen3"], years }, TRUCK, realTaxonomy())
    ).toBe(expected);
  });

  it.fails("treats both ends of a year window as inclusive", () => {
    const taxonomy = realTaxonomy();
    const fitment = { gens: ["gen3"], years: { from: 2001, to: 2004 } };

    expect(matchesVehicle(fitment, { ...TRUCK, year: 2001 }, taxonomy)).toBe(
      true
    );
    expect(matchesVehicle(fitment, { ...TRUCK, year: 2004 }, taxonomy)).toBe(
      true
    );
    expect(matchesVehicle(fitment, { ...TRUCK, year: 2000 }, taxonomy)).toBe(
      false
    );
    expect(matchesVehicle(fitment, { ...TRUCK, year: 2005 }, taxonomy)).toBe(
      false
    );
  });
});

describe("matchesVehicle: engines (FIT-03, FIT-04)", () => {
  it.fails("matches when the vehicle's engine is named", () => {
    expect(
      matchesVehicle(
        { gens: ["gen3"], engines: ["6g74-sohc", "6g75"] },
        TRUCK,
        realTaxonomy()
      )
    ).toBe(true);
  });

  it.fails("does not match when the vehicle's engine is not named", () => {
    expect(
      matchesVehicle(
        { gens: ["gen3"], engines: ["6g75"] },
        TRUCK,
        realTaxonomy()
      )
    ).toBe(false);
  });
});

describe("matchesVehicle: every facet must hold at once (FIT-04)", () => {
  it.fails("matches a fully specified fitment naming the truck", () => {
    expect(
      matchesVehicle(
        {
          gens: ["gen3"],
          markets: ["us"],
          years: { from: 2001, to: 2006 },
          engines: ["6g74-sohc"],
          transmissions: ["automatic-5-speed"],
          transferCases: ["super-select-ii"],
          trims: ["limited"],
        },
        TRUCK,
        realTaxonomy()
      )
    ).toBe(true);
  });

  it.fails.each<[string, FitmentQuery]>([
    ["gens", { gens: ["gen2"] }],
    ["markets", { markets: ["jdm"] }],
    ["years", { years: { from: 2004, to: 2006 } }],
    ["engines", { engines: ["6g75"] }],
    ["transmissions", { transmissions: ["manual-5-speed"] }],
    ["transferCases", { transferCases: ["easy-select"] }],
    ["trims", { trims: ["xls"] }],
  ])(
    "does not match when only `%s` disagrees with the vehicle",
    (_facet, override) => {
      const fitment = {
        gens: ["gen3"],
        markets: ["us"],
        years: { from: 2001, to: 2006 },
        engines: ["6g74-sohc"],
        transmissions: ["automatic-5-speed"],
        transferCases: ["super-select-ii"],
        trims: ["limited"],
        ...override,
      };

      expect(matchesVehicle(fitment, TRUCK, realTaxonomy())).toBe(false);
    }
  );
});

describe("entryAppliesTo is matchesVehicle over an entry's own fitment (FIT-04)", () => {
  it.fails.each<[string, FitmentQuery, VehicleSelection, boolean]>([
    ["the truck's own generation", { gens: ["gen3"] }, TRUCK, true],
    ["another generation", { gens: ["gen1"] }, TRUCK, false],
    [
      "a JDM-scoped fitment",
      { gens: ["gen2"], markets: ["jdm"] },
      JDM_GEN2,
      true,
    ],
    [
      "a JDM-scoped fitment on a US truck",
      { gens: ["gen3"], markets: ["jdm"] },
      TRUCK,
      false,
    ],
  ])(
    "%s answers alike through both entry points",
    (_label, fitment, vehicle, expected) => {
      const taxonomy = realTaxonomy();
      const entry = makeFitmentEntry(fitment);

      expect(entryAppliesTo(entry, vehicle, taxonomy)).toBe(expected);
      expect(entryAppliesTo(entry, vehicle, taxonomy)).toBe(
        matchesVehicle(fitment, vehicle, taxonomy)
      );
    }
  );
});

describe("determinism (FIT-04)", () => {
  it.fails("returns the same answer for the same query, every time", () => {
    const taxonomy = realTaxonomy();
    const fitment = { gens: ["gen2"], markets: ["jdm"], years: { to: 1996 } };

    const answers = new Set(
      Array.from({ length: 25 }, () =>
        matchesVehicle(fitment, JDM_GEN2, taxonomy)
      )
    );

    expect([...answers]).toEqual([true]);
  });

  it.fails("does not depend on the order entries were indexed in", () => {
    const entries = readVehicleEntries();
    const fitment = { gens: ["gen2"], markets: ["jdm"] };

    const answers = [1, 2, 3, 4, 5].map((seed) =>
      matchesVehicle(fitment, JDM_GEN25, buildTaxonomy(shuffled(entries, seed)))
    );

    // gen2-5 is a child of gen2, so the honest answer is `true`; what this
    // grader pins is that it is the *same* answer whatever order the taxonomy
    // was built in — a resolver that stopped at the first matching entry would
    // pass a single-order test and flake here.
    expect(answers).toEqual([true, true, true, true, true]);
  });

  it.fails("does not mutate the fitment or the vehicle it is given", () => {
    const taxonomy = realTaxonomy();
    const fitment = { gens: ["gen3"], markets: ["us"] };
    const vehicle = { ...TRUCK };

    matchesVehicle(fitment, vehicle, taxonomy);

    expect(fitment).toEqual({ gens: ["gen3"], markets: ["us"] });
    expect(vehicle).toEqual(TRUCK);
  });
});

describe("fitment.drive — open ruling, not a grader (tasks.md T203)", () => {
  it.fails(
    "a fitment with no `drive` key resolves on gens and markets alone",
    () => {
      const taxonomy = realTaxonomy();
      const withoutDrive = { gens: ["gen3"], markets: ["us"] };

      // The one thing that follows from the spec without a ruling: today every
      // entry omits `drive`, so resolution is decided entirely by the facets
      // that do have a taxonomy. This is not a comparison against a `drive`-
      // bearing fitment — no such comparison can be written until the ruling
      // lands, which is what the skip below records.
      expect(matchesVehicle(withoutDrive, TRUCK, taxonomy)).toBe(true);
      expect(matchesVehicle(withoutDrive, JDM_GEN2, taxonomy)).toBe(false);
    }
  );

  /*
   * RULING NEEDED — do not activate this test; T203 must not invent the
   * vocabulary it would need.
   *
   * spec §2's fitment shape includes `drive`, and `fitmentSchema` in
   * `src/schemas/entry.ts` carries it as an optional id list. VEH-01 defines
   * no drive taxonomy: there is no `kind: "drive"` node, no closed enum, and
   * nothing in the spec says whether "drive" means 4WD/2WD, the transfer-case
   * mode, or the driveline layout. tasks.md T203 records this as an open item
   * — "needs a ruling, not an invented vocabulary".
   *
   * Until the owner rules, T202 pins nothing about a *present* `drive` list.
   * Whoever resolves the ruling replaces this skip with real graders (and a
   * boundary table over whatever vocabulary is ratified) in a task that owns
   * the decision.
   */
  it.skip("RULING NEEDED: what a present `fitment.drive` resolves against", () => {
    expect.unreachable("blocked on the fitment.drive ruling (tasks.md T203)");
  });
});

describe("under-specified selections — open question, not a grader", () => {
  /*
   * OPEN QUESTION for T203's design (raised by T202, no ruling in the spec).
   *
   * FIT-03 fixes a selection as "gen + market + year + engine", so
   * `VehicleSelection` requires exactly those four. Every grader in this file
   * therefore states any facet it goes on to restrict. What the spec does not
   * say is what should happen when a fitment restricts `transmissions`,
   * `transferCases` or `trims` and the visitor's selection is silent about
   * them: hiding the entry withholds information the reader may need, and
   * showing it asserts a fitment the selection never satisfied. Both readings
   * are defensible and the choice is user-facing (FIT-03's listing filter),
   * so T202 will not settle it by grader.
   *
   * T203 must state its choice in `src/lib/fitment/`'s docstring and add the
   * graders for it in that task's own test pass.
   */
  it.skip("OPEN: a fitment restricting a facet the selection omits", () => {
    expect.unreachable(
      "T203 decides show-or-hide for facets absent from the selection (FIT-03)"
    );
  });
});
