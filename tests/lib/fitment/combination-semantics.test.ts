/**
 * Graders — VEH-03's four resolver rules, one named test each.
 *
 * `src/schemas/vehicles.ts` documents them as normative and hands them to
 * this task, quoted here so a reviewer never has to guess which reading a
 * grader encodes:
 *
 * > 1. **A tuple absent from a `coverage: "complete"` entry is impossible.**
 * >    `complete` is a claim that the sourced offerings are the *whole* list
 * >    for that generation and market … Rejectable.
 * > 2. **A tuple absent from a `coverage: "partial"` entry is unknown.** The
 * >    entry only claims that what it lists existed. Never rejectable.
 * > 3. **A (generation, market) pair with no combination entry at all is
 * >    unknown, never impossible.** … answering "that vehicle never existed"
 * >    because nobody has typed it up yet is a confident wrong answer on the
 * >    spine.
 * > 4. **An offering's `trims` is an assertion about every trim listed;**
 * >    omitting it means "not recorded at trim granularity" — unknown, not
 * >    impossible, and unaffected by `coverage`, which is a claim about the
 * >    offering list and not about any offering's internals.
 *
 * And the reason all four matter more than they look:
 *
 * > The asymmetry is deliberate: a wrong *impossible* silently hides a real
 * > vehicle from a reader who owns it, while a wrong *unknown* only fails to
 * > catch a typo.
 *
 * Each rule gets its negative and its positive control side by side: an
 * implementation that answered `"unknown"` to everything would satisfy rules
 * 2, 3 and 4 and is caught by rule 1 and by the `"existed"` controls; one that
 * answered `"impossible"` for every unlisted tuple is caught by rules 2, 3
 * and 4. Inverting any one rule turns exactly one pair red.
 *
 * ## Why a synthetic taxonomy
 *
 * Every combination entry in `src/content/vehicles/` is honestly
 * `coverage: "partial"` today, so rule 1 is not gradeable against real
 * content and no grader may edit content to make itself convenient. The
 * fixture in `tests/fixtures/fitment-fixtures.ts` is the smallest taxonomy in
 * which all four rules are separable; the canary asserts it is schema-valid
 * and that real content still claims nothing stronger than `partial`.
 *
 * ## Expected-failure convention
 *
 * `it.fails` is the marker; T203 activates a grader by deleting exactly that
 * `.fails`. Full note in `tests/lib/fitment/resolution.test.ts`.
 *
 * refs specs/001-foundation (VEH-03, FIT-02, FIT-04)
 */
import { describe, expect, it } from "vitest";
import {
  buildTaxonomy,
  classifyCombination,
  type VehicleSelection,
} from "../../../src/lib/fitment/index.ts";
import {
  SYNTHETIC,
  makeSyntheticTaxonomyEntries,
  readVehicleEntries,
  shuffled,
} from "../../fixtures/fitment-fixtures.ts";

const syntheticTaxonomy = () => buildTaxonomy(makeSyntheticTaxonomyEntries());

/** The four facets FIT-03 fixes as a selection; the rest come from the table. */
type PartialSelection = Pick<
  VehicleSelection,
  "gen" | "market" | "year" | "engine"
>;

/** The tuple offering A of the `complete` gen3 × us entry lists, 2001–2006. */
const listedInComplete: VehicleSelection = {
  gen: "gen3",
  market: "us",
  year: 2002,
  engine: SYNTHETIC.engineListed,
  transmission: SYNTHETIC.gearboxListed,
  transferCase: SYNTHETIC.transferCase,
};

describe("rule 1 — absent from a `complete` entry is IMPOSSIBLE (VEH-03)", () => {
  it.fails("rejects a powertrain the complete entry does not list", () => {
    // Every id here exists in the taxonomy: this is a combination question,
    // not an unknown-id question (FIT-02 names those separately).
    expect(
      classifyCombination(
        { ...listedInComplete, transmission: SYNTHETIC.gearboxUnlisted },
        syntheticTaxonomy()
      )
    ).toBe("impossible");
  });

  it.fails(
    "rejects a listed powertrain outside the years it was offered",
    () => {
      // The late-only offering runs 2003–2006; a 2002 example of it never left
      // the factory, and `complete` is what licenses saying so.
      expect(
        classifyCombination(
          {
            gen: "gen3",
            market: "us",
            year: 2002,
            engine: SYNTHETIC.engineLateOnly,
            transmission: SYNTHETIC.gearboxListed,
            transferCase: SYNTHETIC.transferCase,
          },
          syntheticTaxonomy()
        )
      ).toBe("impossible");
    }
  );

  it.fails("accepts the tuple the complete entry does list", () => {
    expect(classifyCombination(listedInComplete, syntheticTaxonomy())).toBe(
      "existed"
    );
  });

  it.fails("accepts the late-only tuple inside its own year range", () => {
    expect(
      classifyCombination(
        {
          gen: "gen3",
          market: "us",
          year: 2004,
          engine: SYNTHETIC.engineLateOnly,
          transmission: SYNTHETIC.gearboxListed,
          transferCase: SYNTHETIC.transferCase,
        },
        syntheticTaxonomy()
      )
    ).toBe("existed");
  });
});

describe("rule 2 — absent from a `partial` entry is UNKNOWN (VEH-03)", () => {
  it.fails("does not reject a powertrain the partial entry omits", () => {
    const verdict = classifyCombination(
      {
        gen: "gen3",
        market: "cr",
        year: 2002,
        engine: SYNTHETIC.engineLateOnly,
        transmission: SYNTHETIC.gearboxListed,
        transferCase: SYNTHETIC.transferCase,
      },
      syntheticTaxonomy()
    );

    expect(verdict).not.toBe("impossible");
    expect(verdict).toBe("unknown");
  });

  it.fails("accepts the tuple the partial entry does list", () => {
    expect(
      classifyCombination(
        { ...listedInComplete, market: "cr" },
        syntheticTaxonomy()
      )
    ).toBe("existed");
  });

  it.fails("answers the same absent tuple differently by coverage", () => {
    const taxonomy = syntheticTaxonomy();
    const absent = {
      ...listedInComplete,
      transmission: SYNTHETIC.gearboxUnlisted,
    };

    // Identical tuple, identical year, different `coverage` — this pair is the
    // whole reason `coverage` is a required field with no default.
    expect(classifyCombination({ ...absent, market: "us" }, taxonomy)).toBe(
      "impossible"
    );
    expect(classifyCombination({ ...absent, market: "cr" }, taxonomy)).toBe(
      "unknown"
    );
  });
});

describe("rule 3 — no combination entry at all is UNKNOWN (VEH-03)", () => {
  it.fails.each<[string, string, string, number]>([
    ["gen2 × us, a scope nobody has written up", "gen2", "us", 1995],
    ["gen2 × cr, likewise", "gen2", "cr", 1995],
    ["gen2-5 × us, the facelift in an unwritten market", "gen2-5", "us", 1998],
  ])("%s is unknown, never impossible", (_label, gen, market, year) => {
    const verdict = classifyCombination(
      {
        gen,
        market,
        year,
        engine: SYNTHETIC.engineListed,
        transmission: SYNTHETIC.gearboxListed,
        transferCase: SYNTHETIC.transferCase,
      },
      syntheticTaxonomy()
    );

    expect(verdict).not.toBe("impossible");
    expect(verdict).toBe("unknown");
  });

  it.fails(
    "stays unknown even for a tuple another scope calls impossible",
    () => {
      const taxonomy = syntheticTaxonomy();
      const tuple = {
        engine: SYNTHETIC.engineListed,
        transmission: SYNTHETIC.gearboxUnlisted,
        transferCase: SYNTHETIC.transferCase,
      };

      // A closed world in one (generation, market) says nothing about another:
      // completeness is scoped to the entry, not global.
      expect(
        classifyCombination(
          { gen: "gen3", market: "us", year: 2002, ...tuple },
          taxonomy
        )
      ).toBe("impossible");
      expect(
        classifyCombination(
          { gen: "gen2", market: "us", year: 1995, ...tuple },
          taxonomy
        )
      ).toBe("unknown");
    }
  );
});

describe("rule 4 — `trims` is never closed by `coverage` (VEH-03)", () => {
  it.fails(
    "a trim question against an offering with no `trims` is unknown",
    () => {
      // Offering B of the *complete* entry omits `trims`. "Unaffected by
      // `coverage`, which is a claim about the offering list and not about any
      // offering's internals" — so the strongest available answer is "not
      // recorded".
      const verdict = classifyCombination(
        {
          gen: "gen3",
          market: "us",
          year: 2004,
          engine: SYNTHETIC.engineLateOnly,
          transmission: SYNTHETIC.gearboxListed,
          transferCase: SYNTHETIC.transferCase,
          trim: SYNTHETIC.trimUnlisted,
        },
        syntheticTaxonomy()
      );

      expect(verdict).not.toBe("impossible");
      expect(verdict).toBe("unknown");
    }
  );

  it.fails("a trim the offering does list existed", () => {
    expect(
      classifyCombination(
        { ...listedInComplete, trim: SYNTHETIC.trimListed },
        syntheticTaxonomy()
      )
    ).toBe("existed");
  });

  it.fails(
    "a trim absent from a listed `trims` is unknown, not impossible",
    () => {
      // Offering A lists exactly one trim, inside a `complete` entry. Listing
      // trims asserts those trims existed; it does not close the list, and
      // `coverage` does not close it either. So neither "existed" nor
      // "impossible" is supported by the data.
      const verdict = classifyCombination(
        { ...listedInComplete, trim: SYNTHETIC.trimUnlisted },
        syntheticTaxonomy()
      );

      expect(verdict).not.toBe("impossible");
      expect(verdict).toBe("unknown");
    }
  );

  it.fails(
    "asking no trim question still answers the powertrain question",
    () => {
      // Positive control for the three above: dropping `trim` must not change
      // the powertrain verdict in either direction.
      const taxonomy = syntheticTaxonomy();

      expect(classifyCombination(listedInComplete, taxonomy)).toBe("existed");
      expect(
        classifyCombination(
          { ...listedInComplete, transmission: SYNTHETIC.gearboxUnlisted },
          taxonomy
        )
      ).toBe("impossible");
    }
  );
});

describe("classifyCombination is deterministic (FIT-04)", () => {
  it.fails("gives one answer per query, whatever the index order", () => {
    const entries = makeSyntheticTaxonomyEntries();

    const verdicts = [3, 9, 21, 42].map((seed) =>
      classifyCombination(
        { ...listedInComplete, transmission: SYNTHETIC.gearboxUnlisted },
        buildTaxonomy(shuffled(entries, seed))
      )
    );

    expect(verdicts).toEqual([
      "impossible",
      "impossible",
      "impossible",
      "impossible",
    ]);
  });
});

describe("the same rules over T201's real taxonomy (VEH-03)", () => {
  const realTaxonomy = () => buildTaxonomy(readVehicleEntries());

  it.fails("recognises a tuple `combos-gen3-us` really lists", () => {
    // 2002 US Limited: 6G74 SOHC + 5-speed auto + Super Select II.
    expect(
      classifyCombination(
        {
          gen: "gen3",
          market: "us",
          year: 2002,
          engine: "6g74-sohc",
          transmission: "automatic-5-speed",
          transferCase: "super-select-ii",
        },
        realTaxonomy()
      )
    ).toBe("existed");
  });

  it.fails.each<[string, PartialSelection]>([
    [
      "a tuple absent from the partial gen3 × us entry",
      { gen: "gen3", market: "us", year: 2002, engine: "4m41" },
    ],
    [
      "a market with no combination entry at all (cr)",
      { gen: "gen3", market: "cr", year: 2002, engine: "6g74-sohc" },
    ],
  ])("%s is unknown, never impossible", (_label, partial) => {
    // Every real combination entry is `coverage: "partial"`, so nothing in
    // today's content licenses an `impossible`. The day a sourced `complete`
    // entry lands, this grader is what says so out loud.
    const verdict = classifyCombination(
      {
        transmission: "automatic-5-speed",
        transferCase: "super-select-ii",
        ...partial,
      },
      realTaxonomy()
    );

    expect(verdict).not.toBe("impossible");
    expect(verdict).toBe("unknown");
  });
});
