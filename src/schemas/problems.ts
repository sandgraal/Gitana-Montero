/**
 * The `problems` collection schema (PRB-01, PRB-03, PRB-04, PRB-05) — the
 * symptom-driven problem finder that is this site's stated core purpose
 * ("comprehensive enough that someone with a broken Montero finds their answer
 * here", AGENTS.md).
 *
 * > **PRB-01** THE `problems` collection SHALL hold, per entry: symptoms
 * > (short plain-language phrases, both locales), fitment, ordered diagnostic
 * > steps each stating what a result rules in or out, root causes ranked by
 * > likelihood, fix paths (difficulty 1–5, cost band, parts by ID, procedures
 * > by ID), severity, drivability triage, sources, confidence tier.
 *
 * Built on the T104 seam (`defineEntrySchema`), so the bilingual rule, the
 * data/prose split, the strict-object rule and the fitment/confidence
 * requirement are inherited rather than re-implemented.
 *
 * ## The shape of a problem: parallel halves joined by ids
 *
 * A problem entry is four ordered lists — symptoms, diagnostic steps, root
 * causes, fix paths — and each of those lists has a *structural* half (order,
 * difficulty, cost band, which cause a step rules in, which part a fix
 * consumes) and a *human* half (the phrase a reader recognises their truck in).
 * The two halves cannot live in the same place: the structural half is
 * locale-independent `data` and the human half is per-locale `prose`
 * (AGENTS.md, "numbers are never translated"; `defineEntrySchema` throws at
 * define time if a figure reaches prose).
 *
 * So each list appears **twice, keyed by the same ids**:
 *
 * ```jsonc
 * "causes":  [{ "id": "worn-ball-joint", "confidence": "community-consensus" }],
 * "prose": {
 *   "en": { "causes": { "worn-ball-joint": "Worn end-link ball joint" } },
 *   "es": { "causes": { "worn-ball-joint": "Rótula del tensor desgastada" } }
 * }
 * ```
 *
 * {@link checkProblemEntry} then requires the id sets to match **exactly**, in
 * both locales: an id in `data` with no phrase in `prose.es` is a missing
 * translation (I18N-06 one level down), and a phrase in `prose.en` for an id
 * `data` does not declare is a symptom that exists in one language only. That
 * is the whole reason for the indirection — index-aligned parallel arrays would
 * express the same thing, and would silently re-pair themselves the first time
 * somebody reordered one list. Ids also give T402's symptom-first navigation a
 * join key: an EN symptom phrase and its ES twin are *the same symptom*,
 * provably, rather than by position.
 *
 * ## "Each diagnostic step states what a result rules in or out" — as data
 *
 * PRB-01's diagnostic-step clause is enforced, not trusted to prose. A step
 * carries `rulesIn` / `rulesOut` arrays of **cause ids**, at least one entry
 * between them, every id declared in `causes`. The page renders those
 * references by looking each cause's phrase up in the page locale, so the EN
 * and ES pages state the same implication by construction — a step whose
 * English text said "rules out the pump" while its Spanish text said "confirms
 * the pump" is not spellable.
 *
 * The consequence for authors is deliberate: if a step rules something in or
 * out, that something is a root cause and belongs in `causes`. See the T401
 * line in `tasks.md` for the authoring rubric.
 *
 * ## Bands and enums, not invented figures
 *
 * Cost is a {@link COST_BANDS} band (the artboard's `$` / `$$` / `$–$$`), never
 * a figure: a repair price is market-, year- and currency-dependent, and a
 * number here would be an uncitable invention that `check:citations` could
 * only wave through because *something* was cited. Time is a real quantity
 * because a job either takes about an hour or it does not, and a source can
 * state it. Difficulty is PRB-01's own 1–5 scale.
 *
 * `difficulty`, `time` and `year` figures are numeric leaves of shared data, so
 * `scripts/check-citations.mjs` (REF-02) fails the build, naming the entry and
 * the dotted field path, on an entry that states one and cites nothing. That is
 * the reason difficulty is a number and not a five-value enum: the enum would
 * be invisible to that scan.
 *
 * ## Safety (PRB-03) and the caveat (PRB-04)
 *
 * Which entries render the standing bilingual safety notice is
 * `src/lib/safety.ts`'s `isSafetyCritical`, from `system` plus the upward-only
 * `safetyCritical` flag — the same one function the `reference` collection
 * uses, so there is one answer site-wide. PRB-03 adds a second route to the
 * same conclusion (`severity: "safety-critical"`), and two routes to one answer
 * is how they drift, so {@link checkSeverityAgreesWithSafety} closes it at
 * parse time: an entry whose severity says "this can hurt someone" must also be
 * safety-critical to `isSafetyCritical`, which for a system outside
 * `SAFETY_CRITICAL_SYSTEMS` (SRS/airbags, towing, jacking — AGENTS.md
 * categories with no system id of their own) means writing
 * `"safetyCritical": true`. The flag still only ever *promotes*: `false` on an
 * entry the system or the severity already caught is rejected, exactly as
 * `src/schemas/reference.ts` rejects it.
 *
 * PRB-04's caveat is `src/lib/confidence.ts`'s `needsConfidenceCaveat`, again
 * shared rather than re-derived. A per-cause `confidence` may not be *weaker*
 * than the entry's own — see {@link checkCauseConfidence} for why that
 * direction and not the other.
 *
 * refs specs/001-foundation (PRB-01, PRB-03, PRB-04, PRB-05)
 */
import { z } from "astro/zod";
import {
  CONFIDENCE_TIERS,
  confidenceSchema,
  defineEntrySchema,
  nonBlankString,
  type ConfidenceTier,
} from "./entry";
import { glossarySystemSchema } from "./glossary";
// `quantitySchema` is the one implementation of "a figure stated as a value, as
// a band, or as a nominal with its band" — including the rules that a lone
// `min` is half a specification and that a midpoint is never derived. A second
// copy here for fix-path times would be the same careful reasoning, twice,
// drifting. The dependency is one-directional (`reference.ts` knows nothing
// about problems) and adds no cycle.
import { quantitySchema } from "./reference";
import { systemIsSafetyCritical } from "../lib/safety";

/* -------------------------------------------------------------------------
 * Ids and slugs
 * ---------------------------------------------------------------------- */

/**
 * The shape of every id this module mints — symptom, cause, diagnostic-step
 * and fix-path ids — and of every per-locale URL slug.
 *
 * ASCII lowercase, digits, single hyphens. Closed for two different reasons at
 * once: an id is a join key between `data` and both prose locales, so `Rotula`
 * and `rotula` must not be two keys for one cause; and a slug is a URL, so a
 * Spanish slug is `rotula-del-tensor`, never `rótula-del-tensor` — an accented
 * or percent-encoded path is one a reader cannot type and a link checker cannot
 * compare. Stripping accents is a transliteration decision the author makes
 * once, visibly, in the content file.
 */
export const PROBLEM_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const localIdSchema = (label: string) =>
  z.string().regex(PROBLEM_ID_PATTERN, {
    message:
      `not a ${label} id: ids are lowercase ASCII letters and digits joined ` +
      `by single hyphens (\`worn-ball-joint\`), because an id is the join key ` +
      `between shared data and both prose locales and \`Rotula\` / \`rotula\` ` +
      `must not become two keys for one thing. refs specs/001-foundation (PRB-01)`,
  });

/**
 * A per-locale URL slug (I18N-05). Lives in `prose`, not in shared data, and
 * that placement is the point rather than an accident:
 *
 * - A slug is *per-locale human text* — `/en/problems/front-sway-bar-end-links`
 *   and `/es/problemas/tensores-de-barra-estabilizadora` — so it belongs on the
 *   side of the split that is allowed to differ between locales. A
 *   `{ en, es }` object in shared `data` would be the per-locale duplication
 *   the split exists to prevent, pointed the other way (the same argument
 *   `src/schemas/glossary.ts` makes for the canonical term).
 * - It is deliberately **not** the top-level `data.slug` key: Astro's glob
 *   loader reads that field as the entry's real id before deriving one from the
 *   file path, which would silently repoint every cross-reference.
 *   `scripts/check-locales.mjs` fails on sight of one; nesting the field inside
 *   `prose` keeps that guard meaningful.
 * - It is not derived from `prose.<locale>.title` either. A title is edited for
 *   clarity; a URL that moved because somebody improved a headline is a dead
 *   link in every forum post that ever cited it.
 *
 * Collisions and missing locales are caught by `validateSlugRegistry`
 * (I18N-05's own validator) at build time — see `problemSlugRegistry` in
 * `src/lib/problems.ts`.
 */
export const problemSlugSchema = z.string().regex(PROBLEM_ID_PATTERN, {
  message:
    "not a URL slug: lowercase ASCII letters and digits joined by single " +
    "hyphens, no accents and no spaces — a Spanish slug is written " +
    "`tensores-de-barra-estabilizadora`, never `tensóres…` (I18N-05). " +
    "refs specs/001-foundation",
});

/* -------------------------------------------------------------------------
 * Severity — PRB-01 "severity", PRB-03
 * ---------------------------------------------------------------------- */

/**
 * How bad the consequence of *ignoring* this problem is, ordered **most severe
 * first** (index 0 = worst), the same index-order-is-the-contract convention
 * `CONFIDENCE_TIERS` uses.
 *
 * Only `safety-critical` carries normative force — PRB-03 keys the standing
 * bilingual safety notice off it. The other four exist so that a reader
 * scanning a list can tell "this will strand you" from "this is a rattle", and
 * so the gaps report can prioritise. They are about **consequence**, never
 * about repair cost (that is the fix path's `cost` band) and never about how
 * likely the failure is (that is the causes' ranking).
 *
 * - `safety-critical` — ignoring it can hurt someone: loss of control, fire,
 *   a restraint that will not restrain. AGENTS.md's list of safety-critical
 *   *systems* usually settles this on its own; see
 *   {@link checkSeverityAgreesWithSafety} for the entries it does not.
 * - `damaging` — ignoring it destroys something else. The repair gets bigger
 *   and more expensive the longer it waits (a stretched chain that eats its
 *   guides, a leak that kills a bearing).
 * - `stranding` — ignoring it leaves the truck immobile somewhere, but nobody
 *   is hurt and nothing else breaks.
 * - `degrading` — the truck still works, worse: less power, worse economy,
 *   noise under load, a system that no longer does its whole job.
 * - `cosmetic` — appearance or comfort only.
 */
export const PROBLEM_SEVERITIES = [
  "safety-critical",
  "damaging",
  "stranding",
  "degrading",
  "cosmetic",
] as const;

export type ProblemSeverity = (typeof PROBLEM_SEVERITIES)[number];

export const problemSeveritySchema = z.enum(PROBLEM_SEVERITIES);

/** The one severity PRB-03 attaches a rendering rule to. */
export const SAFETY_CRITICAL_SEVERITY: ProblemSeverity = "safety-critical";

/* -------------------------------------------------------------------------
 * Drivability triage — PRB-05
 * ---------------------------------------------------------------------- */

/**
 * > **PRB-05** THE drivability triage SHALL be one of: `drive-normally`,
 * > `drive-gently-repair-soon`, `do-not-drive`, `tow-only` — rendered
 * > prominently in both locales.
 *
 * The four values, verbatim from the requirement, ordered least to most
 * restrictive. This is the single most consequential field on the page: it is
 * the answer to "can I drive it home?", it renders as the artboard's triage
 * banner in **both** languages regardless of page locale, and a reader acts on
 * it before they read anything else.
 *
 * The boundaries are a safety judgment content authors make, so they are
 * written down rather than left to feel:
 *
 * - **`drive-normally`** — the fault does not change how the truck should be
 *   driven. Fix it on your own schedule.
 * - **`drive-gently-repair-soon`** — the truck is drivable now, but continuing
 *   to drive it *as usual* makes the outcome worse or riskier: the failure
 *   progresses under load, speed or heat. Short trips, gentle inputs, book the
 *   repair.
 * - **`do-not-drive`** — driving it risks a sudden loss of control, a fire, or
 *   an injury, **or** turns a repairable fault into a destroyed component. The
 *   truck may well start and move; that is not the question.
 * - **`tow-only`** — it cannot be driven at all, or moving it under its own
 *   power is guaranteed to destroy something. Put it on a flatbed.
 *
 * The line between `drive-gently-repair-soon` and `do-not-drive` is the one
 * that costs a reader something to get wrong, in both directions: over-warning
 * strands somebody who did not need to be stranded and teaches them to ignore
 * the banner, under-warning is the failure this site exists to prevent. **When
 * the honest answer is "it depends", the entry is scoped too widely** — split
 * it, or state the worse of the two and explain the split in the prose.
 */
export const DRIVABILITY_STATES = [
  "drive-normally",
  "drive-gently-repair-soon",
  "do-not-drive",
  "tow-only",
] as const;

export type DrivabilityState = (typeof DRIVABILITY_STATES)[number];

export const drivabilitySchema = z.enum(DRIVABILITY_STATES);

/* -------------------------------------------------------------------------
 * Fix paths — PRB-01 "difficulty 1–5, cost band, parts by ID, procedures by ID"
 * ---------------------------------------------------------------------- */

/**
 * What a fix costs, as a **band** and never as a figure.
 *
 * A repair price depends on the market, the year, the currency and whether the
 * part is on a shelf in San José or three weeks away — so any number written
 * here would be an invention no source could support, and AGENTS.md's rule for
 * uncitable figures is that they do not ship. The artboard draws exactly this:
 * `$`, `$$`, `$–$$`. The band ids are what the schema stores; the `$` glyphs
 * are a rendering of the band's index, and the words a reader hears live in
 * `src/i18n/ui.ts` under `costBand.<id>` in both locales.
 *
 * Ordered cheapest first, so `{ from, to }` is a range and index comparison is
 * the ordering.
 *
 * - `minimal` — a consumable or a small part; the cheapest class of repair.
 * - `moderate` — a normal parts-and-an-afternoon job.
 * - `significant` — a major component, or a job that means a shop bill.
 * - `major` — comparable to a meaningful fraction of what the truck is worth,
 *   the point at which a reader starts asking whether to fix it at all.
 */
export const COST_BANDS = [
  "minimal",
  "moderate",
  "significant",
  "major",
] as const;

export type CostBand = (typeof COST_BANDS)[number];

/**
 * Exported for T501 (review call #8): PRT-01's "typical price band" defers to
 * this vocabulary rather than minting a second one. A part's price band and a
 * fix path's cost band are the same claim about the same money — two enums
 * would render as two different chips for one idea, and would drift the first
 * time either list gained a step.
 */
export const costBandSchema = z.enum(COST_BANDS);

/**
 * A cost band, or a range of them (`$–$$`, the artboard's first fix card).
 * `to` omitted means a single band.
 */
export const fixCostSchema = z
  .object({
    from: costBandSchema,
    to: costBandSchema.optional(),
  })
  .strict()
  .superRefine((cost, ctx) => {
    if (cost.to === undefined) return;
    if (COST_BANDS.indexOf(cost.to) >= COST_BANDS.indexOf(cost.from)) return;
    ctx.addIssue({
      code: "custom",
      path: ["to"],
      message:
        `\`${cost.to}\` is cheaper than \`${cost.from}\`, so this range reads ` +
        `backwards. \`COST_BANDS\` is ordered cheapest first. ` +
        `refs specs/001-foundation (PRB-01)`,
    });
  });

/** PRB-01's scale, stated once so the page can render `n/5` without a literal. */
export const DIFFICULTY_MIN = 1;
export const DIFFICULTY_MAX = 5;

/**
 * How hard the job is, 1–5, exactly as PRB-01 (and PRC-01) scale it.
 *
 * A **number**, not a five-value enum, and that is load-bearing:
 * `scripts/check-citations.mjs` walks the numeric leaves of an entry's shared
 * data, so `difficulty` is what makes an uncited fix path fail the build,
 * named. An enum would be invisible to that scan.
 *
 * Anchors, so five authors do not use five scales:
 * 1 — hand tools, no jack. 2 — hand tools and a jack, an afternoon.
 * 3 — special tool or a fluid to bleed/refill; a mistake is recoverable.
 * 4 — the truck is immobile mid-job, or a torque figure is safety-relevant.
 * 5 — engine/transmission out, a press, or a shop is the honest answer.
 */
export const difficultySchema = z
  .number()
  .int()
  .min(DIFFICULTY_MIN)
  .max(DIFFICULTY_MAX);

/** How long a fix takes. Minutes or hours; nothing on this site takes days. */
export const FIX_TIME_UNITS = ["min", "h"] as const;

export type FixTimeUnit = (typeof FIX_TIME_UNITS)[number];

/**
 * One way of fixing the problem — "replace both links", "replace links and bar
 * bushings together". A problem usually has more than one, and the artboard
 * shows them side by side precisely so a reader can weigh cost against effort.
 *
 * `parts` and `procedures` are **ids into their own collections**, never
 * re-spelled part numbers or inlined steps (PRB-01, and AGENTS.md's "never
 * invent a part number"). Those collections' pages arrive with T501/T502; until
 * then the ids render as data chips and `npm run gaps` (T703, PRB-06) is what
 * reports an id naming nothing.
 */
export const fixPathSchema = z
  .object({
    id: localIdSchema("fix path"),
    difficulty: difficultySchema,
    cost: fixCostSchema,
    /** Roughly how long, from a source or from the owner's own logbook. */
    time: quantitySchema(FIX_TIME_UNITS).optional(),
    /**
     * Which of this entry's `causes` this path actually addresses. Optional —
     * "replace the whole assembly" legitimately addresses all of them — but
     * validated when present, so a fix cannot point at a cause the entry never
     * declared.
     */
    addresses: z.array(localIdSchema("cause")).optional(),
    parts: z.array(nonBlankString()).default([]),
    procedures: z.array(nonBlankString()).default([]),
  })
  .strict();

/* -------------------------------------------------------------------------
 * Causes and diagnostic steps
 * ---------------------------------------------------------------------- */

/**
 * A root cause. **Ranked by array order, most likely first** — PRB-01's
 * "ranked by likelihood" — because a rank is what the requirement asks for and
 * a likelihood *band* would be a vocabulary nobody could source. The page
 * renders them as a numbered list, which is the rank made visible.
 *
 * `confidence` is per-cause and optional: absent means the cause is carried by
 * the entry's own tier, which is the common case. Present, it is for the entry
 * that mixes evidence — an FSM-documented failure mode listed beside one the
 * forums agree on.
 */
export const causeSchema = z
  .object({
    id: localIdSchema("cause"),
    confidence: confidenceSchema.optional(),
  })
  .strict();

/**
 * One ordered diagnostic step. The `rulesIn` / `rulesOut` cause ids are
 * PRB-01's "each stating what a result rules in or out", expressed as data so
 * the two locales cannot disagree about the implication — see the module
 * docstring.
 */
export const diagnosticStepSchema = z
  .object({
    id: localIdSchema("diagnostic step"),
    /** Causes a positive result implicates. */
    rulesIn: z.array(localIdSchema("cause")).default([]),
    /** Causes the same result eliminates. */
    rulesOut: z.array(localIdSchema("cause")).default([]),
  })
  .strict();

/* -------------------------------------------------------------------------
 * The collection shape
 * ---------------------------------------------------------------------- */

/** Locale-independent data for one problem. */
export const problemSharedShape = {
  /**
   * Which system the problem belongs to, from the glossary's vocabulary — one
   * vocabulary for the breadcrumb, the filter, and `src/lib/safety.ts`'s
   * safety-critical decision, exactly as `src/schemas/reference.ts` uses it.
   */
  system: glossarySystemSchema,
  /**
   * Promotes an entry the system list does not catch — SRS/airbags, towing,
   * jacking and lifting points (AGENTS.md's safety-critical categories with no
   * system id of their own). Upward only; see {@link checkSafetyFlag}.
   */
  safetyCritical: z.boolean().optional(),
  severity: problemSeveritySchema,
  /** PRB-05. Rendered in both locales, always, above everything else. */
  drivability: drivabilitySchema,
  /**
   * The symptom ids, in the order a reader is most likely to notice them.
   * At least one: an entry in a symptom-driven finder that lists no symptom is
   * unreachable by the only navigation this site offers for it (PRB-02).
   */
  symptoms: z.array(localIdSchema("symptom")).min(1, {
    message:
      "a problem entry states at least one symptom — it is how a reader finds " +
      "it (PRB-02). refs specs/001-foundation",
  }),
  /** Root causes, most likely first. May be empty while an entry is young. */
  causes: z.array(causeSchema).default([]),
  /** Ordered diagnostic steps. Empty is legal; see {@link checkDiagnostics}. */
  diagnosticSteps: z.array(diagnosticStepSchema).default([]),
  /**
   * Fix paths. **Legally empty**, and that emptiness is a feature: PRB-06 makes
   * `npm run gaps` list a problem with no fix path, which only works if such an
   * entry can exist in the first place. A documented problem nobody has solved
   * yet is still worth publishing.
   */
  fixPaths: z.array(fixPathSchema).default([]),
};

/**
 * Per-locale prose. `title` is the problem as a reader would describe it and
 * `summary` is the paragraph under it — the inherited base-entry names, so a
 * problem is not a special case for anything that reads entries generically.
 *
 * The four keyed maps are the human half of the four lists in
 * {@link problemSharedShape}; {@link checkProseCoverage} requires their key
 * sets to match the data's ids exactly, in both locales.
 */
export const problemProseShape = {
  title: z.string(),
  summary: z.string(),
  /** The per-locale URL slug — see {@link problemSlugSchema}. */
  slug: problemSlugSchema,
  /** `symptomId → "Rhythmic knock from the front end over small bumps"`. */
  symptoms: z.record(z.string(), z.string()),
  /** `causeId → "Worn end-link ball joint"`. A phrase, not a paragraph. */
  causes: z.record(z.string(), z.string()),
  /**
   * `stepId → "Pry between the link and the bar"`. What to *do*; what the
   * result means is `rulesIn` / `rulesOut` in shared data, rendered from the
   * cause phrases above.
   */
  diagnosticSteps: z.record(z.string(), z.string()),
  /** `fixPathId → { title, detail? }`. */
  fixPaths: z.record(
    z.string(),
    z
      .object({
        title: z.string(),
        detail: z.string().optional(),
      })
      .strict()
  ),
};

/* -------------------------------------------------------------------------
 * Per-entry rules
 * ---------------------------------------------------------------------- */

/**
 * The slice of Zod's refinement context these rules use, declared structurally
 * so each rule can be called with a plain collector from a unit test — the same
 * seam `checkReferenceEntry` and `checkVehicleTaxonomy` use.
 */
export interface ProblemRefineContext {
  addIssue(issue: {
    code: "custom";
    path: PropertyKey[];
    message: string;
  }): void;
}

interface ProblemEntryShape {
  system?: unknown;
  safetyCritical?: unknown;
  severity?: unknown;
  confidence?: unknown;
  symptoms?: unknown;
  causes?: unknown;
  diagnosticSteps?: unknown;
  fixPaths?: unknown;
  prose?: unknown;
  [field: string]: unknown;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function idsOf(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (typeof item === "string") return [item];
    const record = asRecord(item);
    const id = record?.["id"];
    return typeof id === "string" ? [id] : [];
  });
}

/**
 * `safetyCritical` promotes; it never demotes.
 *
 * The `src/schemas/reference.ts` rule, restated for this collection because it
 * is the same guarantee: an entry whose `system` (or, here, whose `severity`)
 * already makes it safety-critical cannot opt out of the standing bilingual
 * safety notice by writing `false`. That is the one value of this field that
 * could cost a reader something, so it is not spellable.
 */
function checkSafetyFlag(
  entry: ProblemEntryShape,
  ctx: ProblemRefineContext
): void {
  if (entry.safetyCritical !== false) return;

  const bySystem = systemIsSafetyCritical(entry.system);
  const bySeverity = entry.severity === SAFETY_CRITICAL_SEVERITY;
  if (!bySystem && !bySeverity) return;

  ctx.addIssue({
    code: "custom",
    path: ["safetyCritical"],
    message:
      (bySystem
        ? `\`${String(entry.system)}\` is a safety-critical system (AGENTS.md ` +
          `"Safety and legal")`
        : `\`severity: ${SAFETY_CRITICAL_SEVERITY}\` says this can hurt someone`) +
      `, so this entry renders the standing bilingual safety notice whatever ` +
      `this field says. \`safetyCritical\` only ever promotes an entry the ` +
      `system list does not catch — drop the field. ` +
      `refs specs/001-foundation (PRB-03)`,
  });
}

/**
 * PRB-03's two routes to one answer are kept from drifting.
 *
 * PRB-03 keys the safety notice off `severity: "safety-critical"`; every other
 * surface on this site keys it off `src/lib/safety.ts`'s `isSafetyCritical`,
 * which reads `system` and the `safetyCritical` flag. An entry that satisfies
 * one and not the other would render the notice on its own page and not in a
 * listing, or the reverse — so the schema requires them to agree, and tells the
 * author the one word that fixes it.
 *
 * The rule is deliberately one-directional. `severity: safety-critical` ⇒
 * safety-critical, but **not** the converse: a squeaking brake is a `cosmetic`
 * problem on a safety-critical *system*, and it still gets the notice (the
 * system said so) while its severity chip honestly says "cosmetic". Forcing
 * every brake entry to claim the top severity would empty the word of meaning.
 */
function checkSeverityAgreesWithSafety(
  entry: ProblemEntryShape,
  ctx: ProblemRefineContext
): void {
  if (entry.severity !== SAFETY_CRITICAL_SEVERITY) return;
  if (systemIsSafetyCritical(entry.system)) return;
  if (entry.safetyCritical === true) return;

  ctx.addIssue({
    code: "custom",
    path: ["safetyCritical"],
    message:
      `\`severity: ${SAFETY_CRITICAL_SEVERITY}\` means ignoring this can hurt ` +
      `someone, but \`system: ${String(entry.system)}\` is not one of ` +
      `AGENTS.md's safety-critical systems, so \`isSafetyCritical\` — the one ` +
      `function every page and listing asks — would answer "no" and the ` +
      `standing bilingual safety notice would not render (PRB-03). Add ` +
      `\`"safetyCritical": true\`. This is the SRS/airbag, towing and ` +
      `jacking case: real hazards whose systems have no id of their own. ` +
      `refs specs/001-foundation (PRB-03)`,
  });
}

/** No list may declare the same id twice — an id is a key, and keys are unique. */
function checkDuplicateIds(
  entry: ProblemEntryShape,
  field: string,
  ctx: ProblemRefineContext
): void {
  const seen = new Set<string>();
  const value = entry[field];
  if (!Array.isArray(value)) return;

  value.forEach((item, index) => {
    const record = asRecord(item);
    const id = typeof item === "string" ? item : record?.["id"];
    if (typeof id !== "string") return;
    if (!seen.has(id)) {
      seen.add(id);
      return;
    }
    ctx.addIssue({
      code: "custom",
      path: [field, index, ...(typeof item === "string" ? [] : ["id"])],
      message:
        `\`${id}\` is declared twice in \`${field}\`. An id is the key that ` +
        `joins this list to its phrase in both prose locales, so two rows ` +
        `cannot share one. refs specs/001-foundation (PRB-01)`,
    });
  });
}

/**
 * Every diagnostic step says what a result means, and says it about a cause
 * this entry actually declares (PRB-01).
 *
 * A step that rules nothing in and nothing out is a step that tells the reader
 * to go and look at something without telling them what they are looking for,
 * which is the difference between a diagnostic procedure and a list of chores.
 * If a step rules out something the entry does not list as a cause, that
 * something *is* a root cause of this problem — add it.
 *
 * A step must also not contradict itself. Naming one cause in both `rulesIn`
 * and `rulesOut` states nothing informationally — whichever way the result
 * goes, the reader is told the opposite thing at the same time — so it is the
 * same defect as the empty step, written twice instead of not at all. Naming
 * one cause twice inside a single half is the id-is-a-key rule of
 * `checkDuplicateIds` one level down: the second mention adds no claim, and a
 * step's two lists are the only place a cause id repeats without the
 * top-level sweep seeing it.
 */
function checkDiagnostics(
  entry: ProblemEntryShape,
  ctx: ProblemRefineContext
): void {
  const steps = Array.isArray(entry.diagnosticSteps)
    ? entry.diagnosticSteps
    : [];
  if (steps.length === 0) return;

  const causeIds = new Set(idsOf(entry.causes));

  steps.forEach((step, index) => {
    const record = asRecord(step);
    if (record === null) return;

    const rulesIn = Array.isArray(record["rulesIn"]) ? record["rulesIn"] : [];
    const rulesOut = Array.isArray(record["rulesOut"])
      ? record["rulesOut"]
      : [];

    if (rulesIn.length === 0 && rulesOut.length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["diagnosticSteps", index, "rulesIn"],
        message:
          `this step names no cause it rules in and none it rules out. ` +
          `PRB-01 asks for "ordered diagnostic steps each stating what a ` +
          `result rules in or out" — a step that states neither is an ` +
          `instruction, not a diagnostic. If the result eliminates something ` +
          `this entry does not list under \`causes\`, that something is a ` +
          `root cause: add it. refs specs/001-foundation (PRB-01)`,
      });
    }

    for (const [key, list] of [
      ["rulesIn", rulesIn],
      ["rulesOut", rulesOut],
    ] as const) {
      list.forEach((id, position) => {
        if (typeof id !== "string" || causeIds.has(id)) return;
        ctx.addIssue({
          code: "custom",
          path: ["diagnosticSteps", index, key, position],
          message:
            `\`${id}\` is not a cause of this problem — \`causes\` declares ` +
            (causeIds.size === 0
              ? `none at all`
              : `${[...causeIds].map((known) => `\`${known}\``).join(", ")}`) +
            `. A diagnostic step rules a *declared* cause in or out, so the ` +
            `page can render the implication from one phrase in each locale. ` +
            `refs specs/001-foundation (PRB-01)`,
        });
      });
    }

    checkStepSelfConsistency(index, rulesIn, rulesOut, ctx);
  });
}

/**
 * One diagnostic step's two id lists say two different things about distinct
 * causes, or they say nothing (PRB-01).
 *
 * Reported on `rulesOut` for the contradiction case: it is the later of the
 * two halves, and the half an author most often pastes in by mistake.
 */
function checkStepSelfConsistency(
  index: number,
  rulesIn: readonly unknown[],
  rulesOut: readonly unknown[],
  ctx: ProblemRefineContext
): void {
  const duplicate = (key: "rulesIn" | "rulesOut", id: string, at: number) => {
    ctx.addIssue({
      code: "custom",
      path: ["diagnosticSteps", index, key, at],
      message:
        `\`${id}\` is named twice in this step's \`${key}\`. An id is a key, ` +
        `and the second mention makes no second claim — the step already ` +
        `rules that cause ${key === "rulesIn" ? "in" : "out"}. Remove it, or ` +
        `name the other cause you meant. refs specs/001-foundation (PRB-01)`,
    });
  };

  const ruledIn = new Set<string>();
  rulesIn.forEach((id, position) => {
    if (typeof id !== "string") return;
    if (ruledIn.has(id)) {
      duplicate("rulesIn", id, position);
      return;
    }
    ruledIn.add(id);
  });

  const ruledOut = new Set<string>();
  rulesOut.forEach((id, position) => {
    if (typeof id !== "string") return;
    if (ruledOut.has(id)) {
      duplicate("rulesOut", id, position);
      return;
    }
    ruledOut.add(id);
    if (!ruledIn.has(id)) return;
    ctx.addIssue({
      code: "custom",
      path: ["diagnosticSteps", index, "rulesOut", position],
      message:
        `this step rules \`${id}\` both in and out. PRB-01 asks each step to ` +
        `state what a result rules in *or* out; a step that states both ` +
        `about one cause tells the reader the opposite thing whichever way ` +
        `the result goes, which is an authoring contradiction, not a ` +
        `diagnostic. Decide which half is true for this step — if the ` +
        `answer depends on something, that something is the step. ` +
        `refs specs/001-foundation (PRB-01)`,
    });
  });
}

/** A fix path addresses causes this entry declares. */
function checkFixPaths(
  entry: ProblemEntryShape,
  ctx: ProblemRefineContext
): void {
  const paths = Array.isArray(entry.fixPaths) ? entry.fixPaths : [];
  const causeIds = new Set(idsOf(entry.causes));

  paths.forEach((path, index) => {
    const record = asRecord(path);
    const addresses = record?.["addresses"];
    if (!Array.isArray(addresses)) return;

    addresses.forEach((id, position) => {
      if (typeof id !== "string" || causeIds.has(id)) return;
      ctx.addIssue({
        code: "custom",
        path: ["fixPaths", index, "addresses", position],
        message:
          `\`${id}\` is not a cause of this problem, so this fix path claims ` +
          `to solve something the entry never says goes wrong. ` +
          `refs specs/001-foundation (PRB-01)`,
      });
    });
  });
}

/**
 * A cause may not be *weaker* evidence than the entry that carries it.
 *
 * The direction matters and is not arbitrary. PRB-04's caveat is rendered from
 * the **entry's** tier (`src/lib/confidence.ts`), so:
 *
 * - a cause *stronger* than the entry is harmless — the page still shows the
 *   entry's caveat, which is the conservative answer;
 * - a cause *weaker* than the entry is the failure this rule exists to stop: an
 *   `fsm-confirmed` entry could carry an `anecdotal` cause and render **no**
 *   caveat at all, presenting a guess with the authority of an FSM spec —
 *   precisely what AGENTS.md's "an `anecdotal` entry must never be presented
 *   with the authority of an FSM spec" forbids.
 *
 * So the entry's tier is a **floor**: it is the weakest thing on the page. An
 * author who genuinely has a weak cause under a strong entry lowers the entry's
 * tier, which is what makes the caveat honest.
 */
function checkCauseConfidence(
  entry: ProblemEntryShape,
  ctx: ProblemRefineContext
): void {
  const entryTier = entry.confidence;
  if (typeof entryTier !== "string") return;
  const entryIndex = CONFIDENCE_TIERS.indexOf(entryTier as ConfidenceTier);
  if (entryIndex < 0) return;

  const causes = Array.isArray(entry.causes) ? entry.causes : [];
  causes.forEach((cause, index) => {
    const record = asRecord(cause);
    const tier = record?.["confidence"];
    if (typeof tier !== "string") return;
    const tierIndex = CONFIDENCE_TIERS.indexOf(tier as ConfidenceTier);
    if (tierIndex < 0 || tierIndex <= entryIndex) return;

    ctx.addIssue({
      code: "custom",
      path: ["causes", index, "confidence"],
      message:
        `this cause is \`${tier}\`, which is weaker evidence than the entry's ` +
        `own \`${entryTier}\`. The visible caveat AGENTS.md requires below ` +
        `\`tsb\` is rendered from the *entry's* tier (PRB-04), so a weaker ` +
        `cause under a stronger entry would be shown with an authority ` +
        `nothing supports. The entry's tier is the floor — the weakest claim ` +
        `on the page. Lower \`confidence\` to \`${tier}\`, or raise this ` +
        `cause's evidence. refs specs/001-foundation (PRB-04)`,
    });
  });
}

/**
 * Every id declared in shared data has a phrase in **both** locales, and
 * neither locale carries a phrase for an id that does not exist.
 *
 * This is I18N-06 one level down: "both or neither" applies to a symptom as
 * much as to a summary, and a page whose Spanish version silently listed four
 * symptoms where the English listed five would pass every other gate in the
 * repo. The extra-key half matters just as much — a phrase with no id is text
 * that renders nowhere, in one language, and the author's real intent
 * (a symptom they meant to declare) is lost silently.
 */
function checkProseCoverage(
  entry: ProblemEntryShape,
  ctx: ProblemRefineContext
): void {
  const prose = asRecord(entry.prose);
  if (prose === null) return;

  const declared: Record<string, string[]> = {
    symptoms: idsOf(entry.symptoms),
    causes: idsOf(entry.causes),
    diagnosticSteps: idsOf(entry.diagnosticSteps),
    fixPaths: idsOf(entry.fixPaths),
  };

  for (const [locale, block] of Object.entries(prose)) {
    const localeProse = asRecord(block);
    if (localeProse === null) continue;

    for (const [field, ids] of Object.entries(declared)) {
      const phrases = asRecord(localeProse[field]);
      if (phrases === null) continue;

      for (const id of ids) {
        if (Object.hasOwn(phrases, id)) continue;
        ctx.addIssue({
          code: "custom",
          path: ["prose", locale, field, id],
          message:
            `\`${field}\` declares \`${id}\` but \`prose.${locale}.${field}\` ` +
            `has no phrase for it. Both locales or neither — an entry that ` +
            `lists a ${field === "fixPaths" ? "fix path" : "row"} in one ` +
            `language only is exactly what I18N-06 forbids, one level down. ` +
            `refs specs/001-foundation (PRB-01, I18N-06)`,
        });
      }

      const known = new Set(ids);
      for (const id of Object.keys(phrases)) {
        if (known.has(id)) continue;
        ctx.addIssue({
          code: "custom",
          path: ["prose", locale, field, id],
          message:
            `\`prose.${locale}.${field}\` has a phrase for \`${id}\`, which ` +
            `\`${field}\` does not declare — so it renders nowhere. Either ` +
            `add \`${id}\` to \`${field}\` (in both locales) or remove the ` +
            `phrase. refs specs/001-foundation (PRB-01)`,
        });
      }
    }
  }
}

/**
 * Every problems rule, applied to an entry that already satisfies the base
 * entry shape. Exported so the rules can be unit-tested — and read — without
 * reconstructing the whole collection schema.
 */
export function checkProblemEntry(
  entry: unknown,
  ctx: ProblemRefineContext
): void {
  const candidate = asRecord(entry);
  if (candidate === null) return;

  checkSafetyFlag(candidate, ctx);
  checkSeverityAgreesWithSafety(candidate, ctx);
  for (const field of ["symptoms", "causes", "diagnosticSteps", "fixPaths"]) {
    checkDuplicateIds(candidate, field, ctx);
  }
  checkDiagnostics(candidate, ctx);
  checkFixPaths(candidate, ctx);
  checkCauseConfidence(candidate, ctx);
  checkProseCoverage(candidate, ctx);
}

/**
 * The `problems` collection schema: the base entry envelope (id, fitment,
 * confidence, sources, both prose locales) plus the shapes and rules above.
 *
 * The prose shape is a parameter for the same reason `referenceEntrySchema`'s
 * is — `src/content.config.ts` keeps passing the one `baseProse` every
 * collection shares, and a second definition of "title and summary" is a second
 * thing to forget to translate.
 */
export function problemsEntrySchema<Prose extends z.ZodRawShape>(prose: Prose) {
  return defineEntrySchema(problemSharedShape, {
    ...prose,
    ...problemProseShape,
  }).superRefine((entry, ctx) => {
    checkProblemEntry(entry, ctx);
  });
}

export type ProblemEntryData = z.infer<
  ReturnType<typeof problemsEntrySchema<typeof problemProseShape>>
>;
