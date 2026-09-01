/**
 * The problem finder's decisions and its data-side rendering (PRB-01…PRB-05).
 *
 * Split out of the page templates for the reason `src/lib/confidence.ts` and
 * `src/lib/safety.ts` are: what a problem page *shows* — which URL it lives at,
 * which fix path reads as `$–$$`, which entry sorts to the top of a triage list
 * — is merge-blocking behaviour on the most consequential page on this site,
 * and it deserves unit tests that need neither a browser nor an Astro build.
 *
 * Nothing here is a translated string. Every function returns either an id, a
 * URL, or a figure formatted by `Intl` from one stored number — the same split
 * `src/lib/vehicle-labels.ts` draws, and the same one the design handoff draws
 * with its typefaces ("if a value comes from shared `data`, it renders in Plex
 * Mono"). The words live in `src/i18n/ui.ts`.
 *
 * Fitment is asked of `src/lib/fitment/` and nothing else (FIT-01); this module
 * never interprets a fitment query.
 *
 * refs specs/001-foundation (PRB-01, PRB-05, I18N-05)
 */
import {
  COST_BANDS,
  DRIVABILITY_STATES,
  PROBLEM_SEVERITIES,
  type CostBand,
  type DrivabilityState,
  type FixTimeUnit,
  type ProblemSeverity,
} from "../schemas/problems.ts";
import { CONFIDENCE_TIERS, type ConfidenceTier } from "../schemas/entry.ts";
import { validateSlugRegistry } from "../schemas/slugs.ts";
import { LOCALES } from "../i18n/routing.ts";

/* -------------------------------------------------------------------------
 * Slugs and routes — I18N-05
 * ---------------------------------------------------------------------- */

/** The one collection id this module builds URLs for. */
export const PROBLEMS_COLLECTION = "problems";

/** The minimum an entry has to expose for this module to route it. */
export interface ProblemRoutable {
  readonly id: string;
  readonly data: {
    readonly prose: Record<string, { readonly slug?: unknown }>;
  };
}

/**
 * `{ problems: { entryId: { en, es } } }` — the I18N-05 registry, **derived**
 * from the content rather than hand-maintained.
 *
 * A second, hand-written table of slugs is a table that goes stale the first
 * time an entry is added by someone who did not know it existed. The slugs
 * already live in each entry's prose (see `problemSlugSchema`), so the registry
 * is a projection of them, and `validateSlugRegistry` — I18N-05's own validator,
 * the same one `src/i18n/routes.ts` feeds — is what turns a collision or a
 * missing locale into a failure.
 */
export function problemSlugRegistry(
  entries: readonly ProblemRoutable[]
): Record<string, Record<string, Record<string, string>>> {
  const rows: Record<string, Record<string, string>> = {};

  for (const entry of entries) {
    const slugs: Record<string, string> = {};
    for (const locale of LOCALES) {
      const slug = entry.data.prose[locale]?.slug;
      if (typeof slug === "string") slugs[locale] = slug;
    }
    rows[entry.id] = slugs;
  }

  return { [PROBLEMS_COLLECTION]: rows };
}

/**
 * Throws when the collection's slugs would not make a sound set of URLs.
 *
 * Called from `getStaticPaths`, which is the moment the URLs are actually
 * minted: a duplicate slug there is two entries claiming one address, and
 * failing the build with every collision listed is better than shipping a page
 * that silently overwrote another (I18N-05, SCF-04's spirit).
 */
export function assertProblemSlugs(entries: readonly ProblemRoutable[]): void {
  const issues = validateSlugRegistry(problemSlugRegistry(entries));
  if (issues.length === 0) return;

  throw new Error(
    `the \`problems\` slug registry has ${issues.length} problem(s):\n` +
      issues.map((issue) => `  • ${issue.message}`).join("\n") +
      `\nEvery entry needs exactly one slug per locale, unique within that ` +
      `locale (I18N-05). Slugs live in \`prose.<locale>.slug\`. ` +
      `refs specs/001-foundation`
  );
}

/** The route (locale prefix excluded) of one problem in one locale. */
export function problemRoutePath(segment: string, slug: string): string {
  return `/${segment}/${slug}/`;
}

/* -------------------------------------------------------------------------
 * Ordering — PRB-05 first, because triage is what a listing is for
 * ---------------------------------------------------------------------- */

/**
 * Position of a drivability state in {@link DRIVABILITY_STATES}, i.e. how
 * restrictive it is. `-1` for anything unrecognised, which sorts before
 * everything — a value the schema cannot produce, so this only ever guards a
 * caller that built its own object.
 */
export function drivabilityRank(state: DrivabilityState): number {
  return DRIVABILITY_STATES.indexOf(state);
}

/** Position in {@link PROBLEM_SEVERITIES}; 0 is `safety-critical`. */
export function severityRank(severity: ProblemSeverity): number {
  return PROBLEM_SEVERITIES.indexOf(severity);
}

/** What a listing needs to sort itself. */
export interface ProblemOrderable {
  readonly severity: ProblemSeverity;
  readonly drivability: DrivabilityState;
  /** The page-locale title, for the tie-break. */
  readonly title: string;
}

/**
 * Compare two problems for a listing: worst first.
 *
 * Drivability leads, then severity, then the title in the reader's own
 * collation. Drivability leads on purpose — a listing of problems is read by
 * someone deciding whether to drive, and "tow only" is a more urgent thing to
 * see than "safety-critical but drives normally" (a stored SRS fault). Severity
 * breaks the tie because within one triage state the question becomes what
 * ignoring it costs.
 *
 * Deterministic to the last comparison: two entries never compare equal unless
 * all three keys match, so a listing does not reshuffle between builds.
 */
export function compareProblems(
  a: ProblemOrderable,
  b: ProblemOrderable,
  collator: Intl.Collator
): number {
  const byDrivability =
    drivabilityRank(b.drivability) - drivabilityRank(a.drivability);
  if (byDrivability !== 0) return byDrivability;

  const bySeverity = severityRank(a.severity) - severityRank(b.severity);
  if (bySeverity !== 0) return bySeverity;

  return collator.compare(a.title, b.title);
}

/* -------------------------------------------------------------------------
 * Confidence
 * ---------------------------------------------------------------------- */

/**
 * The tier a cause is carried by: its own when it states one, the entry's
 * otherwise.
 *
 * A schema rule already guarantees a stated tier is never *weaker* than the
 * entry's, so this can never resolve to something the page's caveat does not
 * cover (`checkCauseConfidence` in `src/schemas/problems.ts`).
 */
export function causeConfidence(
  entryTier: ConfidenceTier,
  causeTier: ConfidenceTier | undefined
): ConfidenceTier {
  return causeTier ?? entryTier;
}

/** Whether a cause's own tier differs from the entry's — i.e. worth a chip. */
export function causeConfidenceDiffers(
  entryTier: ConfidenceTier,
  causeTier: ConfidenceTier | undefined
): boolean {
  return causeTier !== undefined && causeTier !== entryTier;
}

/** Index in `CONFIDENCE_TIERS`; exported so a page can sort without re-listing. */
export function confidenceRank(tier: ConfidenceTier): number {
  return CONFIDENCE_TIERS.indexOf(tier);
}

/* -------------------------------------------------------------------------
 * Fix-path figures — one stored number, formatted per locale
 * ---------------------------------------------------------------------- */

/** The `$` glyph the artboard renders a cost band with. */
const COST_GLYPH = "$";

/**
 * `minimal` → `$`, `significant` → `$$$`, `{ from: minimal, to: moderate }` →
 * `$–$$`.
 *
 * The glyph count is the band's position in {@link COST_BANDS}, so it cannot
 * drift from the vocabulary, and the string contains no word in any language —
 * the band's *name* is a `costBand.<id>` UI string, rendered beside this as the
 * accessible label. An en dash, matching every other range on this site.
 */
export function costBandGlyphs(cost: {
  readonly from: CostBand;
  readonly to?: CostBand | undefined;
}): string {
  const glyphs = (band: CostBand) =>
    COST_GLYPH.repeat(COST_BANDS.indexOf(band) + 1);
  if (cost.to === undefined || cost.to === cost.from) return glyphs(cost.from);
  return `${glyphs(cost.from)}–${glyphs(cost.to)}`;
}

/** `FIX_TIME_UNITS` ids → the ECMA-402 unit `Intl.NumberFormat` knows. */
const INTL_TIME_UNIT: Readonly<Record<FixTimeUnit, string>> = {
  min: "minute",
  h: "hour",
};

/**
 * `{ value: 1, unit: "h" }` → `1 hr` / `1 h`; `{ min: 1, max: 2, unit: "h" }` →
 * `1–2 hr`.
 *
 * One stored figure, formatted by `Intl` in the page's own locale — never a
 * number written into a translated string (AGENTS.md). The band form formats
 * both ends and joins them with an en dash rather than using
 * `formatRange`, which would give `1–2 hr` in one locale and a differently
 * spaced form in another for no gain; the unit is attached once, at the end,
 * which is how every factory chart prints a range.
 */
export function fixTimeLabel(
  time: {
    readonly value?: number | undefined;
    readonly min?: number | undefined;
    readonly max?: number | undefined;
    readonly unit: FixTimeUnit;
  },
  locale: string
): string {
  const format = new Intl.NumberFormat(locale, {
    style: "unit",
    unit: INTL_TIME_UNIT[time.unit],
    unitDisplay: "short",
    maximumFractionDigits: 1,
  });

  if (time.value !== undefined) return format.format(time.value);
  if (time.min !== undefined && time.max !== undefined) {
    return `${new Intl.NumberFormat(locale, {
      maximumFractionDigits: 1,
    }).format(time.min)}–${format.format(time.max)}`;
  }
  // Unreachable through the schema (`quantitySchema` rejects a lone bound);
  // returning the empty string rather than `undefined` keeps callers total.
  return "";
}

/**
 * The years a fitment covers, as the artboard's `1999–2006` chip, or `null`
 * when the entry states no window.
 *
 * A figure, so it renders in Plex Mono and is formatted with plain digits: a
 * year is not a quantity and `Intl.NumberFormat` would group it (`1,999`).
 */
export function fitmentYearsLabel(
  years: { readonly from?: number; readonly to?: number } | undefined
): string | null {
  if (years === undefined) return null;
  const { from, to } = years;
  if (from === undefined && to === undefined) return null;
  return `${from ?? ""}–${to ?? ""}`;
}
