/**
 * Graders — FIT-02's *build path*, not just its logic.
 *
 * > **FIT-02** WHEN an entry declares a fitment, **THE build SHALL** resolve
 * > it against the taxonomy and fail on any reference to a nonexistent ID or
 * > an impossible combination (per VEH-03).
 *
 * `tests/lib/fitment/validation.test.ts` grades what `validateEntryFitments`
 * and `assertFitmentsResolve` *answer*. This file grades the thing that makes
 * those answers matter: that the build feeds them the whole corpus. The check
 * is wired in `astro.config.mjs` → `src/integrations/validate-fitments.ts` →
 * `astro:build:start`, and the input it uses comes from
 * `src/lib/fitment/content.ts`.
 *
 * The failure this guards against is a check that quietly stops covering
 * things: a loader that skipped a collection, or that drifted from
 * `src/content.config.ts`'s glob, would leave `npm run build` green while a
 * whole directory of entries went unresolved. So the loader is graded against
 * an independently-written reader — T202's `readAllContentEntries`, which
 * walks the same tree by its own code — rather than against itself.
 *
 * refs specs/001-foundation (FIT-01, FIT-02)
 */
import { describe, expect, it } from "vitest";
import {
  FitmentResolutionError,
  assertFitmentsResolve,
  buildTaxonomy,
  validateEntryFitments,
} from "../../../src/lib/fitment/index.ts";
import { loadContent } from "../../../src/lib/fitment/content.ts";
import {
  makeFitmentEntry,
  readAllContentEntries,
  readVehicleEntries,
} from "../../fixtures/fitment-fixtures.ts";

const ids = (entries: readonly { id?: unknown }[]): string[] =>
  entries.map((entry) => String(entry.id)).sort();

describe("the build sees every entry the site ships (FIT-02)", () => {
  it("loads exactly the corpus the independent fixture reader finds", async () => {
    const { entries } = await loadContent();

    expect(ids(entries.map((entry) => entry.data as { id?: unknown }))).toEqual(
      ids(readAllContentEntries())
    );
  });

  it("loads exactly the `vehicles` collection as the taxonomy", async () => {
    const { taxonomyEntries } = await loadContent();

    expect(ids(taxonomyEntries as { id?: unknown }[])).toEqual(
      ids(readVehicleEntries())
    );
  });

  it("names the file each entry came from, for SCF-04", async () => {
    const { entries } = await loadContent();
    const gen3 = entries.find(
      (entry) => (entry.data as { id?: unknown }).id === "gen3"
    );

    expect(gen3?.file).toBe("src/content/vehicles/gen3.json");
    expect(
      entries.every((entry) => entry.file.startsWith("src/content/"))
    ).toBe(true);
  });

  it("covers more than the taxonomy — the entries FIT-02 is written for", async () => {
    const { entries, taxonomyEntries } = await loadContent();

    expect(entries.length).toBeGreaterThan(taxonomyEntries.length);
  });
});

describe("what the integration actually runs (FIT-02)", () => {
  it("passes on today's content, exactly as `astro:build:start` calls it", async () => {
    const { entries, taxonomyEntries } = await loadContent();
    const taxonomy = buildTaxonomy(taxonomyEntries);

    expect(() =>
      assertFitmentsResolve(
        entries.map((entry) => entry.data),
        taxonomy
      )
    ).not.toThrow();
  });

  it("throws the moment a bogus entry joins that same corpus", async () => {
    // The pair that makes the control above meaningful — same call shape, one
    // extra entry. Without this, "the build passes" could mean "the build
    // checks nothing".
    const { entries, taxonomyEntries } = await loadContent();
    const corpus = [
      ...entries.map((entry) => entry.data),
      makeFitmentEntry({ gens: ["gen9"] }, "test-fitment-intruder"),
    ];

    expect(() =>
      assertFitmentsResolve(corpus, buildTaxonomy(taxonomyEntries))
    ).toThrow(/test-fitment-intruder/);
  });
});

describe("the thrown error carries its issues (SCF-04)", () => {
  it("exposes the structured issue list, not just a message", () => {
    // The build integration adds the *file* each failing id came from, which
    // only it knows. It matches on these ids by equality; an earlier draft
    // grepped the rendered message instead and matched the market entry `me`
    // inside the word "names".
    const taxonomy = buildTaxonomy(readVehicleEntries());
    const bad = makeFitmentEntry({ gens: ["gen9"] }, "test-fitment-bogus");

    let thrown: unknown;
    try {
      assertFitmentsResolve([bad], taxonomy);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(FitmentResolutionError);
    expect((thrown as FitmentResolutionError).issues).toEqual(
      validateEntryFitments([bad], taxonomy)
    );
    expect(
      (thrown as FitmentResolutionError).issues.map((issue) => issue.entryId)
    ).toEqual(["test-fitment-bogus"]);
  });
});
