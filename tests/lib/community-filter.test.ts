/**
 * Graders — the community directory page's filter rules (T703a, COM-01, COM-02).
 *
 * refs specs/001-foundation (COM-01, COM-02)
 */
import { describe, expect, it } from "vitest";

import {
  EMPTY_COMMUNITY_FILTER,
  countCommunityMatches,
  matchesCommunityFilter,
  type CommunityFilterCard,
} from "../../src/lib/community-filter.ts";

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
        matchesCommunityFilter(entry, EMPTY_COMMUNITY_FILTER)
      )
    ).toBe(true);
  });

  it("filters by region alone", () => {
    expect(
      countCommunityMatches(cards, { ...EMPTY_COMMUNITY_FILTER, region: "CR" })
    ).toBe(1);
    expect(
      countCommunityMatches(cards, { ...EMPTY_COMMUNITY_FILTER, region: "001" })
    ).toBe(1);
  });

  it("filters by language alone", () => {
    expect(
      countCommunityMatches(cards, {
        ...EMPTY_COMMUNITY_FILTER,
        language: "en",
      })
    ).toBe(2);
  });

  // Code review F2 (ruled): RFC 4647 basic filtering, directional. Exact-string
  // matching here previously made selecting "español" (`es`) drop every
  // `es-CR` entry — inverting COM-02 for the exact readers it exists for.
  it("matches a language selection to a more specific regional tag (RFC 4647)", () => {
    expect(
      countCommunityMatches(cards, {
        ...EMPTY_COMMUNITY_FILTER,
        language: "es",
      })
    ).toBe(1); // the es-CR card, not zero
  });

  it("never lets one language's selection match a different language's tag", () => {
    const enOnly = cards.filter((c) => c.languages.includes("en"));
    expect(
      countCommunityMatches(enOnly, {
        ...EMPTY_COMMUNITY_FILTER,
        language: "es",
      })
    ).toBe(0); // "en" tags never match the "es" selection
  });

  it("filters by generation, matching any gen the community lists", () => {
    // cards[0] and cards[2] carry the default "all gens" fixture; cards[1]
    // is scoped to gen3 alone.
    expect(
      countCommunityMatches(cards, { ...EMPTY_COMMUNITY_FILTER, gen: "gen3" })
    ).toBe(3); // both "all gens" entries + the gen3-only one
    expect(
      countCommunityMatches(cards, { ...EMPTY_COMMUNITY_FILTER, gen: "gen1" })
    ).toBe(2); // the two "all gens" entries, not the gen3-only one
  });

  it("filters by activity as an exact match", () => {
    expect(
      countCommunityMatches(cards, {
        ...EMPTY_COMMUNITY_FILTER,
        activity: "very-active",
      })
    ).toBe(1);
  });

  it("ands every active facet together", () => {
    expect(
      countCommunityMatches(cards, {
        ...EMPTY_COMMUNITY_FILTER,
        region: "CR",
        activity: "very-active",
      })
    ).toBe(0);
    expect(
      countCommunityMatches(cards, {
        ...EMPTY_COMMUNITY_FILTER,
        region: "CR",
        activity: "active",
      })
    ).toBe(1);
  });

  it("returns nothing for a facet value no card has", () => {
    expect(
      countCommunityMatches(cards, { ...EMPTY_COMMUNITY_FILTER, region: "JP" })
    ).toBe(0);
  });
});
