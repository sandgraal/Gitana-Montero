/**
 * The glossary page's filter logic (GLO-04), as pure functions.
 *
 * Split out of `src/pages/[locale]/[glossarySegment].astro` so the rules are
 * unit-testable without a browser: the `.astro` `<script>` keeps only the DOM
 * wiring (find elements, toggle `hidden`, set `aria-pressed`), which is what
 * T204's Playwright suite will cover when it arrives. Everything that decides
 * *whether a term is shown* lives here.
 *
 * `formatCount` is shared by the server render and the client update, so the
 * counter says the same thing before and after the first keystroke and the
 * `{shown}` / `{total}` placeholder contract exists in one place.
 *
 * refs specs/001-foundation (GLO-04, I18N-08)
 */
import { normalizeForSearch } from "./text";

/** What a card carries, as the filter sees it. */
export interface GlossaryFilterCard {
  /** The card's system id, `data-system`. */
  readonly system: string;
  /** Pre-normalized searchable text, `data-haystack`. */
  readonly haystack: string;
}

/** The active filter state. */
export interface GlossaryFilterState {
  /** A system id, or `""` for "no system filter". */
  readonly system: string;
  /** The raw text from the search box; normalized here, not by the caller. */
  readonly query: string;
}

/**
 * Whether a card survives the current filter.
 *
 * Both halves are AND-ed and both are permissive when empty, so the initial
 * state (`{ system: "", query: "" }`) shows everything — the same set the
 * server rendered, which is what makes the enhancement invisible on load.
 *
 * The query is matched as a *substring* of the normalized haystack rather
 * than as a whole word, unlike `check:glossary`'s conformance scan: a person
 * typing `neum` mid-word wants results, whereas a merge-blocking gate firing
 * mid-word would be a false positive. Different jobs, deliberately different
 * rules.
 */
export function matchesFilter(
  card: GlossaryFilterCard,
  state: GlossaryFilterState
): boolean {
  if (state.system !== "" && card.system !== state.system) return false;
  const query = normalizeForSearch(state.query);
  if (query === "") return true;
  return card.haystack.includes(query);
}

/** How many of `cards` the filter keeps. */
export function countMatches(
  cards: readonly GlossaryFilterCard[],
  state: GlossaryFilterState
): number {
  return cards.reduce(
    (total, card) => (matchesFilter(card, state) ? total + 1 : total),
    0
  );
}

/**
 * `"Showing {shown} of {total} terms"` filled in. The template is localized
 * prose from `src/i18n/ui.ts`; the figures are computed and interpolated, so
 * neither number is ever written into a locale (AGENTS.md).
 */
export function formatCount(
  template: string,
  shown: number,
  total: number
): string {
  return template
    .replace("{shown}", String(shown))
    .replace("{total}", String(total));
}
