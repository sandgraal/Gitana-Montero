/**
 * The confidence-caveat rule (AGENTS.md "Facts"), as a pure function.
 *
 * > Every entity carries a confidence tier … Anything below `tsb` renders
 * > with a visible caveat in both languages — except glossary terms (owner
 * > ruling 2026-08-28: terminology is not a repair fact …).
 *
 * `CONFIDENCE_TIERS` is ordered **strongest evidence first** (T104's own
 * convention — see its docstring), so "below `tsb`" is "later in the array
 * than `tsb`", not a hand-maintained list of the three weaker tiers. A future
 * tier inserted into that array is picked up here with no edit.
 *
 * Split out of the page template for the same reason `glossary-filter.ts`
 * is: a merge-blocking rule (every non-glossary page must render this caveat
 * correctly) deserves a unit test that does not require a browser or an Astro
 * build.
 *
 * refs specs/001-foundation (AGENTS.md "Facts")
 */
import { CONFIDENCE_TIERS, type ConfidenceTier } from "../schemas/entry";

/** The tier AGENTS.md draws the line at. Entries at or above this need no caveat. */
export const CONFIDENCE_CAVEAT_THRESHOLD: ConfidenceTier = "tsb";

const THRESHOLD_INDEX = CONFIDENCE_TIERS.indexOf(CONFIDENCE_CAVEAT_THRESHOLD);

/**
 * Whether an entry at `tier` must render the visible confidence caveat.
 *
 * `tsb` itself does not (the rule is "below `tsb`", not "at or below"); every
 * tier after it in `CONFIDENCE_TIERS` — `community-consensus`, `first-hand`,
 * `anecdotal` — does.
 */
export function needsConfidenceCaveat(tier: ConfidenceTier): boolean {
  return CONFIDENCE_TIERS.indexOf(tier) > THRESHOLD_INDEX;
}
