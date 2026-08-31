/**
 * Graders — `fitment.drive`, under the **owner ruling of 2026-08-30**.
 *
 * T202 deliberately pinned nothing about a *present* `drive` list: spec §2's
 * fitment shape names the facet, but VEH-01 defined no drive taxonomy, and
 * tasks.md's T203 line recorded that as "needs a ruling, not an invented
 * vocabulary". `tests/lib/fitment/resolution.test.ts` carried an `it.skip`
 * naming the open item and asking that whoever resolved the ruling replace it
 * with real graders "in a task that owns the decision". This file is that
 * replacement, and T203 is that task.
 *
 * ## What was ruled
 *
 * `drive` is a **closed two-value vocabulary, not an entity kind** — the T200
 * reviewer's suggestion, now ratified:
 *
 * - `DRIVE_TYPES = ["2wd", "4wd"]` lives in `src/schemas/vehicles.ts` beside
 *   `MARKETS` and `GENERATION_IDS`. There is no `kind: "drive"` node and no
 *   drive entry to write.
 * - `fitmentSchema`'s `drive` field validates against it, so a bogus value is
 *   caught at parse time as well as by the resolver.
 * - Resolution semantics: drive is a facet **exactly like `markets`** —
 *   omitted from a fitment means no drive restriction, and a `VehicleSelection`
 *   may carry an optional `drive`.
 *
 * The ruling names no third value on purpose, so the vocabulary itself is
 * graded below: adding one is a taxonomy change, not a content edit, and this
 * file is where that shows up.
 *
 * ## What is not graded here
 *
 * The *selection-silent* half of the facet rule (a fitment restricting `drive`
 * against a visitor who has not said which drive they own) is decision (a),
 * graded in `tests/lib/fitment/absent-selection-facets.test.ts` alongside the
 * other optional facets — it is one rule, and grading it once keeps it that
 * way. One row is repeated here as this facet's own regression.
 *
 * refs specs/001-foundation (FIT-02, FIT-04)
 */
import { describe, expect, it } from "vitest";
import {
  buildTaxonomy,
  matchesVehicle,
  validateEntryFitments,
  type FitmentIssue,
  type VehicleSelection,
} from "../../../src/lib/fitment/index.ts";
import { DRIVE_TYPES } from "../../../src/schemas/vehicles.ts";
import { fitmentSchema } from "../../../src/schemas/entry.ts";
import {
  makeFitmentEntry,
  readVehicleEntries,
} from "../../fixtures/fitment-fixtures.ts";

const realTaxonomy = () => buildTaxonomy(readVehicleEntries());

const codes = (issues: readonly FitmentIssue[]): string[] =>
  issues.map((issue) => issue.code);

const paths = (issues: readonly FitmentIssue[]): string[] =>
  issues.map((issue) => issue.path.map(String).join("."));

/** The project truck (spec §2), which is a four-wheel-drive Gen 3. */
const TRUCK: VehicleSelection = {
  gen: "gen3",
  market: "us",
  year: 2002,
  engine: "6g74-sohc",
  drive: "4wd",
};

describe("the ruled vocabulary (owner ruling 2026-08-30)", () => {
  it("is exactly `2wd` and `4wd`, in that order", () => {
    // Closed on purpose. Widening it is a taxonomy change; this grader is what
    // makes that deliberate rather than a content edit nobody reviewed.
    expect([...DRIVE_TYPES]).toEqual(["2wd", "4wd"]);
  });

  it("is what `fitmentSchema` validates `drive` against", () => {
    for (const drive of DRIVE_TYPES) {
      expect(
        fitmentSchema.safeParse({ gens: ["gen3"], drive: [drive] }).success
      ).toBe(true);
    }
    expect(
      fitmentSchema.safeParse({ gens: ["gen3"], drive: ["2wd", "4wd"] }).success
    ).toBe(true);
  });

  it.each<[string, unknown]>([
    ["an invented layout", "awd"],
    ["a transfer-case mode", "4h"],
    ["a differently-spelled 4wd", "4WD"],
    ["a prose spelling", "four-wheel-drive"],
  ])("rejects %s in `fitment.drive` at parse time", (_label, value) => {
    const outcome = fitmentSchema.safeParse({
      gens: ["gen3"],
      drive: [value],
    });

    expect(outcome.success).toBe(false);
    if (outcome.success) return;
    expect(
      outcome.error.issues.map((issue) => issue.path.map(String).join("."))
    ).toContain("drive.0");
  });
});

describe("drive resolves as a facet, exactly like `markets` (FIT-04)", () => {
  it("matches when the vehicle's drive is named", () => {
    expect(
      matchesVehicle({ gens: ["gen3"], drive: ["4wd"] }, TRUCK, realTaxonomy())
    ).toBe(true);
  });

  it("does not match when the vehicle's drive is not named", () => {
    expect(
      matchesVehicle({ gens: ["gen3"], drive: ["2wd"] }, TRUCK, realTaxonomy())
    ).toBe(false);
  });

  it("matches when the vehicle's drive is one of several", () => {
    expect(
      matchesVehicle(
        { gens: ["gen3"], drive: ["2wd", "4wd"] },
        TRUCK,
        realTaxonomy()
      )
    ).toBe(true);
  });

  it("a fitment with no `drive` applies to either drive", () => {
    const taxonomy = realTaxonomy();
    const fitment = { gens: ["gen3"] };

    expect(matchesVehicle(fitment, { ...TRUCK, drive: "4wd" }, taxonomy)).toBe(
      true
    );
    expect(matchesVehicle(fitment, { ...TRUCK, drive: "2wd" }, taxonomy)).toBe(
      true
    );
  });

  it("a drive restriction is ANDed with the other facets, not ORed", () => {
    // The positive control's negative: naming the right drive must not rescue
    // a fitment that disagrees somewhere else.
    expect(
      matchesVehicle(
        { gens: ["gen3"], markets: ["jdm"], drive: ["4wd"] },
        TRUCK,
        realTaxonomy()
      )
    ).toBe(false);
  });

  it("is unrestricted when the selection does not state a drive", () => {
    // Decision (a) — see `absent-selection-facets.test.ts` for the full rule.
    const silent: VehicleSelection = {
      gen: TRUCK.gen,
      market: TRUCK.market,
      year: TRUCK.year,
      engine: TRUCK.engine,
    };

    expect(
      matchesVehicle({ gens: ["gen3"], drive: ["2wd"] }, silent, realTaxonomy())
    ).toBe(true);
  });
});

describe("a value outside the vocabulary fails the build (FIT-02)", () => {
  it.each<[string, string]>([
    ["an invented layout", "awd"],
    ["a transfer-case mode", "4h"],
  ])("reports %s as an unknown id at its own path", (_label, value) => {
    const entry = makeFitmentEntry({ gens: ["gen3"], drive: [value] });

    const issues = validateEntryFitments([entry], realTaxonomy());

    expect(codes(issues)).toContain("unknown-id");
    expect(paths(issues)).toContain("fitment.drive.0");
    expect(issues[0]?.entryId).toBe("test-fitment-alpha");
    expect(issues.map((issue) => issue.message).join("\n")).toContain(value);
  });

  it("reports the offending entry of a list, not the whole list", () => {
    const entry = makeFitmentEntry({ gens: ["gen3"], drive: ["4wd", "awd"] });

    expect(paths(validateEntryFitments([entry], realTaxonomy()))).toEqual([
      "fitment.drive.1",
    ]);
  });

  it("accepts every ruled value", () => {
    const entry = makeFitmentEntry({
      gens: ["gen3"],
      drive: [...DRIVE_TYPES],
    });

    expect(validateEntryFitments([entry], realTaxonomy())).toEqual([]);
  });

  it("does not invent a `drive` taxonomy kind to resolve against", () => {
    // The ruling's whole point: drive is a vocabulary, not an entity kind. A
    // resolver that had quietly added a `kind: "drive"` node would accept a
    // fitment naming an entry id here.
    const entry = makeFitmentEntry({ gens: ["gen3"], drive: ["drive"] });

    expect(codes(validateEntryFitments([entry], realTaxonomy()))).toEqual([
      "unknown-id",
    ]);
  });
});
