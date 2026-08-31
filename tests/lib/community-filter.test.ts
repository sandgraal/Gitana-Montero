/**
 * Graders — the community directory page's filter rules (T703a, COM-01, COM-02).
 *
 * T204 gave `matchesCommunityFilter` a third argument: the fitment engine's
 * taxonomy, which its generation facet now answers through instead of with a
 * bare `gens.includes` (see the module docstring). Every assertion below is
 * T703a's, unchanged; only the call sites carry the new argument, plus one
 * new case for the behaviour the re-point buys — `parentGeneration`
 * expansion, which `includes` could never have got right.
 *
 * refs specs/001-foundation (COM-01, COM-02, FIT-01)
 */
import { describe, expect, it } from "vitest";

import {
  EMPTY_COMMUNITY_FILTER,
  countCommunityMatches,
  matchesCommunityFilter,
  type CommunityFilterCard,
} from "../../src/lib/community-filter.ts";
import { buildTaxonomy } from "../../src/lib/fitment/index.ts";

/**
 * The generation half of the real taxonomy: five generations, with `gen2-5`
 * declaring `gen2` as its parent exactly as `src/content/vehicles/gen2-5.json`
 * does. Nothing else in this file's fixtures depends on the taxonomy, so
 * nothing else is in it.
 */
const taxonomy = buildTaxonomy([
  { id: "gen1", kind: "generation", production: { from: 1982, to: 1991 } },
  { id: "gen2", kind: "generation", production: { from: 1991, to: 1999 } },
  {
    id: "gen2-5",
    kind: "generation",
    production: { from: 1997, to: 1999 },
    parentGeneration: "gen2",
  },
  { id: "gen3", kind: "generation", production: { from: 1999, to: 2006 } },
  { id: "gen4", kind: "generation", production: { from: 2006, to: 2021 } },
]);

const card = (
  overrides: Partial<CommunityFilterCard> = {}
): CommunityFilterCard => ({
  regions: ["CR"],
  languages: ["es-CR"],
  gens: ["gen1", "gen2", "gen2-5", "gen3", "gen4"],
  activity: "active",
  ...overrides,
});

const cards: CommunityFilterCard[] = [
  card({ regions: ["CR"], languages: ["es-CR"], activity: "active" }),
  card({
    regions: ["001"],
    languages: ["en"],
    gens: ["gen3"],
    activity: "very-active",
  }),
  card({
    regions: ["GB"],
    languages: ["en"],
    activity: "dormant",
  }),
];

describe("matchesCommunityFilter", () => {
  it("shows everything in the empty state — the set the server rendered", () => {
    expect(
      cards.every((entry) =>
        matchesCommunityFilter(entry, EMPTY_COMMUNITY_FILTER, taxonomy)
      )
    ).toBe(true);
  });

  it("filters by region alone", () => {
    expect(
      countCommunityMatches(
        cards,
        { ...EMPTY_COMMUNITY_FILTER, region: "CR" },
        taxonomy
      )
    ).toBe(1);
    expect(
      countCommunityMatches(
        cards,
        { ...EMPTY_COMMUNITY_FILTER, region: "001" },
        taxonomy
      )
    ).toBe(1);
  });

  it("filters by language alone", () => {
    expect(
      countCommunityMatches(
        cards,
        {
          ...EMPTY_COMMUNITY_FILTER,
          language: "en",
        },
        taxonomy
      )
    ).toBe(2);
  });

  // Code review F2 (ruled): RFC 4647 basic filtering, directional. Exact-string
  // matching here previously made selecting "español" (`es`) drop every
  // `es-CR` entry — inverting COM-02 for the exact readers it exists for.
  it("matches a language selection to a more specific regional tag (RFC 4647)", () => {
    expect(
      countCommunityMatches(
        cards,
        {
          ...EMPTY_COMMUNITY_FILTER,
          language: "es",
        },
        taxonomy
      )
    ).toBe(1); // the es-CR card, not zero
  });

  it("never lets one language's selection match a different language's tag", () => {
    const enOnly = cards.filter((c) => c.languages.includes("en"));
    expect(
      countCommunityMatches(
        enOnly,
        {
          ...EMPTY_COMMUNITY_FILTER,
          language: "es",
        },
        taxonomy
      )
    ).toBe(0); // "en" tags never match the "es" selection
  });

  it("filters by generation, matching any gen the community lists", () => {
    // cards[0] and cards[2] carry the default "all gens" fixture; cards[1]
    // is scoped to gen3 alone.
    expect(
      countCommunityMatches(
        cards,
        { ...EMPTY_COMMUNITY_FILTER, gen: "gen3" },
        taxonomy
      )
    ).toBe(3); // both "all gens" entries + the gen3-only one
    expect(
      countCommunityMatches(
        cards,
        { ...EMPTY_COMMUNITY_FILTER, gen: "gen1" },
        taxonomy
      )
    ).toBe(2); // the two "all gens" entries, not the gen3-only one
  });

  // T204: the point of routing the facet through the fitment engine. A
  // community scoped to `["gen2"]` is an answer for a reader with a 1998
  // facelift truck, because `gen2-5` declares `gen2` as its parent — the
  // containment is content, stated once, and the engine is what reads it.
  // `card.gens.includes("gen2-5")` was false here, and that was the
  // divergence the T703a review predicted.
  it("expands a parent generation to its facelift child", () => {
    const gen2Only = [card({ gens: ["gen2"] })];

    expect(
      countCommunityMatches(
        gen2Only,
        { ...EMPTY_COMMUNITY_FILTER, gen: "gen2-5" },
        taxonomy
      )
    ).toBe(1);
  });

  it("never expands a facelift child up to its parent", () => {
    // The containment is one-directional: a club that only ever discusses the
    // facelift truck is not an answer for the whole of Gen 2.
    const faceliftOnly = [card({ gens: ["gen2-5"] })];

    expect(
      countCommunityMatches(
        faceliftOnly,
        { ...EMPTY_COMMUNITY_FILTER, gen: "gen2" },
        taxonomy
      )
    ).toBe(0);
  });

  it("filters by activity as an exact match", () => {
    expect(
      countCommunityMatches(
        cards,
        {
          ...EMPTY_COMMUNITY_FILTER,
          activity: "very-active",
        },
        taxonomy
      )
    ).toBe(1);
  });

  it("ands every active facet together", () => {
    expect(
      countCommunityMatches(
        cards,
        {
          ...EMPTY_COMMUNITY_FILTER,
          region: "CR",
          activity: "very-active",
        },
        taxonomy
      )
    ).toBe(0);
    expect(
      countCommunityMatches(
        cards,
        {
          ...EMPTY_COMMUNITY_FILTER,
          region: "CR",
          activity: "active",
        },
        taxonomy
      )
    ).toBe(1);
  });

  it("returns nothing for a facet value no card has", () => {
    expect(
      countCommunityMatches(
        cards,
        { ...EMPTY_COMMUNITY_FILTER, region: "JP" },
        taxonomy
      )
    ).toBe(0);
  });
});
