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

/**
 * RFC 4647 §3.3.1 basic filtering, directional: a selected range (`"es"`)
 * matches a tag that is either identical or one step more specific
 * (`"es-CR"`), never the reverse. This is the fix for a COM-02-inverting bug
 * (code review F2): exact-string matching made the "español" pill match only
 * the one entry whose `languages` is the bare `["es"]`, dropping all four
 * `es-CR` Costa Rican entries the moment a reader filtered by their own
 * language. `"en"` still never matches an `"es"` tag — there is no shared
 * prefix — so the directionality does not leak across languages.
 */
function languageMatches(tag: string, selected: string): boolean {
  return tag === selected || tag.startsWith(`${selected}-`);
}

/** Whether `card` survives every active facet in `state`. */
export function matchesCommunityFilter(
  card: CommunityFilterCard,
  state: CommunityFilterState
): boolean {
  // Region is exact-match, not prefix: `001` (worldwide, M49 "world") is its
  // own pill precisely because a worldwide community is not a Costa Rican
  // one wearing a broader label, and a reader who selects `CR` wants
  // Costa-Rica-specific communities, not "everywhere, including Costa Rica"
  // (code review F2, ruled — deliberately different from the language
  // facet's RFC 4647 prefix matching just below, which *is* a
  // generic/specific relationship within one language).
  if (state.region !== "" && !card.regions.includes(state.region)) {
    return false;
  }
  if (
    state.language !== "" &&
    !card.languages.some((tag) => languageMatches(tag, state.language))
  ) {
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
