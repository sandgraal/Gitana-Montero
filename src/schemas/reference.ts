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
 * | `kind`         | one entry is…                                     |
 * |----------------|---------------------------------------------------|
 * | `fsm-section`  | a pointer into the factory manual, nothing more   |
 * | `torque`       | one fastener's tightening specification           |
 * | `fluid`        | one fill: which fluid, and how much               |
 * | `capacity`     | one volume with no fluid specification to give    |
 * | `dimension`    | one measured dimension, weight or angle           |
 * | `vin-position` | one field of the VIN: which characters, what for  |
 * | `vin-code`     | one code at those characters, and what it means   |
 * | `option-code`  | one build-plate / option code, and what it means  |
 *
 * `fluid` vs `capacity`: use `fluid` whenever a fluid *specification* exists
 * (the ATF fill has both a spec and a volume). `capacity` is for a volume
 * where naming a fluid would be wrong — the fuel tank holds whatever the
 * market sells.
 *
 * ## The decoder kinds (T208) — why three, and not one
 *
 * REF-01 asks for "VIN/option-code decoder data" and that phrase covers three
 * genuinely different rows, which is why they are three kinds rather than one
 * kind with optional fields:
 *
 * 1. **`vin-position`** — the VIN's *layout*. "Positions 12–17 are the serial
 *    number." It has a position range and the field it encodes, and it has no
 *    code at all: the serial and the check digit are positions nobody tabulates
 *    values for.
 * 2. **`vin-code`** — one *value* at a position range. "At position 8, `S`
 *    means the 6G74." It has a code, the positions it occupies, and (where the
 *    taxonomy knows the thing it names) the id it decodes to.
 * 3. **`option-code`** — a code that is not in the VIN at all: the build
 *    plate's model code (`V45W`), paint, interior trim, equipment codes. Same
 *    code→meaning shape as `vin-code` minus the positions, plus the code set it
 *    belongs to.
 *
 * The alternative — one `code` kind with `positions` optional — was rejected on
 * this module's own precedent: `fluid` and `capacity` were kept apart rather
 * than folded into one kind with an optional `specification`, because an
 * optional field cannot say "required *here*", and "a VIN code with no
 * positions" or "a paint code that claims position 4" would both be spellable
 * and meaningless. Requiredness per kind is the whole point of
 * {@link REFERENCE_KIND_SHAPES}.
 *
 * The three share their fields *literally* where they mean the same thing —
 * `positions` across the two VIN kinds, `code` and `decodesTo` across
 * `vin-code` and `option-code` — which is the case the flatten guard admits.
 *
 * **Scope of `vin-position` / `vin-code`: the 17-character ISO 3779 VIN.** JDM
 * Monteros are identified by a chassis code and number (`V45W-0301234`), which
 * is not a VIN and has no ISO positions; a JDM model code is an `option-code`
 * in the `model-code` set. That is why positions are bounded at
 * {@link VIN_LENGTH} and why VIN codes are checked for the letters ISO 3779
 * excludes.
 *
 * **What a decoded meaning may name.** `decodesTo` holds *taxonomy ids*, not
 * re-spelled prose: an engine code decodes to the engine the `vehicles`
 * collection already knows. See {@link decodedMeaningSchema} for how far this
 * module can validate those ids and where the build takes over.
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
 * index), and its per-locale `title` and `summary` are both length-capped,
 * because a field that cannot hold a procedure cannot be used to paste one.
 * `title` was found carrying a whole procedure with nothing objecting (T207
 * audit, F2) — the cap always applied to `summary`, and now applies equally
 * to `title`, the other half of the same object. Neither cap replaces
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
import { assertNoFieldCollisions } from "./reference-kind-collisions";
import {
  requiresSafetyFlagFromSubject,
  systemIsSafetyCritical,
} from "../lib/safety";
import {
  DRIVE_TYPES,
  GENERATION_IDS,
  PRODUCTION_YEAR_RANGE,
  TAXONOMY_ID_PATTERN,
} from "./vehicle-vocabulary";

/* -------------------------------------------------------------------------
 * Kinds
 * ---------------------------------------------------------------------- */

export const REFERENCE_KINDS = [
  "fsm-section",
  "torque",
  "fluid",
  "capacity",
  "dimension",
  "vin-position",
  "vin-code",
  "option-code",
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
   * Which of `units` may be stated as zero or negative. Empty by default: a
   * zero torque or a negative capacity is always an error, whatever unit it
   * is in.
   *
   * **The sign rule follows the unit family, not the `kind` the quantity
   * belongs to** (T207 audit, finding F1). Alignment figures (camber, caster,
   * toe — {@link ANGLE_UNITS}) are legitimately signed; a length or a mass is
   * a magnitude and never is. A `dimension` entry carries both families in
   * one field ({@link DIMENSION_UNITS}), so the licence to be non-positive is
   * named per unit here rather than turned on for the whole family — turning
   * it on for all of `DIMENSION_UNITS` is exactly the bug the audit found: a
   * wheelbase of `-2725 mm` and a kerb mass of `0 kg` both parsed.
   */
  readonly signedUnits?: readonly string[];
}

export function quantitySchema<Units extends readonly [string, ...string[]]>(
  units: Units,
  options: QuantityOptions = {}
) {
  const signedUnits = new Set<string>(options.signedUnits ?? []);

  return z
    .object({
      value: z.number().optional(),
      min: z.number().optional(),
      max: z.number().optional(),
      unit: z.enum(units),
    })
    .strict()
    .superRefine((quantity, ctx) => {
      const { value, min, max, unit } = quantity;
      const hasBand = min !== undefined && max !== undefined;

      if (value === undefined && !hasBand) {
        /*
         * The issue attaches to the field that is *present* — the lone `min`,
         * or the lone `max` — because that is the field the author has to
         * change, and because a structured error naming an absent key points
         * an editor at nothing (T207 review, Copilot: this read `["min"]` for
         * both halves, so a lone `max` was reported against a key that was not
         * there). With neither present there is nothing half-written to point
         * at, so it lands on `value`, the field that should have been used.
         * `presentBound` is the single expression the path and the message are
         * both derived from, so the two can no longer disagree.
         */
        const presentBound =
          min !== undefined ? "min" : max !== undefined ? "max" : null;

        ctx.addIssue({
          code: "custom",
          path: [presentBound ?? "value"],
          message:
            `a figure is stated as \`value\`, as \`min\` + \`max\`, or as all ` +
            `three (a nominal with its band). ` +
            (presentBound === null
              ? `This one states none of them.`
              : `A lone \`${presentBound}\` is half a specification, and the ` +
                `missing half is never derived — a midpoint no source states ` +
                `is an invented number`) +
            ` (AGENTS.md "Facts"). refs specs/001-foundation (REF-01)`,
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

      // The sign rule, applied per present field rather than at the type
      // level, because which unit family a figure belongs to is only known
      // once `unit` itself has parsed (T207 audit, F1).
      if (!signedUnits.has(unit)) {
        for (const [field, figure] of [
          ["value", value],
          ["min", min],
          ["max", max],
        ] as const) {
          if (figure === undefined || figure > 0) continue;
          ctx.addIssue({
            code: "custom",
            path: [field],
            message: "must be greater than zero",
          });
        }
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
 * VIN and option-code decoding — REF-01 "VIN/option-code decoder data" (T208)
 * ---------------------------------------------------------------------- */

/**
 * A VIN is seventeen characters (ISO 3779, mandatory in the North American
 * market from model year 1981 — every generation this site covers). The bound
 * is what makes "position 18" a build error instead of a row nobody can use.
 */
export const VIN_LENGTH = 17;

/**
 * The letters a VIN never contains: `I`, `O` and `Q`, excluded by ISO 3779
 * because they are indistinguishable from `1` and `0` on a stamped plate.
 *
 * This is the single most likely transcription error in the whole decoder —
 * someone reads a `0` off a door jamb and types `O` — and it is one of the
 * very few things about a code that a schema can check without a source.
 */
export const VIN_EXCLUDED_LETTERS = ["I", "O", "Q"] as const;

/**
 * The VIN model-year cipher's period. The year character runs through a fixed
 * sequence of letters and digits and then starts the sequence over, thirty
 * model years later (49 CFR 565.25 Table XIII) — so `2` stands for 1982, 2012
 * **and** 2042, with nothing in the character itself to tell them apart.
 *
 * A `fitment.years` window resolves that ambiguity **iff** it cannot hold two
 * years thirty apart — for integer bounds, exactly `to - from < 30` with both
 * bounds stated. Used only by the `decodesTo.modelYear` rule: `fitment.years`
 * everywhere else is legitimately half-open.
 */
const YEAR_CIPHER_PERIOD = 30;

/**
 * What a range of VIN positions encodes.
 *
 * Closed for the reason every vocabulary in this module is closed: `mdl-year`,
 * `model year` and `year` are three spellings of one field, and a free-text
 * `encodes` could not be grouped, filtered or translated once in the UI-strings
 * module.
 *
 * Both granularities factory charts use are here on purpose. Some print
 * positions 1–3 as one **`wmi`** (the World Manufacturer Identifier); others
 * break the same three characters out as `country` / `manufacturer` /
 * `vehicle-type`. Both are legitimate rows, each states its own range, and a
 * corpus that had to pick one would be a corpus that could not follow its own
 * cited chart.
 *
 * This is a *field vocabulary local to the reference schema*, in the same class
 * as {@link TORQUE_UNITS} — not a change to the vehicle taxonomy, which stays
 * `src/schemas/vehicle-vocabulary.ts`'s business.
 */
export const VIN_FIELDS = [
  "wmi",
  "country",
  "manufacturer",
  "vehicle-type",
  "line",
  "body-style",
  "engine",
  "transmission",
  "drive",
  "restraint-system",
  "series",
  "check-digit",
  "model-year",
  "plant",
  "serial",
] as const;

export type VinField = (typeof VIN_FIELDS)[number];

/**
 * The three sections ISO 3779 divides a VIN into.
 *
 * - **WMI**, positions 1–3: the World Manufacturer Identifier.
 * - **VDS**, positions 4–9: the vehicle descriptor — what the manufacturer
 *   chose to encode about the vehicle itself.
 * - **VIS**, positions 10–17: the vehicle indicator — the model year, the
 *   plant, and the serial.
 */
export const VIN_SECTIONS = {
  wmi: { from: 1, to: 3 },
  vds: { from: 4, to: 9 },
  vis: { from: 10, to: 17 },
} as const;

/**
 * Which section of the VIN each field can legally appear in — the standard's
 * own division, and nothing finer.
 *
 * Without this, `encodes` and `positions` were two independent fields: `wmi` at
 * positions 4–8 and `country` at position 17 both parsed, which made a nonsense
 * of the reason `vin-position` is its own kind (T208 review, F1).
 *
 * **The bound is the section, deliberately not the position.** In the North
 * American scheme the model year is position 10, the plant is 11 and the serial
 * is 12–17 — but that is 49 CFR 565, a national rule, and this site is
 * global-scope by spec (§1, all markets). Pinning `model-year === 10` would
 * make a legitimate row from a market that assigns VIS differently unwritable,
 * which is a worse failure than the one being fixed. The section bound is the
 * conservative subset that survives every market ISO 3779 covers.
 *
 * **`check-digit` is unbounded on purpose.** ISO 3779 does not place a check
 * digit at all; it is 49 CFR 565 that puts it at position 9 for the North
 * American market, and markets that do not require one leave that position to
 * the VDS. A row that says "position 9 is the check digit" and a row that says
 * "positions 4–9 are the descriptor" are both true of the same truck, from
 * different charts, which is exactly the both-granularities case `VIN_FIELDS`
 * already admits for the WMI.
 *
 * **One place this table is stricter than the standard, recorded so it is not
 * rediscovered as a bug.** For a manufacturer building fewer than 500 vehicles
 * a year, ISO 3779 and 49 CFR 565.15(e) assign characters **12–14** to the
 * second part of the manufacturer identifier — so `manufacturer` at 12–14 is a
 * legitimate row for such a builder, and this table rejects it as VIS. That
 * is deliberate and harmless here: Mitsubishi is not a small-volume builder
 * and no vehicle within this site's coverage (spec §1) carries such a VIN. If
 * one ever does, the fix is a documented exception, not a surprise.
 */
export const VIN_FIELD_SECTIONS: Readonly<
  Record<VinField, { readonly from: number; readonly to: number } | null>
> = {
  wmi: VIN_SECTIONS.wmi,
  country: VIN_SECTIONS.wmi,
  manufacturer: VIN_SECTIONS.wmi,
  "vehicle-type": VIN_SECTIONS.wmi,
  line: VIN_SECTIONS.vds,
  "body-style": VIN_SECTIONS.vds,
  engine: VIN_SECTIONS.vds,
  transmission: VIN_SECTIONS.vds,
  drive: VIN_SECTIONS.vds,
  "restraint-system": VIN_SECTIONS.vds,
  series: VIN_SECTIONS.vds,
  /** Not placed by ISO 3779 — see the docstring above. */
  "check-digit": null,
  "model-year": VIN_SECTIONS.vis,
  plant: VIN_SECTIONS.vis,
  serial: VIN_SECTIONS.vis,
};

/**
 * Which table an `option-code` comes from — the build plate's model, engine,
 * transmission and transfer-case codes, the paint and interior codes, the
 * equipment/option codes, and the destination code.
 *
 * Closed, and deliberately generous. A code set missing from this list is a
 * schema change and therefore a stop-and-ask, not a drive-by edit by whoever
 * hits it first (AGENTS.md); adding a set is cheap, but a free-text `codeSet`
 * would quietly split one table into `paint`, `Paint` and `color`.
 */
export const OPTION_CODE_SETS = [
  "model-code",
  "engine-model",
  "transmission-model",
  "transfer-case-model",
  "paint",
  "interior-trim",
  "equipment",
  "destination",
] as const;

export type OptionCodeSet = (typeof OPTION_CODE_SETS)[number];

/**
 * A code as it is *stamped*: uppercase alphanumerics joined by single hyphens.
 *
 * This is {@link TAXONOMY_ID_PATTERN}'s shape with the case inverted, and
 * deliberately so — uppercase for the reason taxonomy ids are lowercase (`s`
 * and `S` must not be two rows for one code), and the *same* structure, so a
 * hyphen is a separator rather than a character that may appear anywhere.
 * The first draft (`/^[0-9A-Z][0-9A-Z-]*$/`) accepted `V45W-` and `V45--W`,
 * which the docstring already claimed it did not (T208 review, F5).
 *
 * The pattern subsumes {@link nonBlankString}: it requires at least one
 * alphanumeric, so `""` and `" "` are rejected, as is any code with a space.
 *
 * ## The hyphen is admitted here and refused for VIN codes (PR #63, Copilot)
 *
 * This is the widest shape any decoder code takes, because it is **one schema
 * object shared by `vin-code` and `option-code`** — that identity is what the
 * flatten guard requires of two kinds declaring the same field name, so
 * narrowing it for one kind by splitting it in two is the exact collision
 * {@link assertNoFieldCollisions} exists to refuse.
 *
 * A VIN, though, is strictly alphanumeric: `MB-000001` is a stamped part or
 * option code, never seventeen characters off a door jamb. And the hyphen was
 * not merely cosmetic — `code.length` counts it, so `Z-Z` "fills" a
 * three-position range while standing for two real VIN characters, letting a
 * structurally impossible VIN satisfy the position-fill rule.
 *
 * So the narrowing lives one layer up, in `checkVinCode`, beside the other
 * rules that are true of a VIN code and not of a code in general (the I/O/Q
 * exclusion, the width fill). The field schema stays shared and stays wide;
 * the kind says what it additionally requires. That is the same division this
 * module already uses for `fsm-section`'s summary cap.
 */
export const CODE_PATTERN = /^[0-9A-Z]+(?:-[0-9A-Z]+)*$/;

/**
 * A stamped code is a token, not a description. Real ones run to about a dozen
 * characters (`V45WGNXFZ`); this cap is far above anything genuine and still
 * refuses a paragraph pasted into a data field.
 *
 * **Load-bearing, and the only length bound an `option-code` has** (T208 review,
 * F2): a `vin-code`'s length is pinned from below and above by its position
 * range, but an option code has no positions, so removing this cap lets an
 * arbitrarily long "code" through with nothing else objecting. Its grader is a
 * `option-code` fixture, for exactly that reason.
 */
export const CODE_MAX_LENGTH = 32;

const decoderCodeSchema = z
  .string()
  .regex(CODE_PATTERN, {
    message:
      "a code is written as it is stamped: uppercase letters and digits, " +
      "hyphens allowed inside, no spaces (so `S` and `s` cannot become two " +
      "rows for one code). refs specs/001-foundation (REF-01)",
  })
  .max(CODE_MAX_LENGTH, {
    message: `a stamped code is at most ${CODE_MAX_LENGTH} characters — longer than that is a description, and descriptions are prose`,
  });

/**
 * Which characters of the VIN a row is about. `to` omitted means one position.
 *
 * Numbers, in shared data, at a top level `check:citations` walks: a position
 * range is a fact stated by a factory VIN chart, and REF-02 makes an uncited
 * one fail the build naming `positions.from`. That is not a side effect of the
 * shape — it is the reason the range is two integers rather than the string
 * `"4-8"`.
 *
 * Not {@link pageRangeSchema}: page numbers are unbounded and a VIN position is
 * bounded at {@link VIN_LENGTH}, and one schema serving both would have to drop
 * the bound that catches a transposed `17` → `71`.
 */
export const vinPositionsSchema = z
  .object({
    from: z.number().int().min(1).max(VIN_LENGTH),
    to: z.number().int().min(1).max(VIN_LENGTH).optional(),
  })
  .strict()
  .refine(
    (positions) => positions.to === undefined || positions.to >= positions.from,
    {
      message: "`to` must not be before `from`",
      path: ["to"],
    }
  );

/** How many characters a position range covers. */
export function vinPositionWidth(positions: {
  from: number;
  to?: number;
}): number {
  return (positions.to ?? positions.from) - positions.from + 1;
}

const taxonomyIdSchema = z.string().regex(TAXONOMY_ID_PATTERN, {
  message:
    "a decoded meaning names a taxonomy entry by its id, which is kebab-case " +
    "(`6g74`, `v5a51`) — not the code, and not the marketing name. " +
    "refs specs/001-foundation (REF-01)",
});

/**
 * Which `fitment` facet each decoded id must also appear in.
 *
 * ## Why this table is how the ids get validated
 *
 * The constraint on this task is that a decoded meaning references taxonomy ids
 * and is validated against the fitment engine's id space "where feasible".
 * Feasibility is asymmetric, and the split is exactly the one
 * `src/schemas/entry.ts` already lives with:
 *
 * - **Closed constants** — `generation` ({@link GENERATION_IDS}), `drive`
 *   ({@link DRIVE_TYPES}), `modelYear` ({@link PRODUCTION_YEAR_RANGE}) — are
 *   checked here, by `z.enum` and by bounds. Nothing defers what a constant
 *   already knows.
 * - **Taxonomy *entry* ids** — engines, transmissions, transfer cases, trims —
 *   are content, not constants. Only the resolver can see whether `6g74` is an
 *   entry, and it is deliberately the only thing that interprets a fitment
 *   (FIT-01). A second membership test in this module would be a second
 *   resolver, drifting.
 *
 * So instead of duplicating the resolver, the rule below **routes the decoded
 * id through the entry's own fitment**: a row whose meaning is "engine 6G74"
 * must be scoped to that engine, so `decodesTo.engine` must appear in
 * `fitment.engines` — and `fitment` is already validated against the real
 * taxonomy at build time by `validateEntryFitments` (FIT-02, wired in
 * `astro.config.mjs`). An id that names no taxonomy entry therefore still fails
 * the build, named, without this module inventing its own id space.
 *
 * The coherence is worth having on its own: a decoder row that says "this means
 * the 6G74" while claiming to fit every engine is a contradiction whichever way
 * you read it.
 *
 * **`generation` is deliberately absent from this table — and that leaves a
 * real hole, stated here rather than implied.** Generations contain one another
 * (`gen2-5` declares `parentGeneration: "gen2"`), so a literal membership test
 * would reject a row that decodes to `gen2-5` while correctly scoped to `gen2`.
 * But dropping the test is not free, and the two options are not the only two
 * (T208 review, F4): a row scoped to `gen1` that decodes to `gen4` is
 * **accepted today**, and it is nonsense. The honest check is containment-aware
 * membership — `expandGenerationIds` in `src/lib/fitment/index.ts`, which is
 * where the containment is already expanded — and it belongs in the FIT-02
 * build layer beside `validateEntryFitments`, not here, because it needs the
 * taxonomy. This module cannot do it and does not pretend to; the enum catches
 * a misspelling and nothing catches an unrelated generation. **Owed, recorded
 * on the T208 tasks.md line**, and pinned as a known-accepted case in
 * `reference.test.ts` so the day it is fixed, a test says so.
 */
export const DECODED_FACET_FITMENT_KEYS = {
  engine: "engines",
  transmission: "transmissions",
  transferCase: "transferCases",
  trim: "trims",
  drive: "drive",
} as const;

/**
 * What a code *means*, in ids the rest of the site already understands.
 *
 * Optional, and legitimately so: a plant code means "Nagoya", which is a place,
 * not a taxonomy entry — that meaning lives in the row's bilingual prose, like
 * every other meaning. `decodesTo` is for the cases where the meaning **is** an
 * entity the taxonomy knows, so a decoder row can link to it instead of
 * re-spelling it and drifting from it.
 *
 * `market` is not a facet here on purpose. A WMI does correlate with the market
 * a truck was built *for* — a manufacturer takes a separate WMI for its export
 * lines, and in practice `JA3`/`JA4` and a US-market Montero travel together —
 * but a correlation is not what `decodesTo` holds. These fields say "this code
 * *is* that entity"; the WMI identifies a manufacturer and a plant country, and
 * turning that into a sales market is an inference a reader can draw and a
 * decoder row should not assert. Where a code really is market-scoped, that is
 * the row's `fitment.markets`, which says the same thing without claiming the
 * chart said it (T208 review, F4 — decision kept, reasoning corrected).
 */
export const decodedMeaningSchema = z
  .object({
    generation: z.enum(GENERATION_IDS).optional(),
    engine: taxonomyIdSchema.optional(),
    transmission: taxonomyIdSchema.optional(),
    transferCase: taxonomyIdSchema.optional(),
    trim: taxonomyIdSchema.optional(),
    drive: z.enum(DRIVE_TYPES).optional(),
    /**
     * The model year a VIN's year character resolves to — a number, in shared
     * data, so `check:citations` requires the chart that states it.
     *
     * Bounded by {@link PRODUCTION_YEAR_RANGE} rather than left open because
     * the ISO year cipher repeats every thirty years: `2` is 2002, and it is
     * equally 1972 and 2032. The bound plus the required `fitment.years` window
     * (below) is what stops one row from claiming all three.
     */
    modelYear: z
      .number()
      .int()
      .min(PRODUCTION_YEAR_RANGE.from)
      .max(PRODUCTION_YEAR_RANGE.to)
      .optional(),
  })
  .strict()
  .superRefine((decoded, ctx) => {
    if (Object.values(decoded).some((value) => value !== undefined)) return;
    ctx.addIssue({
      code: "custom",
      path: [],
      message:
        "`decodesTo` states at least one thing the code means — an empty " +
        "object is not a decoding. Drop the field: a meaning the taxonomy has " +
        "no id for belongs in the entry's prose, in both locales. " +
        "refs specs/001-foundation (REF-01)",
    });
  });

/**
 * The code sets that name a thing the taxonomy already has an id for.
 *
 * A `transmission-model` code on the build plate *is* the transmission — that
 * is what the set means — so a row in that set whose `decodesTo` names an
 * engine, or a generation, or a trim, has one of its two fields wrong. Three
 * sets, a closed vocabulary on both sides, so the rule costs a lookup (T208
 * review, F6).
 *
 * The rule only fires when `decodesTo` is present. Requiring it outright would
 * make a build-plate code unrecordable until its taxonomy entry exists, which
 * would push authors into the worse habit of inventing an id to satisfy a
 * schema; a row with no `decodesTo` states its meaning in prose, in both
 * locales, like a plant code does. The sets that name no taxonomy entity at all
 * (`paint`, `interior-trim`, `equipment`, `destination`, and `model-code`,
 * whose `V45W` spans engine *and* body *and* wheelbase at once) are absent for
 * the same reason `decodesTo` is optional.
 */
export const CODE_SET_DECODED_FACETS = {
  "engine-model": "engine",
  "transmission-model": "transmission",
  "transfer-case-model": "transferCase",
} as const;

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
    /**
     * Length and mass are magnitudes and stay positive-only; angle
     * ({@link ANGLE_UNITS} — camber, caster, toe) is legitimately signed. See
     * {@link QuantityOptions.signedUnits} for why this is named per unit
     * rather than turned on for the whole `dimension` kind (T207 audit, F1).
     */
    dimension: quantitySchema(DIMENSION_UNITS, { signedUnits: ANGLE_UNITS }),
  },
  "vin-position": {
    positions: vinPositionsSchema,
    /** What those characters are for — the row's whole content. */
    encodes: z.enum(VIN_FIELDS),
  },
  "vin-code": {
    /**
     * The same schema object the `vin-position` kind declares, not a copy:
     * "which characters" is one field asked twice, and the flatten guard is
     * what makes that identity load-bearing rather than a coincidence.
     */
    positions: vinPositionsSchema,
    code: decoderCodeSchema,
    decodesTo: decodedMeaningSchema.optional(),
  },
  "option-code": {
    code: decoderCodeSchema,
    codeSet: z.enum(OPTION_CODE_SETS),
    decodesTo: decodedMeaningSchema.optional(),
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
 * one field that one kind happens to require); `positions`, shared by the two
 * VIN kinds; `code` and `decodesTo`, shared by `vin-code` and `option-code`.
 * Anything else is a collision that flattening would silently resolve by
 * last-writer-wins, so it throws here, at define time, before any content is
 * parsed.
 *
 * The guard itself lives in `./reference-kind-collisions` — a seam that exists
 * so this **call** can be pinned by a test and not merely the function it calls
 * (T207 review residual, closed by T208; see that module's docstring). It is
 * re-exported below, so nothing that imported it from here had to change.
 */
export { assertNoFieldCollisions };

assertNoFieldCollisions(
  REFERENCE_KIND_SHAPES as unknown as Record<string, Record<string, unknown>>
);

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
 * The `prose.<locale>` fields the anti-reproduction cap applies to.
 *
 * **Both `title` and `summary`, not summary alone** (T207 audit, finding F2):
 * `title` sits on the same object, is written by the same author, and held a
 * whole 9,720-character procedure with nothing objecting — the identical
 * copyright-reproduction defect T207's own review already fixed once in a
 * different field (a 9,626-char verbatim body that reached the site through
 * an unvalidated Markdown field).
 */
const FSM_CAPPED_PROSE_FIELDS = ["title", "summary"] as const;

/**
 * The anti-reproduction cap (AGENTS.md: "Cite the Factory Service Manual,
 * never reproduce it. Section references only. It is copyrighted."), applied
 * to both `title` and `summary`, per locale, so a long ES field is caught as
 * readily as a long EN one.
 */
function checkFsmSectionProseLength(
  entry: ReferenceEntryShape,
  ctx: ReferenceRefineContext
): void {
  const prose = entry.prose;
  if (typeof prose !== "object" || prose === null) return;

  for (const [locale, value] of Object.entries(prose)) {
    if (typeof value !== "object" || value === null) continue;

    for (const field of FSM_CAPPED_PROSE_FIELDS) {
      const text = (value as Record<string, unknown>)[field];
      if (typeof text !== "string") continue;
      if (text.length <= FSM_SUMMARY_MAX_LENGTH) continue;

      ctx.addIssue({
        code: "custom",
        path: ["prose", locale, field],
        message:
          `${text.length} characters, and an \`fsm-section\` ${field} may be ` +
          `at most ${FSM_SUMMARY_MAX_LENGTH}: this entry says *where* the ` +
          `manual covers something, it never reproduces what the manual says ` +
          `— the FSM is copyrighted and section references are the only thing ` +
          `this site publishes (AGENTS.md "Safety and legal"). ` +
          `refs specs/001-foundation (REF-01)`,
      });
    }
  }
}

/**
 * A VIN field sits in the section of the VIN that holds it.
 *
 * `encodes` and `positions` were independent fields until this rule existed:
 * `wmi` at positions 4–8, `country` at 17 and `serial` at 1 all parsed, which
 * made a nonsense of the reason `vin-position` is a kind of its own (T208
 * review, F1). The bound is ISO 3779's section, not a national position
 * convention — {@link VIN_FIELD_SECTIONS} says why, and why `check-digit` is
 * bounded by nothing.
 */
function checkVinPositionSection(
  entry: ReferenceEntryShape,
  ctx: ReferenceRefineContext
): void {
  const { encodes } = entry;
  if (typeof encodes !== "string") return;
  if (!(VIN_FIELDS as readonly string[]).includes(encodes)) return;

  const section = VIN_FIELD_SECTIONS[encodes as VinField];
  if (section === null) return;

  const positions = entry.positions;
  if (typeof positions !== "object" || positions === null) return;
  const { from, to } = positions as { from?: unknown; to?: unknown };
  if (typeof from !== "number") return;
  const last = typeof to === "number" ? to : from;

  if (from >= section.from && last <= section.to) return;

  ctx.addIssue({
    code: "custom",
    path: ["positions"],
    message:
      `\`${encodes}\` is encoded in positions ${section.from}–${section.to} of ` +
      `the VIN (ISO 3779), and this row places it at ` +
      `${from}${to === undefined ? "" : `–${String(to)}`}. One of the two ` +
      `fields was mistyped. The bound is the standard's section, not a ` +
      `national position convention — a market that assigns the descriptor ` +
      `differently is still writable here. ` +
      `refs specs/001-foundation (REF-01)`,
  });
}

/**
 * A `-model` code set names the thing it says it names.
 *
 * See {@link CODE_SET_DECODED_FACETS}: a `transmission-model` code decoding to
 * an engine has one of its two fields wrong, and both fields are closed
 * vocabularies, so the contradiction is visible from inside one entry.
 */
function checkCodeSetMeaning(
  entry: ReferenceEntryShape,
  ctx: ReferenceRefineContext
): void {
  const { codeSet } = entry;
  if (typeof codeSet !== "string") return;

  const expected = (
    CODE_SET_DECODED_FACETS as Record<string, string | undefined>
  )[codeSet];
  if (expected === undefined) return;

  const decoded = entry.decodesTo;
  if (typeof decoded !== "object" || decoded === null) return;
  const meaning = decoded as Record<string, unknown>;
  if (meaning[expected] !== undefined) return;

  ctx.addIssue({
    code: "custom",
    path: ["decodesTo", expected],
    message:
      `a \`${codeSet}\` code *is* the ${expected} — that is what the code set ` +
      `means — so a decoding of one states \`${expected}\`. This row decodes ` +
      `to ${Object.keys(meaning)
        .map((key) => `\`${key}\``)
        .join(
          ", "
        )} instead: either the set or the meaning is wrong. (A code ` +
      `whose ${expected} has no taxonomy entry yet is written with no ` +
      `\`decodesTo\` at all and its meaning in prose — never with an invented ` +
      `id.) refs specs/001-foundation (REF-01)`,
  });
}

/**
 * A VIN code is spelled in the alphabet a VIN actually uses, and it occupies
 * exactly the characters it claims.
 *
 * All three rules — the excluded letters, the alphanumeric-only rule, the
 * position fill — are within-entry structural contradictions, which is the line
 * this module draws for what a refinement may enforce (see
 * `checkFsmSectionCitesManual`): a five-position range holding a one-character
 * code is not a weak claim, it is two fields that cannot both be right, and a
 * code containing `O` is not a code the chart could have printed.
 *
 * They live here rather than in the field schema because {@link CODE_PATTERN}
 * is shared with `option-code` by object identity — the flatten guard's
 * requirement — so this is where a rule true of VIN codes and false of stamped
 * option codes can be stated at all. The hyphen rule is ordered before the fill
 * rule on purpose: a hyphen inflates `code.length`, so without it a hyphenated
 * code could pass the fill check while standing for fewer real VIN characters
 * than its `positions` claim (PR #63, Copilot).
 *
 * None is a check "against the source" — this module cannot read the chart.
 * They catch the transcription mistakes that a reviewer reading a table of
 * eighty single letters is least likely to catch.
 */
function checkVinCode(
  entry: ReferenceEntryShape,
  ctx: ReferenceRefineContext
): void {
  const { code } = entry;
  if (typeof code !== "string") return;

  const offending = [...VIN_EXCLUDED_LETTERS].filter((letter) =>
    code.includes(letter)
  );
  if (offending.length > 0) {
    ctx.addIssue({
      code: "custom",
      path: ["code"],
      message:
        `a VIN never contains ${VIN_EXCLUDED_LETTERS.map((letter) => `\`${letter}\``).join(", ")} ` +
        `(ISO 3779 excludes them because they are unreadable against \`1\` ` +
        `and \`0\` on a stamped plate), so \`${code}\` is a transcription of ` +
        `something else — most likely a digit. If the code is genuinely not in ` +
        `the VIN, it is an \`option-code\`. refs specs/001-foundation (REF-01)`,
    });
  }

  if (code.includes("-")) {
    ctx.addIssue({
      code: "custom",
      path: ["code"],
      message:
        `a VIN is strictly alphanumeric — every one of its 17 characters is a ` +
        `letter or a digit (ISO 3779), so \`${code}\` cannot be read out of ` +
        `one. Hyphens belong to stamped option codes (\`MB-000001\`), which is ` +
        `why the shared \`code\` field admits them and this kind does not. ` +
        `The hyphen also counts toward the length, so a hyphenated code can ` +
        `*satisfy* the position-fill rule below while standing for fewer real ` +
        `VIN characters than its \`positions\` claim (PR #63, Copilot) — the ` +
        `rule is here, at the kind, because splitting the field schema in two ` +
        `is the collision \`assertNoFieldCollisions\` exists to refuse. ` +
        `refs specs/001-foundation (REF-01)`,
    });
  }

  const positions = entry.positions;
  if (typeof positions !== "object" || positions === null) return;
  const { from, to } = positions as { from?: unknown; to?: unknown };
  if (typeof from !== "number") return;
  if (to !== undefined && typeof to !== "number") return;

  const width = vinPositionWidth({ from, to });
  if (width <= 0 || code.length === width) return;

  ctx.addIssue({
    code: "custom",
    path: ["code"],
    message:
      `\`${code}\` is ${code.length} character(s) but \`positions\` covers ` +
      `${width} (${from}${to === undefined ? "" : `–${to}`}): a VIN code fills ` +
      `exactly the positions it is read from. Either the code or the range was ` +
      `mistyped. refs specs/001-foundation (REF-01)`,
  });
}

/**
 * A decoded meaning agrees with the row's own fitment.
 *
 * The reasoning — including why this is the *only* honest way this module can
 * validate an engine or transmission id against the taxonomy's id space — is on
 * {@link DECODED_FACET_FITMENT_KEYS}. In short: the decoded id must appear in
 * the matching `fitment` facet, and `fitment` is already resolved against the
 * real taxonomy at build time (FIT-02), so an id that names nothing still fails
 * the build without this module keeping a second copy of the taxonomy.
 */
function checkDecodedMeaning(
  entry: ReferenceEntryShape,
  ctx: ReferenceRefineContext
): void {
  const decoded = entry.decodesTo;
  if (typeof decoded !== "object" || decoded === null) return;
  const meaning = decoded as Record<string, unknown>;

  const fitment =
    typeof entry.fitment === "object" && entry.fitment !== null
      ? (entry.fitment as Record<string, unknown>)
      : {};

  for (const [facet, fitmentKey] of Object.entries(
    DECODED_FACET_FITMENT_KEYS
  )) {
    const value = meaning[facet];
    if (typeof value !== "string") continue;

    const scoped = fitment[fitmentKey];
    if (Array.isArray(scoped) && scoped.includes(value)) continue;

    ctx.addIssue({
      code: "custom",
      path: ["decodesTo", facet],
      message:
        `this row means \`${value}\`, so it only applies to trucks that have ` +
        `it: \`fitment.${fitmentKey}\` must list \`${value}\` ` +
        (Array.isArray(scoped)
          ? `(it lists ${scoped.map((id) => `\`${String(id)}\``).join(", ")})`
          : `(the entry states no \`fitment.${fitmentKey}\` at all, which ` +
            `claims every one of them)`) +
        `. That is also how the id is checked against the taxonomy — the ` +
        `fitment is resolved at build time (FIT-02) and this module does not ` +
        `keep a second copy of the id space. ` +
        `refs specs/001-foundation (REF-01)`,
    });
  }

  const { modelYear } = meaning;
  if (typeof modelYear !== "number") return;

  const years =
    typeof fitment.years === "object" && fitment.years !== null
      ? (fitment.years as { from?: unknown; to?: unknown })
      : null;
  const from = typeof years?.from === "number" ? years.from : null;
  const to = typeof years?.to === "number" ? years.to : null;

  // A window disambiguates the cipher **iff** it can hold only one of a
  // thirty-apart pair, which for integer bounds is exactly: both bounds
  // stated, and `to - from < 30`. A half-open window holds every repeat on
  // its open side, so `{ to: 2021 }` reads `1982` and `2012` alike — the very
  // ambiguity the message below exists to refuse. Deliberately scoped to rows
  // that state `decodesTo.modelYear`: `fitment.years` at large is still free
  // to be half-open, and real entries rely on that.
  if (
    from !== null &&
    to !== null &&
    to - from < YEAR_CIPHER_PERIOD &&
    modelYear >= from &&
    modelYear <= to
  ) {
    return;
  }

  ctx.addIssue({
    code: "custom",
    path: ["decodesTo", "modelYear"],
    message:
      `the VIN's year cipher repeats every thirty years — \`${modelYear}\` is ` +
      `also ${modelYear - YEAR_CIPHER_PERIOD} and ` +
      `${modelYear + YEAR_CIPHER_PERIOD} — so a row that decodes a ` +
      `year states a window that can only be read one way: \`fitment.years\` ` +
      `must state BOTH \`from\` and \`to\`, span fewer than ` +
      `${YEAR_CIPHER_PERIOD} years (\`to - from < ${YEAR_CIPHER_PERIOD}\`), ` +
      `and contain ${modelYear}` +
      (years === null ? `, and this entry states no year window` : "") +
      `. refs specs/001-foundation (REF-01)`,
  });
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
 * Promotes an entry whose *subject* names towing, or jacking/lifting points —
 * two of AGENTS.md's safety-critical categories with no `GLOSSARY_SYSTEMS` id
 * of their own, so `checkSafetyFlag`'s `system`-based promotion cannot reach
 * them. Before this rule, nothing but an author's memory enforced the flag on
 * such a row (T207 audit, finding F3) — a real gap: five of the corpus's six
 * hand-flagged safety-critical entries are exactly this category.
 *
 * The detector itself — {@link requiresSafetyFlagFromSubject} — lives in
 * `src/lib/safety.ts` beside `isSafetyCritical`, not here, for the same
 * reason `systemIsSafetyCritical` does: the rule that decides whether the
 * standing bilingual safety notice renders is one rule, read from one place,
 * whether a page template or this schema is asking.
 */
function checkSafetySubject(
  entry: ReferenceEntryShape,
  ctx: ReferenceRefineContext
): void {
  if (entry.safetyCritical === true) return;
  if (systemIsSafetyCritical(entry.system)) return;
  if (!requiresSafetyFlagFromSubject(entry)) return;

  ctx.addIssue({
    code: "custom",
    path: ["safetyCritical"],
    message:
      `this entry's subject names towing, or jacking/lifting points — ` +
      `AGENTS.md safety-critical categories with no \`system\` id of their ` +
      `own — so it must set \`safetyCritical: true\` to render the standing ` +
      `bilingual safety notice (AGENTS.md "Safety and legal"). ` +
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
  checkSafetySubject(candidate, ctx);

  const { kind } = candidate;
  if (!(REFERENCE_KINDS as readonly unknown[]).includes(kind)) return;
  const referenceKind = kind as ReferenceKind;

  checkKindShape(candidate, referenceKind, ctx);

  if (referenceKind === "fsm-section") {
    checkFsmSectionCitesManual(candidate, ctx);
    checkFsmSectionProseLength(candidate, ctx);
  }

  if (referenceKind === "vin-position") {
    checkVinPositionSection(candidate, ctx);
  }

  if (referenceKind === "vin-code") checkVinCode(candidate, ctx);

  if (referenceKind === "option-code") checkCodeSetMeaning(candidate, ctx);

  if (referenceKind === "vin-code" || referenceKind === "option-code") {
    checkDecodedMeaning(candidate, ctx);
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
