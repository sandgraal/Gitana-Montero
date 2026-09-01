/**
 * The `parts` collection schema (PRT-01, PRT-02, PRT-03) — the site's part
 * numbers.
 *
 * > **PRT-01** THE `parts` collection SHALL hold, per entry: OEM part
 * > number(s) with supersession chain, fitment, aftermarket equivalents
 * > (brand + number + quality note), typical price band, vendors, known-bad
 * > brands with evidence, sources.
 * >
 * > **PRT-02** WHEN a part number is superseded, THE page SHALL show the chain
 * > oldest→current and mark the current orderable number.
 * >
 * > **PRT-03** IF two parts entries claim the same OEM number with conflicting
 * > fitment, THEN THE build SHALL fail.
 *
 * Built on the T104 seam (`defineEntrySchema`), so the bilingual rule, the
 * data/prose split, the strict-object rule and the fitment/confidence
 * requirement are inherited rather than re-implemented.
 *
 * ## One entry is one part number
 *
 * `oemNumber` is **identity**, not a field. One parts entry is one OEM part
 * number, and the same number never appears on two entries — see
 * `src/lib/parts/index.ts`, which enforces that across the corpus and fails
 * the build naming both files.
 *
 * That is deliberately *stricter* than PRT-03's literal text ("the same OEM
 * number with conflicting fitment"), and the widening is the safe direction.
 * Two entries claiming one number are either (a) contradicting each other
 * about which trucks it fits — PRT-03's own case — or (b) agreeing, in which
 * case one physical part has been split across two pages and a reader
 * searching `MD976075` gets two answers, two fitments, two supersession
 * chains and no way to tell which is current. AGENTS.md calls a wrong part
 * number "the highest-consequence hallucination in this domain"; "which of
 * these two pages is about my part" is the same failure wearing a different
 * hat. Merging two entries is a five-minute edit; discovering at the parts
 * counter that the site had two answers is not.
 *
 * ## Supersession is a typed pointer, resolved by the build
 *
 * `supersededBy` names **another parts entry's `id`** — not a bare part
 * number. A bare number would be a string nothing could resolve: the build
 * could not tell a superseding part that exists from one nobody has written
 * yet, and the page could not link to it. As a typed reference it is
 * checkable, and a dangling pointer, a self-pointer and a cycle are all build
 * errors (`src/lib/parts/index.ts`).
 *
 * The direction is one-way on purpose. A `supersedes` field pointing the
 * other way would be the same edge stored twice, and two copies of one edge
 * can disagree — the failure mode AGENTS.md's "if you find yourself writing
 * the same figure twice, the schema is wrong" describes for numbers, applied
 * to a reference. The chain PRT-02 renders is *derived* by walking the
 * pointers, so it cannot drift from them.
 *
 * A superseded number therefore gets a full entry of its own, with both
 * prose locales, its own fitment, its own confidence tier and its own
 * sources. That is not bureaucracy: the old number really was fitted to a
 * different year range, and the claim "MB598152 was replaced by MR455009" is
 * a claim that needs a citation like any other.
 *
 * ## Numbers, and `check:citations`
 *
 * {@link partsShared} carries exactly one numeric field,
 * `quantityPerVehicle`, and it is in shared data at the top level of the
 * entry, which is what puts it inside `scripts/check-citations.mjs`' scan: an
 * entry that states "this truck takes 6 of these" and cites nothing fails the
 * build, named by field (REF-02, and the T106-review note on this task's
 * tasks.md line). Storing it as a string, or inside prose, would take it out
 * of that scan — which is why `defineEntrySchema` throws at define time on a
 * numeric prose field, and why nothing in {@link partsProse} is a figure.
 *
 * **Part numbers are strings and stay strings.** `MD976075` is a catalogue
 * token, not a quantity: it has leading letters, it is never summed or
 * compared, and a JSON number would silently eat a leading zero. So it is not
 * in the citation scan by shape — it is covered by the entry-level rule that
 * any tier above `first-hand` cites a source, and by review. Per-*value*
 * citation is T502's design (its tasks.md line reserves it), and inventing a
 * second, parts-only attribution model here would be the thing that task
 * exists to avoid.
 *
 * **`priceBand` (PRT-01) is deliberately absent** — see the note recorded on
 * the T501 line in `specs/001-foundation/tasks.md`. A stored price is a
 * number that goes stale and differs by market and currency; PRT-01 asks for
 * a *band*, and the band vocabulary belongs to T401 (PRB-01's "cost band",
 * which the design handoff already draws as a chip). Minting a second one
 * here is exactly the drift a shared vocabulary exists to prevent.
 *
 * ## Safety
 *
 * A brake pad is a brake pad whether it is filed as a part or as a torque
 * figure, so this collection carries the same `system` + upward-only
 * `safetyCritical` pair `src/schemas/reference.ts` does, read by
 * `src/lib/safety.ts`. The one incoherent value — `safetyCritical: false` on
 * a system that is already on the list — is refused here.
 *
 * ## Known-bad brands (PRT-01) carry their evidence
 *
 * A cross-reference at {@link CROSS_REFERENCE_QUALITY_AVOID} names a brand as
 * bad. PRT-01's own words are "known-bad brands **with evidence**", so this
 * module requires both halves structurally: a bilingual note saying what went
 * wrong, and at least one source on the entry. An unevidenced "avoid Brand X"
 * is not a weak claim about a truck — it is an unsourced claim about a named
 * business, which is a different kind of problem.
 *
 * refs specs/001-foundation (PRT-01, PRT-02, PRT-03)
 */
import { z } from "astro/zod";
import { defineEntrySchema, nonBlankString } from "./entry";
import { glossarySystemSchema } from "./glossary";
import { systemIsSafetyCritical } from "../lib/safety";
import {
  PART_NUMBER_MAX_LENGTH,
  PART_NUMBER_PATTERN,
  normalizePartNumber,
} from "../lib/parts/part-numbers";

/* -------------------------------------------------------------------------
 * Part numbers
 *
 * The token rules themselves live in `src/lib/parts/part-numbers.ts` — see
 * that module for why (the build hook that enforces PRT-03 must reach them
 * without dragging the schema graph along). This module only wraps them in
 * Zod, so the definition of "a part number" exists once.
 * ---------------------------------------------------------------------- */

export {
  PART_NUMBER_MAX_LENGTH,
  PART_NUMBER_PATTERN,
  normalizePartNumber,
} from "../lib/parts/part-numbers";

export const partNumberSchema = () =>
  z
    .string()
    .regex(PART_NUMBER_PATTERN, {
      message:
        "a part number is written as the catalogue prints it: uppercase " +
        "letters and digits, single hyphens allowed inside, no spaces (so " +
        "`md976075` and `MD976075` cannot become two rows for one part). " +
        "Never invent one — if it is not in a cited source it does not ship " +
        '(AGENTS.md "Facts"). refs specs/001-foundation (PRT-01)',
    })
    .max(PART_NUMBER_MAX_LENGTH, {
      message:
        `a part number is at most ${PART_NUMBER_MAX_LENGTH} characters — ` +
        `longer than that is a description, and descriptions are prose`,
    });

/* -------------------------------------------------------------------------
 * Entry references
 * ---------------------------------------------------------------------- */

/**
 * The shape of an id this collection points at — kebab-case, lowercase, per
 * plan.md's "Content conventions" (`g3-brakes-front-pads`,
 * `all-engine-oil-filter`).
 *
 * This is not decoration. It is the one check that catches the mistake an
 * author is actually going to make: writing a **part number** where a
 * `supersededBy` pointer belongs. `MR455009` is uppercase and this pattern is
 * not, so the two cannot be confused silently — the entry is rejected with a
 * message that says which of the two the field wants. Whether the id names a
 * real entry is a corpus question and belongs to the build
 * (`src/lib/parts/index.ts`), exactly as a fitment id belongs to FIT-02.
 */
export const ENTRY_REFERENCE_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const entryReferenceSchema = (field: string, target: string) =>
  z.string().regex(ENTRY_REFERENCE_PATTERN, {
    message:
      `\`${field}\` names ${target} by its entry id, which is lowercase ` +
      `kebab-case (\`g3-brakes-front-pads\`) — not a part number, and not a ` +
      `file path. A part number here would be a pointer nothing can resolve. ` +
      `refs specs/001-foundation (PRT-02)`,
  });

/* -------------------------------------------------------------------------
 * Aftermarket cross-references — PRT-01
 * ---------------------------------------------------------------------- */

/**
 * How good an aftermarket equivalent is, as a closed vocabulary rather than
 * free text, for the reason every vocabulary in this repo is closed:
 * "OEM supplier", "oem supplier" and "same as OEM" are three spellings of one
 * verdict, and a free-text field could not be filtered, coloured or
 * translated once in the UI-strings module.
 *
 * - `oem-supplier` — the company that makes the part for Mitsubishi, selling
 *   the same part in its own box (Aisin, Denso, NGK). The most useful row on
 *   any parts page and the reason this is not a two-value good/bad flag.
 * - `equivalent` — a different manufacturer whose part is reported to perform
 *   the same.
 * - `lower-grade` — it fits and it works, and it is reported not to last as
 *   long. A legitimate choice a reader may want to make knowingly.
 * - `avoid` — known-bad. Requires evidence; see
 *   {@link CROSS_REFERENCE_QUALITY_AVOID}.
 */
export const CROSS_REFERENCE_QUALITY = [
  "oem-supplier",
  "equivalent",
  "lower-grade",
  "avoid",
] as const;

export type CrossReferenceQuality = (typeof CROSS_REFERENCE_QUALITY)[number];

/** PRT-01's "known-bad brands with evidence" — the verdict that needs proof. */
export const CROSS_REFERENCE_QUALITY_AVOID: CrossReferenceQuality = "avoid";

/**
 * A stable handle for one cross-reference **within one entry**.
 *
 * It exists because PRT-01 splits this row across the data/prose line: the
 * brand and the number are locale-independent data, and the "quality note"
 * is human language that has to exist in both locales. Prose therefore holds
 * a note *per cross-reference*, and it needs a key — an array index would
 * silently re-point every note the day somebody reorders the list, which is
 * the kind of change a reviewer cannot see.
 *
 * Kebab-case and unique within the entry, so it is also usable as a DOM id on
 * the page.
 */
export const crossReferenceSchema = z
  .object({
    /**
     * `aisin-wpm-050` — an author-chosen handle, not a global id. Unique
     * within the entry; nothing outside the entry ever refers to it.
     */
    ref: z.string().regex(ENTRY_REFERENCE_PATTERN, {
      message:
        "`ref` is a lowercase kebab-case handle for this cross-reference " +
        "inside this entry (`aisin-wpm-050`); the note in `prose.<locale>." +
        "crossReferenceNotes` is keyed by it. refs specs/001-foundation (PRT-01)",
    }),
    /**
     * The brand as it is printed on the box. A string, not an id: there is no
     * taxonomy of parts manufacturers and inventing one to hold a handful of
     * names would be a taxonomy change nobody asked for.
     */
    brand: nonBlankString(),
    /** That brand's own number for the part — never the Mitsubishi number. */
    partNumber: partNumberSchema(),
    quality: z.enum(CROSS_REFERENCE_QUALITY),
  })
  .strict();

export type CrossReference = z.infer<typeof crossReferenceSchema>;

/* -------------------------------------------------------------------------
 * The entry shape
 * ---------------------------------------------------------------------- */

/** Locale-independent facts about the part. Nothing here is translated. */
export const partsShared = {
  /**
   * The OEM part number this entry **is**. Identity, not a field: no two
   * entries may claim it (PRT-03, enforced across the corpus in
   * `src/lib/parts/index.ts`).
   */
  oemNumber: partNumberSchema(),

  /**
   * Which system the part belongs to, from the glossary's vocabulary
   * (`GLOSSARY_SYSTEMS`) rather than a second near-identical list — the same
   * choice `src/schemas/reference.ts` made, for the same reasons: one set of
   * filter pills, already translated in both locales, and it is what
   * `src/lib/safety.ts` reads to decide the standing safety notice.
   */
  system: glossarySystemSchema,

  /**
   * Promotes a part the system list does not catch — an SRS component, a
   * towing or jacking part (AGENTS.md's safety-critical categories with no
   * system id of their own). Upward only: `false` on a system that is already
   * safety-critical is rejected below.
   */
  safetyCritical: z.boolean().optional(),

  /**
   * The entry id of the part that replaced this one (PRT-02). Absent means
   * this entry *is* the current, orderable number — which is why the page can
   * mark "current" without an extra flag that could contradict the pointers.
   */
  supersededBy: entryReferenceSchema(
    "supersededBy",
    "the part that replaced this one"
  ).optional(),

  /**
   * How many of this part one vehicle takes — 6 spark plugs, 2 front sway-bar
   * links, 1 water pump.
   *
   * The collection's only figure, and it is here rather than in prose on
   * purpose: a number in shared data is walked by `check:citations`, so
   * stating a quantity while citing nothing fails the build naming
   * `quantityPerVehicle` (REF-02). Optional, because "how many" is often not
   * what a catalogue states and a guessed count is an invented fact.
   */
  quantityPerVehicle: z.number().int().positive().optional(),

  /** PRT-01's aftermarket equivalents. Refined below for `ref` uniqueness. */
  crossReferences: z.array(crossReferenceSchema).optional(),

  /**
   * PRT-01's "vendors", as typed references into the `community` collection —
   * whose `vendor` and `shop` types already model exactly this, tagged by
   * region and language (COM-01) and already inside AGENTS.md's "no paid
   * placement, paid ranking, or paid inclusion in the community directory"
   * rule.
   *
   * A second, parts-local vendor model would be a second directory: two
   * places to record that a repuestera closed, and one of them subject to
   * the no-paid-placement rule while the other quietly was not. The build
   * resolves each id and rejects one that names no community entry, or names
   * one that is not a seller (`src/lib/parts/index.ts`).
   */
  vendors: z
    .array(entryReferenceSchema("vendors", "a vendor or shop"))
    .optional(),
};

/**
 * Per-locale text.
 *
 * `title` and `summary` restate the base prose shape in
 * `src/content.config.ts` rather than importing it, for the reason
 * `src/schemas/community.ts` records: `content.config.ts` imports *this*
 * module to register the collection, so reaching back the other way is a
 * cycle.
 *
 * Nothing numeric may appear here — `defineEntrySchema` throws at define time
 * if it does. A quantity, a torque, a price or a part number written into a
 * locale is a fact stored twice (AGENTS.md).
 */
export const partsProse = {
  title: z.string(),
  summary: z.string(),

  /**
   * PRT-01's "quality note", one per cross-reference, keyed by that
   * cross-reference's `ref`.
   *
   * A record and not an array because the key is what ties a sentence to a
   * brand: with a positional list, reordering `crossReferences` would
   * re-attach every note to the wrong brand, and the diff would look like a
   * no-op. Every key must name a declared `ref` (checked below), so a note
   * whose cross-reference was deleted is a build error rather than text
   * nothing renders.
   *
   * Optional as a whole — most cross-references need no commentary — but a
   * note is required in **both** locales for any `avoid` row, because that is
   * where PRT-01's "with evidence" lives.
   */
  crossReferenceNotes: z.record(z.string(), nonBlankString()).optional(),
};

/* -------------------------------------------------------------------------
 * Per-entry rules
 *
 * Everything here is a contradiction visible from *inside one entry* — the
 * line `src/schemas/entry.ts` and `src/schemas/reference.ts` both draw for
 * what a schema refinement may enforce. Questions about other entries
 * (does `supersededBy` name a real part? is this OEM number unique?) are the
 * build's, in `src/lib/parts/index.ts`.
 * ---------------------------------------------------------------------- */

/**
 * The slice of Zod's refinement context these rules use, declared
 * structurally (rather than importing `z.RefinementCtx`) so
 * {@link checkPartsEntry} can be called with a plain collector from a unit
 * test — the seam `checkReferenceEntry` and `checkVehicleTaxonomy` use.
 */
export interface PartsRefineContext {
  addIssue(issue: {
    code: "custom";
    path: PropertyKey[];
    message: string;
  }): void;
}

interface PartsEntryShape {
  id?: unknown;
  oemNumber?: unknown;
  system?: unknown;
  safetyCritical?: unknown;
  supersededBy?: unknown;
  crossReferences?: unknown;
  vendors?: unknown;
  sources?: unknown;
  prose?: unknown;
}

interface ReadCrossReference {
  readonly index: number;
  readonly ref?: string;
  readonly brand?: string;
  readonly partNumber?: string;
  readonly quality?: string;
}

/** The cross-references present, read tolerantly — the field schema reports shape. */
function readCrossReferences(entry: PartsEntryShape): ReadCrossReference[] {
  const { crossReferences } = entry;
  if (!Array.isArray(crossReferences)) return [];

  return crossReferences.map((value, index) => {
    if (typeof value !== "object" || value === null) return { index };
    const record = value as Record<string, unknown>;
    return {
      index,
      ref: typeof record.ref === "string" ? record.ref : undefined,
      brand: typeof record.brand === "string" ? record.brand : undefined,
      partNumber:
        typeof record.partNumber === "string" ? record.partNumber : undefined,
      quality: typeof record.quality === "string" ? record.quality : undefined,
    };
  });
}

/**
 * `prose.<locale>.crossReferenceNotes`, per locale, read tolerantly.
 *
 * One row per **locale the entry declares**, not per locale that happens to
 * carry notes — a locale whose `crossReferenceNotes` is absent gets an empty
 * map. That distinction is the whole point: the realistic mistake is writing
 * the EN note for an `avoid` row and forgetting the ES one, and a reader who
 * skipped absent locales would report nothing for exactly that case.
 *
 * The locale list comes from the entry rather than from `LOCALES` so a missing
 * locale is reported once, by `defineEntrySchema`, rather than twice.
 */
function readNotes(
  entry: PartsEntryShape
): { locale: string; notes: Record<string, unknown> }[] {
  const { prose } = entry;
  if (typeof prose !== "object" || prose === null) return [];

  const found: { locale: string; notes: Record<string, unknown> }[] = [];
  for (const [locale, value] of Object.entries(prose)) {
    if (typeof value !== "object" || value === null) continue;
    const notes = (value as { crossReferenceNotes?: unknown })
      .crossReferenceNotes;
    found.push({
      locale,
      notes:
        typeof notes === "object" && notes !== null
          ? (notes as Record<string, unknown>)
          : {},
    });
  }
  return found;
}

/**
 * `safetyCritical` promotes; it never demotes. Verbatim the rule
 * `src/schemas/reference.ts` states, because it is the same rule about the
 * same flag: an entry whose `system` is already on `SAFETY_CRITICAL_SYSTEMS`
 * cannot opt out of the standing bilingual safety notice.
 */
function checkSafetyFlag(
  entry: PartsEntryShape,
  ctx: PartsRefineContext
): void {
  if (entry.safetyCritical !== false) return;
  if (!systemIsSafetyCritical(entry.system)) return;

  ctx.addIssue({
    code: "custom",
    path: ["safetyCritical"],
    message:
      `\`${String(entry.system)}\` is a safety-critical system (AGENTS.md ` +
      `"Safety and legal"), so this part renders the standing bilingual ` +
      `safety notice whatever this field says. \`safetyCritical\` only ever ` +
      `promotes a part the system list does not catch — drop the field. ` +
      `refs specs/001-foundation (PRT-01)`,
  });
}

/**
 * A part is not superseded by itself.
 *
 * The general case — a cycle of any length — is the build's, because it needs
 * every entry. This is the one-node case, which is visible here and is by far
 * the likeliest way it happens (an author copies the entry's own id into the
 * field).
 */
function checkSelfSupersession(
  entry: PartsEntryShape,
  ctx: PartsRefineContext
): void {
  const { id, supersededBy } = entry;
  if (typeof id !== "string" || typeof supersededBy !== "string") return;
  if (id !== supersededBy) return;

  ctx.addIssue({
    code: "custom",
    path: ["supersededBy"],
    message:
      `\`${id}\` cannot supersede itself: \`supersededBy\` names the *other* ` +
      `entry that replaced this part number, and a part with no successor ` +
      `simply omits the field — that absence is what marks it as the current, ` +
      `orderable number (PRT-02). refs specs/001-foundation (PRT-02)`,
  });
}

/**
 * A cross-reference is a reference to something *else*.
 *
 * The entry's own OEM number appearing in its own cross-reference list is a
 * copy-paste, and it would render as "this part is an aftermarket equivalent
 * of itself" — comparison is on {@link normalizePartNumber}, so the hyphenated
 * spelling of the same number is caught too.
 */
function checkCrossReferenceSelfReference(
  entry: PartsEntryShape,
  ctx: PartsRefineContext
): void {
  const { oemNumber } = entry;
  if (typeof oemNumber !== "string") return;
  const own = normalizePartNumber(oemNumber);

  for (const crossReference of readCrossReferences(entry)) {
    const { partNumber, index } = crossReference;
    if (partNumber === undefined) continue;
    if (normalizePartNumber(partNumber) !== own) continue;

    ctx.addIssue({
      code: "custom",
      path: ["crossReferences", index, "partNumber"],
      message:
        `\`${partNumber}\` is this entry's own OEM number, so it is not a ` +
        `cross-reference to anything: this list holds *other* manufacturers' ` +
        `numbers for the same part. refs specs/001-foundation (PRT-01)`,
    });
  }
}

/** Two cross-references may not share a `ref` — the notes are keyed by it. */
function checkCrossReferenceRefsAreUnique(
  entry: PartsEntryShape,
  ctx: PartsRefineContext
): void {
  const seen = new Map<string, number>();

  for (const { ref, index } of readCrossReferences(entry)) {
    if (ref === undefined) continue;
    const first = seen.get(ref);
    if (first === undefined) {
      seen.set(ref, index);
      continue;
    }

    ctx.addIssue({
      code: "custom",
      path: ["crossReferences", index, "ref"],
      message:
        `\`${ref}\` is already used by the cross-reference at index ${first}. ` +
        `Each \`ref\` is unique within the entry because the bilingual quality ` +
        `note is keyed by it — two rows sharing one handle share one note and ` +
        `one of them is wrong. refs specs/001-foundation (PRT-01)`,
    });
  }
}

/** The same brand may not list the same number twice. */
function checkCrossReferencePairsAreUnique(
  entry: PartsEntryShape,
  ctx: PartsRefineContext
): void {
  const seen = new Map<string, number>();

  for (const { brand, partNumber, index } of readCrossReferences(entry)) {
    if (brand === undefined || partNumber === undefined) continue;
    const key = `${brand.trim().toLowerCase()} ${normalizePartNumber(partNumber)}`;
    const first = seen.get(key);
    if (first === undefined) {
      seen.set(key, index);
      continue;
    }

    ctx.addIssue({
      code: "custom",
      path: ["crossReferences", index],
      message:
        `${brand} ${partNumber} is already listed at index ${first} — the ` +
        `same brand and number twice is one row entered twice, and the page ` +
        `would render it twice. refs specs/001-foundation (PRT-01)`,
    });
  }
}

/** Every note names a cross-reference that exists. */
function checkNotesNameDeclaredRefs(
  entry: PartsEntryShape,
  ctx: PartsRefineContext
): void {
  const declared = new Set(
    readCrossReferences(entry).flatMap(({ ref }) =>
      ref === undefined ? [] : [ref]
    )
  );

  for (const { locale, notes } of readNotes(entry)) {
    for (const key of Object.keys(notes)) {
      if (declared.has(key)) continue;

      ctx.addIssue({
        code: "custom",
        path: ["prose", locale, "crossReferenceNotes", key],
        message:
          `no cross-reference on this entry has \`ref: "${key}"\`` +
          (declared.size === 0
            ? `, and the entry declares none at all`
            : ` (it declares ${[...declared].map((ref) => `\`${ref}\``).join(", ")})`) +
          `. A note keyed to nothing renders nowhere — either the ` +
          `cross-reference was deleted and the note should go with it, or the ` +
          `key is a typo. refs specs/001-foundation (PRT-01)`,
      });
    }
  }
}

/**
 * PRT-01's "known-bad brands **with evidence**", as two structural
 * requirements rather than a review note.
 *
 * An `avoid` row names a business as selling a bad part. Unsourced, that is
 * not a weak claim about a truck — it is an unsourced claim about somebody's
 * livelihood, and AGENTS.md's "cite what you actually read" is the least it
 * has to clear. So: a note in *both* locales saying what went wrong, and at
 * least one source on the entry.
 *
 * The locale list comes from the entry's own `prose` rather than from
 * `LOCALES`, so this rule reports "the note is missing" and never
 * re-reports "the locale is missing" — `defineEntrySchema` already owns that
 * and one mistake should produce one error.
 */
function checkAvoidRowsCarryEvidence(
  entry: PartsEntryShape,
  ctx: PartsRefineContext
): void {
  const avoided = readCrossReferences(entry).filter(
    ({ quality }) => quality === CROSS_REFERENCE_QUALITY_AVOID
  );
  if (avoided.length === 0) return;

  const sources = Array.isArray(entry.sources) ? entry.sources : [];
  if (sources.length === 0) {
    ctx.addIssue({
      code: "custom",
      path: ["sources"],
      message:
        `this entry marks ${avoided.length} cross-reference(s) as ` +
        `\`${CROSS_REFERENCE_QUALITY_AVOID}\`, which is PRT-01's "known-bad ` +
        `brands **with evidence**" — and it cites nothing. Naming a brand as ` +
        `bad without a source is an unsourced claim about a named business ` +
        `(AGENTS.md "cite what you actually read"). Cite the evidence, or ` +
        `lower the verdict to \`lower-grade\`. ` +
        `refs specs/001-foundation (PRT-01)`,
    });
  }

  const locales = readNotes(entry);
  for (const { ref, index } of avoided) {
    if (ref === undefined) continue;

    for (const { locale, notes } of locales) {
      const note = notes[ref];
      if (typeof note === "string" && note.trim().length > 0) continue;

      ctx.addIssue({
        code: "custom",
        path: ["prose", locale, "crossReferenceNotes", ref],
        message:
          `the cross-reference at index ${index} is marked ` +
          `\`${CROSS_REFERENCE_QUALITY_AVOID}\`, so it needs a note in this ` +
          `locale saying what went wrong — PRT-01 asks for known-bad brands ` +
          `*with evidence*, and a verdict with no words is a label a reader ` +
          `cannot weigh. Both locales, always (I18N-06). ` +
          `refs specs/001-foundation (PRT-01)`,
      });
    }
  }
}

/** No entry may list the same vendor twice. */
function checkVendorsAreUnique(
  entry: PartsEntryShape,
  ctx: PartsRefineContext
): void {
  const { vendors } = entry;
  if (!Array.isArray(vendors)) return;

  const seen = new Map<string, number>();
  vendors.forEach((value, index) => {
    if (typeof value !== "string") return;
    const first = seen.get(value);
    if (first === undefined) {
      seen.set(value, index);
      return;
    }
    ctx.addIssue({
      code: "custom",
      path: ["vendors", index],
      message:
        `\`${value}\` is already listed at index ${first} — the page would ` +
        `render the same seller twice. refs specs/001-foundation (PRT-01)`,
    });
  });
}

/**
 * Every parts rule, applied to an entry that already satisfies the base entry
 * shape. Exported so the rules can be unit-tested — and read — without
 * reconstructing the whole collection schema.
 */
export function checkPartsEntry(entry: unknown, ctx: PartsRefineContext): void {
  if (typeof entry !== "object" || entry === null) return;
  const candidate = entry as PartsEntryShape;

  checkSafetyFlag(candidate, ctx);
  checkSelfSupersession(candidate, ctx);
  checkCrossReferenceSelfReference(candidate, ctx);
  checkCrossReferenceRefsAreUnique(candidate, ctx);
  checkCrossReferencePairsAreUnique(candidate, ctx);
  checkNotesNameDeclaredRefs(candidate, ctx);
  checkAvoidRowsCarryEvidence(candidate, ctx);
  checkVendorsAreUnique(candidate, ctx);
}

/**
 * The registered `parts` schema: the base entry envelope (id, fitment,
 * confidence, sources, both prose locales) plus the rules above.
 */
export const partsSchema = defineEntrySchema(
  partsShared,
  partsProse
).superRefine((entry, ctx) => {
  checkPartsEntry(entry, ctx);
});
