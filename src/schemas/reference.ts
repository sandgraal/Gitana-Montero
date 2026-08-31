/**
 * The `reference` collection schema (REF-01, REF-02) — the site's figures.
 *
 * > **REF-01** THE `reference` collection SHALL include: FSM section index
 * > (citations only, no reproduced content), VIN/option-code decoder data,
 * > fluid chart, torque master table, and capacities/dimensions — each entry
 * > fitment-scoped and source-cited.
 *
 * Built on the T104 seam (`defineEntrySchema`), so the bilingual rule, the
 * data/prose split, the strict-object rule and the fitment/confidence
 * requirement are inherited rather than re-implemented, and on the same
 * `kind`-discriminated shape `src/schemas/vehicles.ts` uses — see "Per-kind
 * shapes" below for why that pattern and not `z.discriminatedUnion`.
 *
 * ## One entry is one row
 *
 * Every kind here is a **row of a table**: one torque figure, one fluid fill,
 * one capacity, one dimension, one FSM section. That is what makes the
 * fitment requirement honest — a torque figure that differs between the 6G74
 * and the 4M41 is two rows with two fitments, not one row with a hedge in the
 * prose — and it is what makes REF-02 enforceable, since a row's number is a
 * top-level shared-data field that `check:citations` walks.
 *
 * | `kind`        | one entry is…                                   |
 * |---------------|-------------------------------------------------|
 * | `fsm-section` | a pointer into the factory manual, nothing more |
 * | `torque`      | one fastener's tightening specification         |
 * | `fluid`       | one fill: which fluid, and how much             |
 * | `capacity`    | one volume with no fluid specification to give  |
 * | `dimension`   | one measured dimension, weight or angle         |
 *
 * `fluid` vs `capacity`: use `fluid` whenever a fluid *specification* exists
 * (the ATF fill has both a spec and a volume). `capacity` is for a volume
 * where naming a fluid would be wrong — the fuel tank holds whatever the
 * market sells.
 *
 * **VIN/option-code decoder data (REF-01) is not here.** It is T208's, it is a
 * different shape entirely (a code table, not a measured figure), and adding
 * an unused kind with invented fields would be a schema change made by a task
 * that does not own it. T208 adds its own kind to `REFERENCE_KINDS` and its
 * own shape to `REFERENCE_KIND_SHAPES`; nothing else about this module needs
 * to change for it.
 *
 * ## Numbers, and REF-02
 *
 * Every figure is a {@link quantitySchema} in shared `data` at the top level
 * of the entry: `torque.value`, `capacity.max`, `serviceInterval.km`. That is
 * not decoration — `check:citations` (`scripts/check-citations.mjs`) walks
 * every numeric leaf of an entry's shared data and fails the build, naming the
 * entry and the dotted field path, when the entry cites nothing. Storing a
 * figure anywhere else (in prose, or as a string) would take it out of that
 * scan, which is why `defineEntrySchema` throws at define time on a numeric
 * prose field and why no figure here is a string.
 *
 * A value **and** its unit, never a value alone and never two units for one
 * figure: the FSM states a US-market capacity in quarts and a JDM one in
 * litres, and a converted second copy is a fact stored twice that can round
 * itself into disagreement. Render conversions; do not store them.
 *
 * ## "Cite the FSM, never reproduce it"
 *
 * AGENTS.md is unconditional: "Section references only. It is copyrighted."
 * Two structural expressions of that rule live on the `fsm-section` kind —
 * it must cite an `fsm` source (an index of a manual nobody read is not an
 * index), and its per-locale summary is length-capped, because a field that
 * cannot hold a procedure cannot be used to paste one. Neither replaces
 * review; both make the easy mistake impossible rather than merely forbidden.
 *
 * ## Safety
 *
 * Torque and capacity surfaces are safety-critical (AGENTS.md). Which entries
 * render the standing bilingual safety notice is decided by
 * `src/lib/safety.ts`'s `isSafetyCritical`, from the entry's `system` plus an
 * upward-only `safetyCritical` flag; this module carries the field and refuses
 * the one incoherent value (`false` on a system that is already on the list).
 * The notice itself is a page concern and is not built here.
 *
 * refs specs/001-foundation (REF-01, REF-02)
 */
import { z } from "astro/zod";
import { defineEntrySchema, nonBlankString } from "./entry";
import { glossarySystemSchema } from "./glossary";
import { systemIsSafetyCritical } from "../lib/safety";

/* -------------------------------------------------------------------------
 * Kinds
 * ---------------------------------------------------------------------- */

export const REFERENCE_KINDS = [
  "fsm-section",
  "torque",
  "fluid",
  "capacity",
  "dimension",
] as const;

export type ReferenceKind = (typeof REFERENCE_KINDS)[number];

export const referenceKindSchema = z.enum(REFERENCE_KINDS);

/* -------------------------------------------------------------------------
 * Units
 *
 * Closed vocabularies, lowercase and hyphenated, for the same reason
 * `DRIVE_TYPES` is closed: `Nm`, `N·m`, `NM` and `newton-metres` are four
 * spellings of one unit and would make every figure's unit a free-text field
 * nothing could group, convert or compare.
 *
 * Each family is separate so a schema can say *which* units a field admits —
 * a torque in litres is a typo the build should catch, not a rendering
 * surprise.
 * ---------------------------------------------------------------------- */

/** `kgf-m` and `lbf-ft` appear in period factory literature; both are kept. */
export const TORQUE_UNITS = ["nm", "kgf-m", "lbf-ft", "lbf-in"] as const;

export const VOLUME_UNITS = [
  "l",
  "ml",
  "cc",
  "us-qt",
  "us-gal",
  "imp-qt",
  "imp-gal",
] as const;

export const LENGTH_UNITS = ["mm", "cm", "m", "in", "ft"] as const;

export const MASS_UNITS = ["kg", "lb"] as const;

/** Degrees. Torque-angle stages, and the approach/departure/ramp angles. */
export const ANGLE_UNITS = ["deg"] as const;

/**
 * What a `dimension` entry may be measured in. Length, mass and angle in one
 * list because REF-01 files them together ("capacities/dimensions") and a
 * reader looking up "how much does it weigh / how long is it / what is the
 * approach angle" is looking at one table.
 */
export const DIMENSION_UNITS = [
  ...LENGTH_UNITS,
  ...MASS_UNITS,
  ...ANGLE_UNITS,
] as const;

export type TorqueUnit = (typeof TORQUE_UNITS)[number];
export type VolumeUnit = (typeof VOLUME_UNITS)[number];
export type DimensionUnit = (typeof DIMENSION_UNITS)[number];

/* -------------------------------------------------------------------------
 * Quantities
 * ---------------------------------------------------------------------- */

/**
 * How a figure may be stated. Exactly the three forms factory literature
 * uses, and no fourth:
 *
 * - `value` alone — "88 N·m".
 * - `min` + `max` — "84–96 N·m", a specification given only as a band.
 * - all three — "88 N·m (84–96)", a nominal with its tolerance.
 *
 * A lone `min` or a lone `max` is rejected. "At least 3.0 L" is not a
 * specification an owner can act on, and the shape would let a half-entered
 * band pass as though it were complete.
 *
 * Deriving the missing member of a pair is deliberately *not* offered: a
 * nominal invented as the midpoint of a band is a number no source states,
 * which is the same failure as an invented part number in a smaller costume.
 */
export interface QuantityOptions {
  /**
   * Whether a figure may be zero or negative. Off by default: a zero torque
   * or a negative capacity is always an error. Alignment figures (camber,
   * caster, toe) are legitimately signed, so `dimension` turns it on.
   */
  readonly allowNonPositive?: boolean;
}

export function quantitySchema<Units extends readonly [string, ...string[]]>(
  units: Units,
  options: QuantityOptions = {}
) {
  const { allowNonPositive = false } = options;
  // `z.number()` already rejects NaN and ±Infinity in this Zod line, so the
  // only sign rule left to state is the one that varies by unit family.
  const number = () =>
    allowNonPositive
      ? z.number()
      : z.number().positive({ message: "must be greater than zero" });

  return z
    .object({
      value: number().optional(),
      min: number().optional(),
      max: number().optional(),
      unit: z.enum(units),
    })
    .strict()
    .superRefine((quantity, ctx) => {
      const { value, min, max } = quantity;
      const hasBand = min !== undefined && max !== undefined;

      if (value === undefined && !hasBand) {
        ctx.addIssue({
          code: "custom",
          path: min === undefined && max === undefined ? ["value"] : ["min"],
          message:
            `a figure is stated as \`value\`, as \`min\` + \`max\`, or as all ` +
            `three (a nominal with its band). A lone \`${min === undefined ? "max" : "min"}\` ` +
            `is half a specification, and the missing half is never derived — ` +
            `a midpoint no source states is an invented number ` +
            `(AGENTS.md "Facts"). refs specs/001-foundation (REF-01)`,
        });
        return;
      }

      if (hasBand && min > max) {
        ctx.addIssue({
          code: "custom",
          path: ["max"],
          message: `\`max\` (${max}) must not be below \`min\` (${min})`,
        });
        return;
      }

      if (value === undefined || !hasBand) return;
      if (value >= min && value <= max) return;

      ctx.addIssue({
        code: "custom",
        path: ["value"],
        message:
          `the nominal (${value}) sits outside its own band (${min}–${max}): ` +
          `one of the three figures was mistyped`,
      });
    });
}

export type Quantity = z.infer<ReturnType<typeof quantitySchema>>;

/**
 * The volume quantity, defined **once** and shared by the `fluid` and
 * `capacity` kinds. Same field name, same schema object, on purpose: the
 * flattened shared shape below refuses two kinds that declare the same field
 * name with different schemas, and identity is how these two prove they are
 * the same field rather than a collision.
 */
const capacityQuantity = quantitySchema(VOLUME_UNITS);

/**
 * A service interval, as either distance or time or both — factory
 * literature routinely gives "every 10 000 km or 6 months, whichever comes
 * first", and dropping either half changes the advice.
 */
export const serviceIntervalSchema = z
  .object({
    km: z.number().int().positive().optional(),
    months: z.number().int().positive().optional(),
  })
  .strict()
  .superRefine((interval, ctx) => {
    if (interval.km !== undefined || interval.months !== undefined) return;
    ctx.addIssue({
      code: "custom",
      path: ["km"],
      message:
        "a service interval states a distance, a time, or both — an empty " +
        "interval says nothing. refs specs/001-foundation (REF-01)",
    });
  });

/* -------------------------------------------------------------------------
 * FSM section index — REF-01 "citations only, no reproduced content"
 * ---------------------------------------------------------------------- */

/**
 * How long an `fsm-section` entry's per-locale summary may be.
 *
 * The entry's job is to tell a reader *where to look*: "Group 11 covers engine
 * mechanical — cylinder head removal, valve clearance, timing belt." That is a
 * sentence or two. A field that cannot hold a procedure cannot be used to
 * paste one, which is a structural expression of AGENTS.md's "cite the FSM,
 * never reproduce it" rather than a note in a review checklist.
 *
 * Generous on purpose — this is a guard against wholesale reproduction, not a
 * style rule, and a cap that legitimate summaries trip would just teach
 * authors to work around it.
 */
export const FSM_SUMMARY_MAX_LENGTH = 500;

/** Page numbers as printed. `to` omitted means a single page. */
export const pageRangeSchema = z
  .object({
    from: z.number().int().positive(),
    to: z.number().int().positive().optional(),
  })
  .strict()
  .refine((pages) => pages.to === undefined || pages.to >= pages.from, {
    message: "`to` must not be before `from`",
    path: ["to"],
  });

/* -------------------------------------------------------------------------
 * Per-kind shapes
 * ---------------------------------------------------------------------- */

/**
 * The fields each kind carries, and *only* those: an entry is parsed against
 * its kind's shape strictly, so a `fluid` entry that declares `torque` is told
 * the field belongs to another kind.
 */
export const REFERENCE_KIND_SHAPES = {
  "fsm-section": {
    /**
     * The manual as it identifies itself — title, volume, publication number.
     * A string, not an id: there is no taxonomy of manuals, and inventing one
     * to hold four entries would be a taxonomy change nobody asked for.
     */
    manual: nonBlankString(),
    /** The section as the manual labels it: `Group 11 — Engine`. */
    section: nonBlankString(),
    subsection: nonBlankString().optional(),
    pages: pageRangeSchema.optional(),
  },
  torque: {
    torque: quantitySchema(TORQUE_UNITS),
    /** `M12 × 1.25`, `1/2-20`. Free text: thread callouts are not a taxonomy. */
    threadSize: nonBlankString().optional(),
    fastenerCount: z.number().int().positive().optional(),
    /**
     * Torque-to-yield and angle-tightened fasteners: "50 N·m, then 90°, then
     * 90° again". Each stage states a torque, an angle, or both, in the order
     * the manual gives them. Head bolts are the canonical case and are the
     * reason this is not simply a single figure.
     */
    stages: z
      .array(
        z
          .object({
            torque: quantitySchema(TORQUE_UNITS).optional(),
            angle: quantitySchema(ANGLE_UNITS).optional(),
          })
          .strict()
          .superRefine((stage, ctx) => {
            if (stage.torque !== undefined || stage.angle !== undefined) return;
            ctx.addIssue({
              code: "custom",
              path: ["torque"],
              message: "a tightening stage states a torque, an angle, or both",
            });
          })
      )
      .min(2, {
        message:
          "a single stage is the `torque` field — `stages` is for a sequence",
      })
      .optional(),
    /**
     * Torque-to-yield fasteners stretch permanently and must be replaced.
     * Recorded as data because it is a fact about the fastener, and because a
     * reader who reuses a head bolt finds out on the highway.
     */
    singleUseFastener: z.boolean().optional(),
  },
  fluid: {
    /**
     * The fluid as its standard designates it — `API GL-5 SAE 75W-90`,
     * `MITSUBISHI DIA QUEEN ATF SP-III`. Shared data, not prose: a standard's
     * designation is the same string in every language.
     */
    specification: nonBlankString(),
    capacity: capacityQuantity.optional(),
    serviceInterval: serviceIntervalSchema.optional(),
  },
  capacity: {
    capacity: capacityQuantity,
  },
  dimension: {
    /** Signed on purpose — camber, caster and toe are legitimately negative. */
    dimension: quantitySchema(DIMENSION_UNITS, { allowNonPositive: true }),
  },
} as const satisfies Record<ReferenceKind, z.ZodRawShape>;

/* -------------------------------------------------------------------------
 * The collection shape
 * ---------------------------------------------------------------------- */

/**
 * Every kind's fields, optional, flattened into one shared shape — the
 * `vehicles.ts` pattern, adopted for the reason recorded there: the collection
 * graders in `tests/schemas/collections.test.ts` parse a fixture with no
 * `kind` and require the issue list to name `prose.es`, and a
 * `z.discriminatedUnion` answers a missing discriminant with one issue at the
 * root and never reaches `prose`. One strict object reports *all* of an
 * entry's problems at once, and requiredness per kind is recovered exactly by
 * parsing against `REFERENCE_KIND_SHAPES[kind]` in the refinement below.
 *
 * Two kinds may share a field name only when they share the *same schema
 * object* — `capacity`, which `fluid` declares as `capacityQuantity.optional()`
 * and the `capacity` kind declares as `capacityQuantity` itself (the
 * comparison unwraps the `.optional()` wrapper, so the two are recognised as
 * one field that one kind happens to require). Anything else is a collision
 * that flattening would silently resolve by last-writer-wins, so it throws
 * here, at define time, before any content is parsed.
 */
function unwrapOptional(schema: unknown): unknown {
  const candidate = schema as { unwrap?: unknown };
  return typeof candidate?.unwrap === "function"
    ? (candidate.unwrap as () => unknown)()
    : schema;
}

function assertNoFieldCollisions(): void {
  const declaredBy = new Map<string, { kind: string; schema: unknown }>();
  for (const [kind, shape] of Object.entries(REFERENCE_KIND_SHAPES)) {
    for (const [field, schema] of Object.entries(
      shape as Record<string, unknown>
    )) {
      const existing = declaredBy.get(field);
      if (
        existing !== undefined &&
        unwrapOptional(existing.schema) !== unwrapOptional(schema)
      ) {
        throw new Error(
          `\`${field}\` is declared by \`${existing.kind}\` and by \`${kind}\` ` +
            `with a different schema: two reference kinds may share a field ` +
            `name only when it is literally the same field (see ` +
            `\`capacityQuantity\` in src/schemas/reference.ts). Rename one, or ` +
            `hoist the shared schema. refs specs/001-foundation (REF-01)`
        );
      }
      declaredBy.set(field, { kind, schema });
    }
  }
}

assertNoFieldCollisions();

export const referenceSharedShape: z.ZodRawShape = {
  kind: referenceKindSchema,
  /**
   * Which system the figure belongs to, from the glossary's vocabulary
   * (`GLOSSARY_SYSTEMS`) rather than a second near-identical list. One
   * vocabulary means the reference table's filter pills and the glossary's are
   * the same set, already translated in both locales under the
   * `glossarySystem.<id>` UI-strings keys, and it is what
   * `src/lib/safety.ts` reads to decide the safety notice.
   */
  system: glossarySystemSchema,
  /**
   * Promotes an entry the system list does not catch — SRS/airbags, towing,
   * jacking and lifting points (AGENTS.md's safety-critical categories with no
   * system id of their own). Upward only: `false` on a system that is already
   * safety-critical is rejected below.
   */
  safetyCritical: z.boolean().optional(),
  ...Object.fromEntries(
    Object.values(REFERENCE_KIND_SHAPES).flatMap((shape) =>
      Object.entries(shape).map(
        ([field, schema]) => [field, schema.optional()] as const
      )
    )
  ),
};

/** Every field name owned by a kind — `kind`, `system` and the flag are not. */
const KIND_FIELDS: readonly string[] = Object.keys(referenceSharedShape).filter(
  (field) => !["kind", "system", "safetyCritical"].includes(field)
);

/* -------------------------------------------------------------------------
 * Per-entry rules
 * ---------------------------------------------------------------------- */

/**
 * The slice of Zod's refinement context these rules use. Declared structurally
 * (rather than importing `z.RefinementCtx`) so {@link checkReferenceEntry} can
 * be called with a plain collector from a unit test — the same seam
 * `checkVehicleTaxonomy` uses.
 */
export interface ReferenceRefineContext {
  addIssue(issue: {
    code: "custom";
    path: PropertyKey[];
    message: string;
  }): void;
}

interface ReferenceEntryShape {
  kind?: unknown;
  system?: unknown;
  safetyCritical?: unknown;
  sources?: unknown;
  prose?: unknown;
  [field: string]: unknown;
}

/**
 * Parses the entry's kind-owned fields against its kind and re-paths the
 * resulting issues onto the entry, so SCF-04's "names the file and field"
 * still holds: a missing field is reported at that field, and a field
 * belonging to another kind is reported at itself rather than at the root.
 */
function checkKindShape(
  entry: ReferenceEntryShape,
  kind: ReferenceKind,
  ctx: ReferenceRefineContext
): void {
  const present: Record<string, unknown> = {};
  for (const field of KIND_FIELDS) {
    if (entry[field] !== undefined) present[field] = entry[field];
  }

  const outcome = z
    .object(REFERENCE_KIND_SHAPES[kind] as z.ZodRawShape)
    .strict()
    .safeParse(present);

  if (outcome.success) return;

  for (const issue of outcome.error.issues) {
    if (issue.code === "unrecognized_keys") {
      for (const key of issue.keys) {
        ctx.addIssue({
          code: "custom",
          path: [key],
          message:
            `\`${key}\` is not a field of a \`${kind}\` reference entry — it ` +
            `belongs to another reference kind (REF-01)`,
        });
      }
      continue;
    }

    ctx.addIssue({
      code: "custom",
      path: [...issue.path],
      message: `${issue.message} (required by \`kind: ${kind}\`)`,
    });
  }
}

/**
 * An `fsm-section` entry cites the manual it indexes.
 *
 * This is a *within-entry* structural contradiction, which is the line
 * `src/schemas/entry.ts` draws for what a schema may enforce: the entry's
 * whole content is a pointer into the FSM, so an FSM index that cites no FSM
 * is not a weak claim, it is not the thing it says it is. (Contrast the
 * kind→tier coherence rule, which is *content policy* about evidence strength
 * and lives in `scripts/check-citations.mjs`.)
 *
 * A bulletin index is not an FSM section index: file it as its own entry
 * citing the TSB, at the `tsb` tier.
 */
function checkFsmSectionCitesManual(
  entry: ReferenceEntryShape,
  ctx: ReferenceRefineContext
): void {
  const sources = Array.isArray(entry.sources) ? entry.sources : [];
  const citesFsm = sources.some(
    (source) =>
      typeof source === "object" &&
      source !== null &&
      (source as { kind?: unknown }).kind === "fsm"
  );
  if (citesFsm) return;

  ctx.addIssue({
    code: "custom",
    path: ["sources"],
    message:
      `an \`fsm-section\` entry is a pointer into the factory manual, so it ` +
      `must cite that manual: at least one source of kind \`fsm\`. An index ` +
      `of a document nobody opened is not an index (AGENTS.md "cite what you ` +
      `actually read"). A bulletin index is a separate entry citing the TSB. ` +
      `refs specs/001-foundation (REF-01)`,
  });
}

/**
 * The anti-reproduction cap (AGENTS.md: "Cite the Factory Service Manual,
 * never reproduce it. Section references only. It is copyrighted."), applied
 * per locale so a long ES summary is caught as readily as a long EN one.
 */
function checkFsmSectionSummaryLength(
  entry: ReferenceEntryShape,
  ctx: ReferenceRefineContext
): void {
  const prose = entry.prose;
  if (typeof prose !== "object" || prose === null) return;

  for (const [locale, value] of Object.entries(prose)) {
    if (typeof value !== "object" || value === null) continue;
    const summary = (value as { summary?: unknown }).summary;
    if (typeof summary !== "string") continue;
    if (summary.length <= FSM_SUMMARY_MAX_LENGTH) continue;

    ctx.addIssue({
      code: "custom",
      path: ["prose", locale, "summary"],
      message:
        `${summary.length} characters, and an \`fsm-section\` summary may be ` +
        `at most ${FSM_SUMMARY_MAX_LENGTH}: this entry says *where* the ` +
        `manual covers something, it never reproduces what the manual says ` +
        `— the FSM is copyrighted and section references are the only thing ` +
        `this site publishes (AGENTS.md "Safety and legal"). ` +
        `refs specs/001-foundation (REF-01)`,
    });
  }
}

/**
 * `safetyCritical` promotes; it never demotes. An entry whose `system` is
 * already on `SAFETY_CRITICAL_SYSTEMS` cannot opt out of the standing
 * bilingual safety notice by writing `false` — that is the one value of this
 * field that could cost a reader something, so it is not spellable.
 */
function checkSafetyFlag(
  entry: ReferenceEntryShape,
  ctx: ReferenceRefineContext
): void {
  if (entry.safetyCritical !== false) return;
  if (!systemIsSafetyCritical(entry.system)) return;

  ctx.addIssue({
    code: "custom",
    path: ["safetyCritical"],
    message:
      `\`${String(entry.system)}\` is a safety-critical system (AGENTS.md ` +
      `"Safety and legal"), so this entry renders the standing bilingual ` +
      `safety notice whatever this field says. \`safetyCritical\` only ever ` +
      `promotes an entry the system list does not catch — drop the field. ` +
      `refs specs/001-foundation (REF-01)`,
  });
}

/**
 * Every reference rule, applied to an entry that already satisfies the base
 * entry shape. Exported so the rules can be unit-tested — and read — without
 * reconstructing the whole collection schema.
 */
export function checkReferenceEntry(
  entry: unknown,
  ctx: ReferenceRefineContext
): void {
  if (typeof entry !== "object" || entry === null) return;
  const candidate = entry as ReferenceEntryShape;

  checkSafetyFlag(candidate, ctx);

  const { kind } = candidate;
  if (!(REFERENCE_KINDS as readonly unknown[]).includes(kind)) return;
  const referenceKind = kind as ReferenceKind;

  checkKindShape(candidate, referenceKind, ctx);

  if (referenceKind === "fsm-section") {
    checkFsmSectionCitesManual(candidate, ctx);
    checkFsmSectionSummaryLength(candidate, ctx);
  }
}

/**
 * The `reference` collection schema: the base entry envelope (id, fitment,
 * confidence, sources, both prose locales) plus the rules above.
 *
 * The prose shape is a parameter for the same reason `vehiclesEntrySchema`'s
 * is — `src/content.config.ts` keeps passing the one `baseProse` every
 * collection shares, and a second definition of "title and summary" is a
 * second thing to forget to translate.
 */
export function referenceEntrySchema<Prose extends z.ZodRawShape>(
  prose: Prose
) {
  return defineEntrySchema(referenceSharedShape, prose).superRefine(
    (entry, ctx) => {
      checkReferenceEntry(entry, ctx);
    }
  );
}
