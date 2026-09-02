/**
 * The mods index's facet filter (MOD-01), as pure functions.
 *
 * Split out of the page template for the reason `glossary-filter.ts`,
 * `community-filter.ts` and `parts/filter.ts` are: the page's `<script>` is
 * DOM wiring, and what a pill *matches* is a rule that deserves a unit test
 * without a browser. It also means the server render and the browser answer
 * the question with the same code, so the first paint and the first click
 * cannot disagree.
 *
 * ## Two facets, and why the second one is `impact` rather than difficulty
 *
 * The parts index carries one facet (system) because a reader arrives holding
 * a number. A reader arrives at the mods index holding a *question* — "what
 * will this cost me" — and the honest narrowing for that is not "show me easy
 * mods", it is **"show me the ones that break something"**. Difficulty and
 * cost are already on every card as chips; the thing a card cannot show at a
 * glance is whether the entry's consequences are the sharp kind.
 *
 * So the second group filters on the **worst** impact an entry declares, which
 * is a derived value rather than a stored one — see {@link worstImpact}. A
 * mod that `breaks` one thing and merely `degrades` another is a
 * breaks-something mod, and filing it under its gentlest consequence would be
 * the listing helping a reader miss the sentence that mattered.
 *
 * Nothing here knows anything about fitment (FIT-01). FIT-03's vehicle filter
 * is a *different shape* of control that dims rather than hides (the Selector
 * artboard's "never hidden silently"), owned by `src/lib/vehicle-listing.ts`.
 *
 * refs specs/001-foundation (MOD-01, FIT-01)
 */
import { MOD_IMPACTS, type ModImpact } from "./references.ts";

/** What one card carries, as the DOM stores it. */
export interface ModsCardFacets {
  readonly system: string;
  /** `""` when the entry declares no consequences at all. */
  readonly impact: string;
}

/** The pills' state. `""` means "all" — the pill every group starts on. */
export interface ModsFilterState {
  system: string;
  impact: string;
}

export const EMPTY_MODS_FILTER: ModsFilterState = { system: "", impact: "" };

/**
 * The worst impact in a list of `affects` rows, or `null` for an entry that
 * declares none.
 *
 * `null` and not `"needs-adjustment"`: "this mod affects nothing we have
 * written down" is a different claim from "this mod needs an alignment", and
 * coalescing the first into the second would put an unexamined entry in the
 * gentlest bucket — a confident answer derived from having nothing to say
 * (AGENTS.md, "a failure is not a zero"). The page renders `null` as no chip
 * at all, and `npm run gaps` (GAP-01) is what notices the silence.
 *
 * `MOD_IMPACTS` is ordered worst first, so the minimum index is the answer and
 * the ordering lives in the schema rather than being restated here.
 */
export function worstImpact(impacts: readonly string[]): ModImpact | null {
  let worst: ModImpact | null = null;

  for (const candidate of impacts) {
    const index = (MOD_IMPACTS as readonly string[]).indexOf(candidate);
    if (index === -1) continue;
    if (
      worst === null ||
      index < (MOD_IMPACTS as readonly string[]).indexOf(worst)
    ) {
      worst = MOD_IMPACTS[index] as ModImpact;
    }
  }

  return worst;
}

/**
 * Whether a card survives the current filter.
 *
 * An unset facet matches everything, and matching is exact-string: systems and
 * impacts are ids from closed vocabularies, never free text, so there is
 * nothing to normalize and a near-match would be a bug rather than a kindness.
 */
export function matchesModsFilter(
  card: ModsCardFacets,
  state: ModsFilterState
): boolean {
  if (state.system !== "" && card.system !== state.system) return false;
  if (state.impact !== "" && card.impact !== state.impact) return false;
  return true;
}
