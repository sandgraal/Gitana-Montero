/**
 * The generation tags a listing renders, after T204 routed them through the
 * fitment engine.
 *
 * ## What changed, and what did not
 *
 * The community directory used to render `fitment.gens` verbatim. It now
 * renders `expandGenerations(fitment.gens, taxonomy)` — the engine's own
 * reading of which generations a fitment covers — for the same reason the
 * generation *facet* was re-pointed (T703a review): two answers to "which
 * generations is this for" are one answer too many.
 *
 * That is a presentation change, so it is graded here rather than left to be
 * noticed. **On today's merged content it renders identically**: every
 * community entry already lists all five generation ids explicitly, or a
 * single generation with no facelift child, so nothing on the page moved. The
 * change bites the first time an entry says `gens: ["gen2"]` and means it —
 * which two glossary entries already do — and this file is what makes that
 * moment graded instead of surprising.
 *
 * Both assertions matter and they pull in opposite directions: expansion has
 * to happen downwards (a Gen 2 fact covers the facelift truck) and must never
 * happen upwards (a facelift-only fact is not a fact about all of Gen 2).
 *
 * refs specs/001-foundation (FIT-01, VEH-01, COM-01)
 */
import { describe, expect, it } from "vitest";

import { LOCALES, type Locale } from "../../src/i18n/routing.ts";
import { generationLabel, t } from "../../src/i18n/ui.ts";
import {
  buildTaxonomy,
  expandGenerations,
} from "../../src/lib/fitment/index.ts";
import { loadContent } from "../../src/lib/fitment/content.ts";
import { selectorTaxonomyData } from "../../src/lib/vehicle-taxonomy.ts";
import {
  GENERATION_IDS,
  type GenerationId,
} from "../../src/schemas/vehicles.ts";

const { taxonomyEntries, entries } = await loadContent();

/** The real taxonomy, through the same projection the pages ship. */
const taxonomy = buildTaxonomy(
  selectorTaxonomyData(
    taxonomyEntries as Parameters<typeof selectorTaxonomyData>[0]
  ).nodes
);

/** Exactly the composition `[communitySegment].astro` performs for its tags. */
function tagsFor(gens: readonly string[], locale: Locale): string[] {
  const strings = t(locale);
  return expandGenerations(gens, taxonomy).map((id) =>
    (GENERATION_IDS as readonly string[]).includes(id)
      ? generationLabel(strings, id as GenerationId)
      : id
  );
}

describe("generation tags", () => {
  it.each(LOCALES)(
    "expands a parent generation to its facelift in %s",
    (locale) => {
      const strings = t(locale);

      expect(tagsFor(["gen2"], locale)).toEqual([
        generationLabel(strings, "gen2"),
        generationLabel(strings, "gen2-5"),
      ]);
    }
  );

  it("never expands a facelift up to its parent", () => {
    expect(tagsFor(["gen2-5"], "en")).toEqual(["Gen 2.5"]);
  });

  it("leaves a generation with no children alone", () => {
    expect(tagsFor(["gen3"], "en")).toEqual(["Gen 3"]);
    expect(tagsFor(["gen1"], "en")).toEqual(["Gen 1"]);
  });

  it("renders in chronological order, not the order the entry listed them", () => {
    expect(tagsFor(["gen3", "gen1", "gen2"], "en")).toEqual([
      "Gen 1",
      "Gen 2",
      "Gen 2.5",
      "Gen 3",
    ]);
  });

  it("labels every generation differently in the two locales", () => {
    // The no-identical-pairs rule, at the one place these five strings are
    // actually composed into a page.
    for (const gen of GENERATION_IDS) {
      expect(generationLabel(t("en"), gen)).not.toBe(
        generationLabel(t("es"), gen)
      );
    }
  });

  /**
   * The honest record of the change's blast radius today. If this ever fails,
   * content has landed that the expansion visibly affects — which is fine and
   * expected, and the case above is what says the new rendering is correct.
   */
  it("changes no community entry's tags on today's content", () => {
    const community = entries.filter(
      (entry) => entry.collection === "community"
    );
    expect(community.length).toBeGreaterThan(0);

    for (const entry of community) {
      const gens =
        (entry.data as { fitment?: { gens?: string[] } }).fitment?.gens ?? [];
      expect(
        [...expandGenerations(gens, taxonomy)].sort(),
        `${entry.file} expands beyond what it lists`
      ).toEqual([...gens].sort());
    }
  });
});
