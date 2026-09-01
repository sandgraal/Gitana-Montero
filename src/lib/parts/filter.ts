/**
 * The parts index's system filter (PRT-01), as a pure function.
 *
 * Split out of the page template for the reason `glossary-filter.ts` and
 * `community-filter.ts` are: the page's `<script>` is DOM wiring, and what a
 * pill *matches* is a rule that deserves a unit test without a browser. It
 * also means the server render and the browser answer the question with the
 * same code, so the first paint and the first click cannot disagree.
 *
 * One facet, deliberately. The glossary and the community directory carry
 * several because a reader arrives at them browsing; a reader arrives at a
 * parts page holding a number or a job, so the useful narrowings are the
 * system ("show me brakes") and the truck — and the truck is not a facet here
 * at all. FIT-03's vehicle filter is a *different shape* of control that dims
 * rather than hides (the Selector artboard's "never hidden silently"), owned
 * by `src/lib/vehicle-listing.ts` and by `src/lib/fitment/` beneath it, and
 * this module knows nothing about fitment (FIT-01).
 *
 * refs specs/001-foundation (PRT-01, FIT-01)
 */

/** What one card carries, as the DOM stores it. */
export interface PartsCardFacets {
  readonly system: string;
}

/** The pills' state. `""` means "all" — the pill every group starts on. */
export interface PartsFilterState {
  system: string;
}

export const EMPTY_PARTS_FILTER: PartsFilterState = { system: "" };

/**
 * Whether a card survives the current filter.
 *
 * An unset facet matches everything, and matching is exact-string: systems are
 * ids from a closed vocabulary (`GLOSSARY_SYSTEMS`), never free text, so there
 * is nothing to normalize and a near-match would be a bug rather than a
 * kindness.
 */
export function matchesPartsFilter(
  card: PartsCardFacets,
  state: PartsFilterState
): boolean {
  if (state.system === "") return true;
  return card.system === state.system;
}
