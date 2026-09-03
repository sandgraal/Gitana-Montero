/**
 * The problem index's symptom-first navigation (T402, PRB-02), as pure
 * functions.
 *
 * > **PRB-02** THE site SHALL offer symptom-first navigation: a visitor picks
 * > or searches a symptom phrase in their locale and reaches matching
 * > problems filtered by their selected vehicle.
 *
 * Split out of `src/pages/[locale]/[problemsSegment].astro` for the same
 * reason `glossary-filter.ts` and `community-filter.ts` are split from their
 * pages: the `.astro` `<script>` keeps only DOM wiring (find elements, toggle
 * `hidden`, set `aria-pressed`); everything that decides *whether a card is
 * shown* or *what the symptom index contains* is a pure function here,
 * unit-testable without a browser.
 *
 * ## Two independent facets, ANDed — same shape as the glossary's
 *
 * `symptom` (a picked phrase, exact match against the card's own symptom
 * set) and `query` (free text, substring match against the card's combined
 * haystack) each default to `""`, permissive when empty, so the initial
 * state — the server-rendered listing, everything visible — is what the
 * enhancement reproduces on first apply. Symptom-first does not mean
 * symptom-only: PRB-02 says "picks **or** searches", so a visitor typing a
 * phrase never has to first find its pill, and picking a pill never
 * disables the search box.
 *
 * ## Why the symptom index is entry-local text, not a shared taxonomy
 *
 * `src/schemas/problems.ts` is explicit that symptom ids are entry-local —
 * "there is no shared symptom taxonomy; T402 builds its index from these."
 * Two entries describing the same real-world symptom will, in general, use
 * two different ids and two independently-authored phrasings. The index
 * this module builds groups by the **normalized phrase text**
 * (`normalizeForSearch`, the same accent/case-insensitive form the glossary
 * and `check:glossary` already agree on), not by id — so "hard shifting"
 * authored in two different entries collapses to one pill, and a
 * capitalization or accent difference between two authors does not mint two
 * pills for what a reader would call the same symptom. It is a best-effort
 * merge of independently-authored text, not a canonical vocabulary; nothing
 * here mints or renders a symptom id.
 *
 * ## Haystack: built from what the card already renders
 *
 * Same discipline as `glossary-filter.ts`'s `buildHaystack` (its own docs
 * explain the SCF-06 Lighthouse-budget history): the page's `<script>` reads
 * each card's already-rendered title, summary, symptom bullets and chip text
 * and passes them here, rather than serializing a second `data-haystack`
 * copy into the HTML. At the scale T403–T405 ship (~60 problems, wave 1),
 * the saving is smaller than the glossary's 153-term case, but the
 * duplication is the same shape and the fix is one import away — there is
 * no reason to reintroduce it here.
 *
 * refs specs/001-foundation (PRB-01, PRB-02, FIT-03)
 */
import { normalizeForSearch } from "./text.ts";

/* -------------------------------------------------------------------------
 * The free-text + picked-symptom filter
 * ---------------------------------------------------------------------- */

/** One card's already-resolved, already-normalized filterable text. */
export interface ProblemFilterCard {
  /**
   * This card's own symptom phrases, normalized. Compared for **equality**
   * against a picked pill's `normalized` value — a pill only ever matches a
   * card that states that exact (normalized) phrase, never a substring of a
   * longer one.
   */
  readonly symptoms: readonly string[];
  /** Normalized title + summary + symptom phrases + chip text, joined. */
  readonly haystack: string;
}

/** The parts of a rendered card `buildHaystack` reads, as rendered (not yet normalized). */
export interface ProblemHaystackSource {
  readonly title: string;
  readonly summary: string;
  /** This card's rendered symptom bullets, page locale, as shown. */
  readonly symptoms: readonly string[];
  /** Rendered chip text — system, severity, safety, triage. */
  readonly chips: readonly string[];
}

/**
 * Normalize a card's rendered parts into one searchable string.
 *
 * Symptom phrases are the reason PRB-02 exists, but title, summary and chip
 * text are folded in too — the same recall trade the glossary makes by
 * indexing definitions alongside terms: a reader typing "brakes" or "tow"
 * should find a card whose *symptom bullets* never happen to use that exact
 * word.
 */
export function buildHaystack(source: ProblemHaystackSource): string {
  return normalizeForSearch(
    [source.title, source.summary, ...source.symptoms, ...source.chips].join(
      " "
    )
  );
}

/** A card's own symptom phrases, normalized — for the picked-symptom facet. */
export function normalizedSymptoms(
  symptoms: readonly string[]
): readonly string[] {
  return symptoms.map(normalizeForSearch);
}

/** The active filter state. `""` is permissive for both facets. */
export interface ProblemFilterState {
  /** A normalized symptom phrase from {@link buildSymptomIndex}, or `""`. */
  readonly symptom: string;
  /** Raw text from the search box; normalized here, not by the caller. */
  readonly query: string;
}

/**
 * Whether a card survives the current filter.
 *
 * Both facets are ANDed and both are permissive when empty, matching
 * `glossary-filter.ts`'s `matchesFilter` exactly — see that module's docs
 * for why that is what makes the enhancement invisible on load.
 */
export function matchesFilter(
  card: ProblemFilterCard,
  state: ProblemFilterState
): boolean {
  if (state.symptom !== "" && !card.symptoms.includes(state.symptom)) {
    return false;
  }
  const query = normalizeForSearch(state.query);
  if (query === "") return true;
  return card.haystack.includes(query);
}

/** How many of `cards` the filter keeps. */
export function countMatches(
  cards: readonly ProblemFilterCard[],
  state: ProblemFilterState
): number {
  return cards.reduce(
    (total, card) => (matchesFilter(card, state) ? total + 1 : total),
    0
  );
}

/* -------------------------------------------------------------------------
 * The symptom index — the "picks" half of PRB-02
 * ---------------------------------------------------------------------- */

/** One pill in the symptom index: what it matches, and what it says. */
export interface SymptomIndexEntry {
  /** The normalized form — what a card's own {@link normalizedSymptoms} is compared against. */
  readonly normalized: string;
  /** The first-encountered, as-authored phrasing — what the pill displays. */
  readonly label: string;
}

/**
 * Every distinct symptom phrase across `entries`, one pill per normalized
 * form, sorted by the reader's own collation on the displayed label.
 *
 * "First-encountered" phrasing is a deliberate, cheap tie-break, not a
 * quality judgment between two authors' wording of the same symptom — the
 * module docs above explain why this can never be a canonical vocabulary.
 * Deterministic given a stable input order (collection entries are read in
 * a stable order by `getCollection`), so the pill list does not reshuffle
 * between builds for reasons unrelated to content changes.
 *
 * An entry with no symptoms (unreachable through the schema — `symptoms`
 * requires at least one — but not through this function's own type, which
 * takes a plain array) contributes nothing; empty or whitespace-only phrases
 * normalize to `""` and are skipped, so they can never produce a pill with
 * nothing on it.
 */
export function buildSymptomIndex(
  entries: readonly { readonly symptoms: readonly string[] }[],
  collator: Intl.Collator
): SymptomIndexEntry[] {
  const seen = new Map<string, string>();

  for (const entry of entries) {
    for (const phrase of entry.symptoms) {
      const normalized = normalizeForSearch(phrase);
      if (normalized === "") continue;
      if (!seen.has(normalized)) seen.set(normalized, phrase);
    }
  }

  return [...seen.entries()]
    .map(([normalized, label]) => ({ normalized, label }))
    .sort((a, b) => collator.compare(a.label, b.label));
}

/**
 * `"{shown} of {total} problems"` filled in — the same template shape and
 * the same contract as `glossary-filter.ts`'s `formatCount`. Not
 * reimplemented here: `src/i18n/ui.ts`'s `problemsCountTemplate` uses the
 * identical `{shown}`/`{total}` placeholders, so the page imports the
 * glossary module's `formatCount` directly rather than this module
 * re-exporting a second copy of the same one-line function.
 */
