/**
 * T202 canary — **T203 deletes this whole file.**
 *
 * Every other grader in `tests/lib/fitment/` is marked `it.fails`: it is
 * expected to throw today because `src/lib/fitment/index.ts` is a seam stub.
 * That marker is only honest if the throw is the *seam* throw — a grader
 * failing for some unrelated reason looks identical in the Vitest report and
 * would leave a green suite guarding an empty promise.
 *
 * **What catches what** (corrected after the T202 review, which measured it):
 * a typo'd import path or a renamed export is caught by `astro check`, not by
 * this file — TypeScript reports it as ts(2724)/ts(2307) and `npm run verify`
 * stops before Vitest ever runs. What this file catches is the class the type
 * checker cannot see: **fixture breakage** (content moved or renamed on disk,
 * a synthetic entry that has quietly stopped being schema-valid, the 1999
 * overlap disappearing from T201's data) and **drift in the agreed seam
 * message** the other graders' expectations are written against.
 *
 * So this file is the positive control for the whole task, with no marker on
 * any test. It asserts that the seam module resolves, exports every symbol the
 * graders import, and fails with the agreed `not implemented: T203` message —
 * and that the fixtures those graders stand on are real, schema-valid taxonomy
 * data. If any of it goes red, the `it.fails` markers elsewhere are lying.
 *
 * ## Activation (T203)
 *
 * Once the seam is implemented these assertions become false — the stubs no
 * longer throw — so this file must be deleted in the same commit that
 * implements them. It is self-enforcing: leaving it behind turns `npm test`
 * red.
 *
 * refs specs/001-foundation (FIT-01, FIT-02, FIT-04, VEH-03)
 */
import { describe, expect, it } from "vitest";
import { z } from "astro/zod";
import {
  FITMENT_ISSUE_CODES,
  SEAM_NOT_IMPLEMENTED,
  assertFitmentsResolve,
  buildTaxonomy,
  classifyCombination,
  entryAppliesTo,
  expandGenerations,
  generationsInProduction,
  matchesVehicle,
  validateEntryFitments,
  type Taxonomy,
  type VehicleSelection,
} from "../../../src/lib/fitment/index.ts";
import { vehiclesEntrySchema } from "../../../src/schemas/vehicles.ts";
import { issuePaths } from "../../helpers/schema-outcome.ts";
import {
  makeSyntheticTaxonomyEntries,
  readAllContentEntries,
  readVehicleEntries,
  shuffled,
} from "../../fixtures/fitment-fixtures.ts";

const seamError = new RegExp(SEAM_NOT_IMPLEMENTED);

const anyTaxonomy: Taxonomy = {};

const anyVehicle: VehicleSelection = {
  gen: "gen3",
  market: "us",
  year: 2002,
  engine: "6g74-sohc",
};

describe("T202 seam contract (delete this file in T203)", () => {
  it("agrees on the seam message the other graders rely on", () => {
    expect(SEAM_NOT_IMPLEMENTED).toBe("not implemented: T203");
  });

  it("names the two failure classes FIT-02 requires, in FIT-02's order", () => {
    expect([...FITMENT_ISSUE_CODES]).toEqual([
      "unknown-id",
      "impossible-combination",
    ]);
  });

  it.each<[string, () => unknown]>([
    ["buildTaxonomy", () => buildTaxonomy([])],
    ["expandGenerations", () => expandGenerations(["gen2"], anyTaxonomy)],
    [
      "generationsInProduction",
      () => generationsInProduction(1999, anyTaxonomy),
    ],
    ["classifyCombination", () => classifyCombination(anyVehicle, anyTaxonomy)],
    ["matchesVehicle", () => matchesVehicle({}, anyVehicle, anyTaxonomy)],
    ["entryAppliesTo", () => entryAppliesTo({}, anyVehicle, anyTaxonomy)],
    ["validateEntryFitments", () => validateEntryFitments([], anyTaxonomy)],
    ["assertFitmentsResolve", () => assertFitmentsResolve([], anyTaxonomy)],
  ])(
    "src/lib/fitment exports %s as an unimplemented T202 seam",
    (_name, touch) => {
      expect(touch).toThrow(seamError);
    }
  );
});

describe("T202 fixture integrity (delete this file in T203)", () => {
  it("reads T201's merged vehicle taxonomy off disk", () => {
    const entries = readVehicleEntries();

    expect(entries.length).toBeGreaterThanOrEqual(46);
    expect(entries.map((entry) => entry.id)).toContain("gen2-5");
    expect(entries.map((entry) => entry.id)).toContain("combos-gen3-us");
  });

  it("finds the 1999 Gen 2.5 / Gen 3 overlap FIT-04 names in the real data", () => {
    const byId = new Map(readVehicleEntries().map((e) => [e.id, e]));
    const production = (id: string) =>
      (byId.get(id) as { production?: { from: number; to: number | null } })
        .production;

    // The boundary-year tables are only meaningful if the real spans really
    // do overlap at 1999. If T201's data ever changes, this fails here rather
    // than as a mysterious resolver grader.
    expect(production("gen2-5")).toEqual({ from: 1997, to: 1999 });
    expect(production("gen3")).toEqual({ from: 1999, to: 2006 });
    expect(byId.get("gen2-5")).toMatchObject({ parentGeneration: "gen2" });
  });

  it("reads every collection's fitment-declaring entries", () => {
    const entries = readAllContentEntries();

    expect(entries.length).toBeGreaterThan(readVehicleEntries().length);
    expect(entries.every((entry) => entry.fitment !== undefined)).toBe(true);
  });

  it("`shuffled` really reorders, keeps every element, and is seed-stable", () => {
    // The determinism graders are only meaningful if the "different index
    // order" they claim to build is actually different. A `shuffled` that
    // silently returned its input would make every one of those graders pass
    // while proving nothing — and being a fixture helper, no type checker and
    // no it.fails marker would ever notice.
    const input = Array.from({ length: 20 }, (_, i) => `entry-${i}`);

    const a = shuffled(input, 1);
    const b = shuffled(input, 2);

    expect([...a].sort()).toEqual([...input].sort());
    expect(a).not.toEqual(input);
    expect(a).not.toEqual(b);
    expect(shuffled(input, 1)).toEqual(a);
    expect(input[0]).toBe("entry-0");
  });

  it.each(
    makeSyntheticTaxonomyEntries().map((entry) => [entry.id, entry] as const)
  )("the synthetic taxonomy entry %s is schema-valid", (_id, entry) => {
    const schema = vehiclesEntrySchema({
      title: z.string(),
      summary: z.string(),
    });

    const outcome = schema.safeParse(entry);

    expect(issuePaths(outcome)).toEqual([]);
    expect(outcome.success).toBe(true);
  });

  it("is the only place `coverage: complete` exists — real content is honest", () => {
    const real = readVehicleEntries().filter(
      (entry) => entry.kind === "combination"
    );
    const synthetic = makeSyntheticTaxonomyEntries().filter(
      (entry) => entry.kind === "combination"
    );

    // If a real combination entry ever claims `complete`, VEH-03 rule 1
    // becomes gradeable against real data and this fixture should shrink.
    expect(real.map((entry) => entry.coverage)).not.toContain("complete");
    expect(synthetic.map((entry) => entry.coverage)).toContain("complete");
    expect(synthetic.map((entry) => entry.coverage)).toContain("partial");
  });
});
