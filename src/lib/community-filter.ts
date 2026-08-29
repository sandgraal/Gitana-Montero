/**
 * The community directory page's filter logic (T703a, COM-01, COM-02), as
 * pure functions.
 *
 * Split out of `src/pages/[locale]/[communitySegment].astro` for the same
 * reason `glossary-filter.ts` is split from the glossary page: the `.astro`
 * `<script>` keeps only DOM wiring, and everything that decides *whether a
 * card is shown* is unit-testable without a browser.
 *
 * Four independent facets — region, language, generation, activity — each
 * with its own "no filter" state (`""`), ANDed together the same way the
 * glossary's system-and-query filter is. A card matches a facet whose value
 * is `""` unconditionally, which is what makes the initial state (every
 * facet `""`) render the same set the server already produced.
 *
 * refs specs/001-foundation (COM-01, COM-02)
 */

/** One card's already-resolved filterable facts. */
export interface CommunityFilterCard {
  /** CLDR region codes the community's people (or shop) are found in. */
  readonly regions: readonly string[];
  /** BCP-47 language tags the community speaks. */
  readonly languages: readonly string[];
  /** `GENERATION_IDS` values this community is good for. */
  readonly gens: readonly string[];
  /** The single `ACTIVITY_LEVELS` value this community is assessed at. */
  readonly activity: string;
}

/**
 * The active filter state — one selection per facet, `""` for "no filter".
 *
 * Deliberately mutable (unlike `CommunityFilterCard`, which is read-only
 * data): the page's `<script>` holds exactly one `CommunityFilterState` and
 * updates one facet in place on every pill click, the same pattern the
 * glossary's `system`/`query` locals use.
 */
export interface CommunityFilterState {
  region: string;
  language: string;
  gen: string;
  activity: string;
}

/** The state that matches every card — what the server renders on first load. */
export const EMPTY_COMMUNITY_FILTER: CommunityFilterState = {
  region: "",
  language: "",
  gen: "",
  activity: "",
};

/** Whether `card` survives every active facet in `state`. */
export function matchesCommunityFilter(
  card: CommunityFilterCard,
  state: CommunityFilterState
): boolean {
  if (state.region !== "" && !card.regions.includes(state.region)) {
    return false;
  }
  if (state.language !== "" && !card.languages.includes(state.language)) {
    return false;
  }
  if (state.gen !== "" && !card.gens.includes(state.gen)) {
    return false;
  }
  if (state.activity !== "" && card.activity !== state.activity) {
    return false;
  }
  return true;
}

/** How many of `cards` the filter keeps. */
export function countCommunityMatches(
  cards: readonly CommunityFilterCard[],
  state: CommunityFilterState
): number {
  return cards.reduce(
    (total, card) => (matchesCommunityFilter(card, state) ? total + 1 : total),
    0
  );
}
