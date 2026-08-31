/**
 * The vehicle taxonomy schema (VEH-01, VEH-02, VEH-03) — the spine every other
 * collection points at.
 *
 * ## What lives in this module
 *
 * The `vehicles` collection is a **taxonomy**, not an article collection: each
 * entry is one node of the vocabulary the rest of the site quotes. The node
 * type is `kind`:
 *
 * | `kind`          | one entry is…                                        | id |
 * |-----------------|------------------------------------------------------|----|
 * | `generation`    | one generation of the truck, named per market         | `GENERATION_IDS` |
 * | `market`        | one sales market, described in both locales           | `MARKETS` |
 * | `engine`        | one engine variant (`6g74-sohc`, `6g74-gdi`, …)       | kebab |
 * | `transmission`  | one gearbox variant                                   | kebab |
 * | `transfer-case` | one transfer case variant                             | kebab |
 * | `trim`          | one trim/grade name                                   | kebab |
 * | `combination`   | which powertrains existed in one gen × one market     | `combos-<gen>-<market>[-…]` |
 *
 * An entry's **`id` is its stable taxonomy id** (VEH-01 "each with a stable
 * ID"). It is not repeated in a second field: a fact stored twice is a fact
 * that can disagree with itself. References between taxonomy nodes are
 * `(kind, id)` pairs — `offerings[].engine` resolves against `engine` entries
 * only — so an id need only be unique within its kind.
 *
 * ## VEH-02 — one vehicle, market-specific naming
 *
 * The generation *is* the vehicle entity. Montero / Pajero / Shogun are three
 * names for one truck, so they are three rows of one generation entry's
 * `marketNames`, never three entries. Two things make the duplicate-per-market
 * entry structurally unavailable rather than merely discouraged:
 *
 * - generation ids are the closed `GENERATION_IDS` set, so `gen3-us` is not a
 *   spellable id, and
 * - `marketNames` rejects a repeated `market`, so one generation cannot carry
 *   two names for the same market.
 *
 * ## VEH-03 — which combinations existed
 *
 * A `combination` entry is scoped to exactly one generation and one market and
 * lists `offerings`: each offering is **one exact powertrain tuple** (one
 * engine, one transmission, one transfer case) with its own year range. It is
 * deliberately not a cross-product of arrays — "engines A, B × transmissions X,
 * Y" silently asserts A+Y, which is how a taxonomy starts lying. The market is
 * a field of the entry rather than a list on the offering for the same reason:
 * the same powertrain usually ran different years in different markets.
 *
 * ### When absence means *impossible* and when it means *unknown*
 *
 * VEH-03's rejectability rests entirely on this distinction, so it is data
 * rather than convention. These are the four rules the resolver (T203)
 * implements; `coverage` on each combination entry is what makes rules 1 and 2
 * distinguishable at all:
 *
 * 1. **A tuple absent from a `coverage: "complete"` entry is impossible.**
 *    `complete` is a claim that the sourced offerings are the *whole* list for
 *    that generation and market, so within that scope the world is closed and
 *    an unlisted tuple is a combination that never existed. Rejectable.
 * 2. **A tuple absent from a `coverage: "partial"` entry is unknown.** The
 *    entry only claims that what it lists existed. Never rejectable.
 * 3. **A (generation, market) pair with no combination entry at all is
 *    unknown, never impossible.** During T201's incremental build most pairs
 *    are simply unwritten, and answering "that vehicle never existed" because
 *    nobody has typed it up yet is a confident wrong answer on the spine —
 *    the failure mode this taxonomy exists to prevent. Missing scope belongs
 *    in the gaps report (GAP-01), not in a build error.
 * 4. **An offering's `trims` is an assertion about every trim listed;**
 *    omitting it means "not recorded at trim granularity" — unknown, not
 *    impossible, and unaffected by `coverage`, which is a claim about the
 *    offering list and not about any offering's internals.
 *
 * The asymmetry is deliberate: a wrong *impossible* silently hides a real
 * vehicle from a reader who owns it, while a wrong *unknown* only fails to
 * catch a typo. Only an explicit, sourced `complete` buys the stronger answer.
 *
 * ## What this module deliberately does not do
 *
 * Resolving a fitment against the taxonomy — nonexistent ids, impossible
 * combinations, gen/year overlap — is FIT-01/FIT-02 in `src/lib/fitment/`
 * (T203). Everything here is *within one entry*: an entry cannot see its
 * siblings, so "does engine `6g74-sohc` exist" and "is `gen2-5` inside `gen2`"
 * are not questions a Zod schema can answer. The exported constants, schemas
 * and types are the vocabulary that resolver, T201's content and T202's
 * graders are written against.
 *
 * ## Numbers
 *
 * Production years, displacement and gear counts are shared `data` at the top
 * level of an entry, never prose (AGENTS.md "numbers are never translated"),
 * which also puts them in scope for `check:citations` (REF-02): a taxonomy
 * entry stating years with an empty `sources` array fails `npm run verify`.
 *
 * refs specs/001-foundation (VEH-01, VEH-02, VEH-03)
 */
import { z } from "astro/zod";
// `.ts` on purpose: this module is on FIT-02's build-hook import chain, which
// Node's ESM resolver walks directly. See `src/lib/fitment/index.ts`.
import { defineEntrySchema } from "./entry.ts";

/* -------------------------------------------------------------------------
 * Node kinds
 * ---------------------------------------------------------------------- */

export const VEHICLE_KINDS = [
  "generation",
  "market",
  "engine",
  "transmission",
  "transfer-case",
  "trim",
  "combination",
] as const;

export type VehicleKind = (typeof VEHICLE_KINDS)[number];

export const vehicleKindSchema = z.enum(VEHICLE_KINDS);

/* -------------------------------------------------------------------------
 * Markets — spec §2 "Market"
 *
 * A closed set rather than a free id: spec §2 fixes the list, and a closed
 * enum means every market reference in every collection is checked by the
 * build instead of by review. `market` entries are still worth writing — they
 * carry the bilingual prose for "Costa Rica / LatAm" — but their id can only
 * ever be one of these, so the enum and the entries cannot drift apart.
 * ---------------------------------------------------------------------- */

export const MARKETS = [
  "us",
  "cr",
  "uk",
  "au",
  "jdm",
  "eu",
  "me",
  "global",
] as const;

export type Market = (typeof MARKETS)[number];

export const marketSchema = z.enum(MARKETS);

/* -------------------------------------------------------------------------
 * Generations — spec §2 "Generation"
 *
 * `gen2-5` is the 1997 facelift. Spec §2 files it under Gen 2, but FIT-04
 * requires a 1999 vehicle to be able to match "both Gen 2.5 and Gen 3", so it
 * needs an id a fitment can name. It is therefore a generation id whose entry
 * declares `parentGeneration: "gen2"`; the containment is content, stated once,
 * and the resolver (T203) is what expands `gens: ["gen2"]` to its children.
 *
 * Closed on purpose: adding a generation is a taxonomy change, which AGENTS.md
 * requires to be deliberate rather than a content edit.
 * ---------------------------------------------------------------------- */

export const GENERATION_IDS = [
  "gen1",
  "gen2",
  "gen2-5",
  "gen3",
  "gen4",
] as const;

export type GenerationId = (typeof GENERATION_IDS)[number];

export const generationIdSchema = z.enum(GENERATION_IDS);

/* -------------------------------------------------------------------------
 * Engines — VEH-01
 *
 * The *family* is closed (spec §2 fixes it) and so is each family's fuel: an
 * entry claiming a petrol 4M41 is rejected at build time. The *variant* is the
 * entry id (`6g74-sohc` vs `6g74-gdi`), left open, because "6G74 SOHC/GDI" is
 * one family with several heads and fuel systems and the spec does not
 * enumerate them.
 * ---------------------------------------------------------------------- */

export const ENGINE_FAMILIES = [
  "4g54",
  "6g72",
  "6g74",
  "6g75",
  "4d56",
  "4m40",
  "4m41",
] as const;

export type EngineFamily = (typeof ENGINE_FAMILIES)[number];

export const FUEL_TYPES = ["petrol", "diesel"] as const;

export type FuelType = (typeof FUEL_TYPES)[number];

/** Spec §2 splits the families into petrol and diesel; this is that split. */
export const ENGINE_FAMILY_FUEL: Readonly<Record<EngineFamily, FuelType>> = {
  "4g54": "petrol",
  "6g72": "petrol",
  "6g74": "petrol",
  "6g75": "petrol",
  "4d56": "diesel",
  "4m40": "diesel",
  "4m41": "diesel",
};

/** Head layout. Spec §2 names both (`6G72 SOHC/DOHC`). */
export const VALVETRAINS = ["sohc", "dohc"] as const;

export type Valvetrain = (typeof VALVETRAINS)[number];

/**
 * Fuel delivery. `gdi` is spec-named (`6G74 SOHC/GDI`); the rest are the
 * systems the named families shipped with. A vocabulary, not a claim — which
 * value applies to which engine is content (T201).
 */
export const FUEL_SYSTEMS = [
  "carburettor",
  "mpi",
  "gdi",
  "indirect-injection",
  "di-d",
] as const;

export type FuelSystem = (typeof FUEL_SYSTEMS)[number];

/* -------------------------------------------------------------------------
 * Transmissions and transfer cases — VEH-01
 * ---------------------------------------------------------------------- */

export const TRANSMISSION_TYPES = ["manual", "automatic"] as const;

export type TransmissionType = (typeof TRANSMISSION_TYPES)[number];

/** Spec §2: Easy Select, Super Select I/II. */
export const TRANSFER_CASE_FAMILIES = [
  "easy-select",
  "super-select-i",
  "super-select-ii",
] as const;

export type TransferCaseFamily = (typeof TRANSFER_CASE_FAMILIES)[number];

/* -------------------------------------------------------------------------
 * Drive — spec §2's fitment shape (OWNER RULING, 2026-08-30)
 * ---------------------------------------------------------------------- */

/**
 * What a `fitment.drive` id may say. **Owner ruling, 2026-08-30**, closing the
 * open item T200's review raised and T202 refused to guess at: spec §2's
 * fitment shape carries `drive`, but VEH-01 defines no drive taxonomy, so
 * `fitmentSchema` accepted any string and nothing could resolve it.
 *
 * The ruling is that drive is a **closed vocabulary, not an entity kind** —
 * exactly the T200 reviewer's suggestion. There is no `kind: "drive"` node and
 * no drive entry to write, because there is nothing to say about "4wd" that a
 * transfer-case entry does not already say better. It is a two-valued
 * discriminator a fitment can restrict on, and that is all:
 *
 * - `2wd` — the two-wheel-drive variants (spec §2 markets sold them).
 * - `4wd` — everything with a transfer case.
 *
 * Closed for the same reason `GENERATION_IDS` and `MARKETS` are: a free-form
 * id makes `4WD`, `four-wheel-drive` and `4wd` three spellings of one fact.
 * Widening it (a hypothetical `awd`) is a taxonomy change, not a content edit.
 *
 * Resolution semantics live in `src/lib/fitment/` (T203): drive is a facet
 * like `markets` — omitted from a fitment means no drive restriction, and a
 * `VehicleSelection` may carry an optional `drive`.
 */
export const DRIVE_TYPES = ["2wd", "4wd"] as const;

export type DriveType = (typeof DRIVE_TYPES)[number];

export const driveTypeSchema = z.enum(DRIVE_TYPES);

/* -------------------------------------------------------------------------
 * Combination coverage — VEH-03
 * ---------------------------------------------------------------------- */

/**
 * How much of its (generation, market) scope a combination entry claims to
 * cover — the difference between "this tuple never existed" and "nobody has
 * written it down yet" (rules 1 and 2 in the VEH-03 section above).
 *
 * - `complete` — the offerings are the whole list for this generation and
 *   market. An unlisted tuple is *impossible* and the resolver may reject it.
 * - `partial` — the offerings are what has been sourced so far. An unlisted
 *   tuple is *unknown* and is never rejected; the missing coverage is gaps-report
 *   material (GAP-01).
 *
 * Required, with no default. A default would pick one of those readings on the
 * author's behalf, and the whole point of the field is that the closed-world
 * claim be made deliberately by someone who checked a source.
 */
export const COMBINATION_COVERAGE = ["complete", "partial"] as const;

export type CombinationCoverage = (typeof COMBINATION_COVERAGE)[number];

/* -------------------------------------------------------------------------
 * Shared primitives
 * ---------------------------------------------------------------------- */

/**
 * Stable ids are kebab-case: lowercase alphanumerics joined by single hyphens.
 * Uppercase or underscored ids would make `6G74_SOHC` and `6g74-sohc` two
 * spellings of one engine, and every reference a coin flip.
 */
export const TAXONOMY_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * A reference to a taxonomy node by id. Exported so the fitment engine (T203)
 * validates the id strings in an entry's `fitment` against the same rule the
 * taxonomy stores them under, rather than a second copy of the regex.
 */
export const taxonomyIdSchema = () =>
  z.string().regex(TAXONOMY_ID_PATTERN, { message: "must be a kebab-case id" });

/**
 * Chassis codes as factory literature prints them: `L040`, `V20`, `V73W`. A
 * letter, then two to five more characters — every code the spec names is at
 * least three long, so a two-character `V6` is a truncation, not a code.
 */
export const CHASSIS_CODE_PATTERN = /^[A-Z][A-Z0-9]{2,5}$/;

/**
 * Production years the taxonomy covers, from spec §1 ("all generations
 * (1982–2021)") and §2. Bounded so a transposed digit (`1892`, `2201`) is a
 * build error rather than a silently impossible fitment. Extending coverage
 * past 2021 is a taxonomy change, not a content edit.
 */
export const PRODUCTION_YEAR_RANGE = { from: 1982, to: 2021 } as const;

const yearSchema = () =>
  z
    .number()
    .int()
    .min(PRODUCTION_YEAR_RANGE.from)
    .max(PRODUCTION_YEAR_RANGE.to);

/**
 * A production span. `to: null` means "open at the time of the cited source",
 * which is the honest value for a range whose end no source states — the
 * alternative is an invented end year.
 */
const yearRangeSchema = () =>
  z
    .object({ from: yearSchema(), to: yearSchema().nullable() })
    .strict()
    .refine((range) => range.to === null || range.to >= range.from, {
      message: "`to` must not be earlier than `from`",
      path: ["to"],
    });

const nonBlankString = () =>
  z
    .string()
    .min(1, { message: "must not be blank" })
    .refine((value) => value.trim().length > 0, {
      message: "must not be blank",
    });

/** Rejects an array holding the same key twice, naming the repeat. */
function uniqueBy<T>(
  schema: z.ZodType<T[]>,
  key: (item: T) => string,
  label: string
) {
  return schema.superRefine((items, ctx) => {
    const seen = new Map<string, number>();
    items.forEach((item, index) => {
      const value = key(item);
      const first = seen.get(value);
      if (first === undefined) {
        seen.set(value, index);
        return;
      }
      ctx.addIssue({
        code: "custom",
        path: [index],
        message: `duplicate ${label} \`${value}\` (already at index ${first})`,
      });
    });
  });
}

/* -------------------------------------------------------------------------
 * Per-kind data shapes
 * ---------------------------------------------------------------------- */

/** One market's name for one generation — VEH-02. */
export const marketNameSchema = z
  .object({
    market: marketSchema,
    /**
     * `Montero`, `Pajero`, `Shogun`. A proper noun, identical in both locales,
     * so it is shared data and not prose.
     */
    name: nonBlankString(),
  })
  .strict();

export type MarketName = z.infer<typeof marketNameSchema>;

/** One exact powertrain tuple offered over one year range — VEH-03. */
export const offeringSchema = z
  .object({
    years: yearRangeSchema(),
    /** id of an `engine` entry. */
    engine: taxonomyIdSchema(),
    /** id of a `transmission` entry. */
    transmission: taxonomyIdSchema(),
    /** id of a `transfer-case` entry. */
    transferCase: taxonomyIdSchema(),
    /**
     * ids of `trim` entries this exact powertrain was available on. Omitted
     * means "not recorded at trim granularity" — unknown, not impossible.
     */
    trims: uniqueBy(
      z.array(taxonomyIdSchema()).min(1),
      (id) => id,
      "trim"
    ).optional(),
  })
  .strict();

export type Offering = z.infer<typeof offeringSchema>;

/** The powertrain half of an offering — the tuple VEH-03 is about. */
function powertrainKey(offering: Offering): string {
  return `${offering.engine}|${offering.transmission}|${offering.transferCase}`;
}

function rangesOverlap(a: Offering["years"], b: Offering["years"]): boolean {
  const aTo = a.to ?? PRODUCTION_YEAR_RANGE.to;
  const bTo = b.to ?? PRODUCTION_YEAR_RANGE.to;
  return a.from <= bTo && b.from <= aTo;
}

/**
 * Two rows for the same powertrain whose year ranges overlap are a
 * contradiction, not extra detail: within one generation and market the same
 * tuple has exactly one span, so an overlap means one of the two rows is wrong
 * and the resolver would have no way to choose.
 */
const offeringsSchema = z
  .array(offeringSchema)
  .min(1)
  .superRefine((offerings, ctx) => {
    offerings.forEach((offering, index) => {
      for (let earlier = 0; earlier < index; earlier += 1) {
        const other = offerings[earlier];
        if (other === undefined) continue;
        if (powertrainKey(other) !== powertrainKey(offering)) continue;
        if (!rangesOverlap(other.years, offering.years)) continue;
        ctx.addIssue({
          code: "custom",
          path: [index, "years"],
          message:
            `this powertrain (${powertrainKey(offering)}) already covers an ` +
            `overlapping year range at index ${earlier}: one tuple has one ` +
            `span per generation and market (VEH-03)`,
        });
      }
    });
  });

/**
 * The taxonomy fields each kind carries, and *only* those: an entry is parsed
 * against its kind's shape strictly, so a `generation` that declares
 * `displacementCc` is told the field belongs to another kind.
 */
export const VEHICLE_KIND_SHAPES = {
  generation: {
    /** `L040`, `V20`/`V40`, `V60`/`V70`, `V80`/`V90` — spec §2. */
    chassisCodes: uniqueBy(
      z
        .array(
          z.string().regex(CHASSIS_CODE_PATTERN, {
            message: "must be an uppercase chassis code such as `V60`",
          })
        )
        .min(1),
      (code) => code,
      "chassis code"
    ),
    production: yearRangeSchema(),
    /** Set on a facelift generation (`gen2-5` → `gen2`). */
    parentGeneration: generationIdSchema.optional(),
    /** Every market this generation was sold in, with the name it was sold under. */
    marketNames: uniqueBy(
      z.array(marketNameSchema).min(1),
      (entry) => entry.market,
      "market"
    ),
  },
  /**
   * A market carries no shared data of its own — its id is the market and its
   * human description is the bilingual prose every entry already has.
   */
  market: {},
  engine: {
    engineFamily: z.enum(ENGINE_FAMILIES),
    fuel: z.enum(FUEL_TYPES),
    displacementCc: z.number().int().min(1000).max(9999),
    valvetrain: z.enum(VALVETRAINS).optional(),
    fuelSystem: z.enum(FUEL_SYSTEMS).optional(),
  },
  transmission: {
    transmissionType: z.enum(TRANSMISSION_TYPES),
    gears: z.number().int().min(3).max(8),
  },
  "transfer-case": {
    transferCaseFamily: z.enum(TRANSFER_CASE_FAMILIES),
  },
  trim: {
    /** Markets this trim name was used in; trim names are market-specific. */
    markets: uniqueBy(
      z.array(marketSchema).min(1),
      (market) => market,
      "market"
    ),
  },
  combination: {
    generation: generationIdSchema,
    market: marketSchema,
    /**
     * Whether `offerings` is the whole list for this scope. Decides whether an
     * unlisted tuple is impossible or merely unknown — see the VEH-03 section
     * of the module docstring.
     */
    coverage: z.enum(COMBINATION_COVERAGE),
    offerings: offeringsSchema,
  },
} as const satisfies Record<VehicleKind, z.ZodRawShape>;

export type GenerationData = z.infer<
  z.ZodObject<(typeof VEHICLE_KIND_SHAPES)["generation"]>
>;
export type EngineData = z.infer<
  z.ZodObject<(typeof VEHICLE_KIND_SHAPES)["engine"]>
>;
export type TransmissionData = z.infer<
  z.ZodObject<(typeof VEHICLE_KIND_SHAPES)["transmission"]>
>;
export type TransferCaseData = z.infer<
  z.ZodObject<(typeof VEHICLE_KIND_SHAPES)["transfer-case"]>
>;
export type TrimData = z.infer<
  z.ZodObject<(typeof VEHICLE_KIND_SHAPES)["trim"]>
>;
export type CombinationData = z.infer<
  z.ZodObject<(typeof VEHICLE_KIND_SHAPES)["combination"]>
>;

/**
 * Every taxonomy field, optional, as the collection's shared shape.
 *
 * Why optional-and-then-refined rather than a `z.discriminatedUnion`: the
 * collection graders in `tests/schemas/collections.test.ts` parse a fixture
 * with no `kind` and require the issue list to name `prose.es`. A discriminated
 * union answers a missing discriminant with one issue at the root and never
 * reaches `prose`, so the bilingual rule would stop being gradeable on this
 * collection. One strict object reports *all* of an entry's problems — the
 * missing locale and the wrong taxonomy field, in the same run — and requiredness
 * per kind is recovered exactly, by parsing the entry against
 * `VEHICLE_KIND_SHAPES[kind]` in the refinement below.
 *
 * Field names are unique across kinds (`engineFamily`, `transferCaseFamily`,
 * `transmissionType`) so this flattening never has to union two different
 * enums into one field.
 */
export const vehicleSharedShape = {
  kind: vehicleKindSchema,
  ...Object.fromEntries(
    Object.values(VEHICLE_KIND_SHAPES).flatMap((shape) =>
      Object.entries(shape).map(
        ([field, schema]) => [field, schema.optional()] as const
      )
    )
  ),
} as z.ZodRawShape;

/** Every field name owned by a kind — `kind` itself is not one. */
const TAXONOMY_FIELDS: readonly string[] = Object.keys(
  vehicleSharedShape
).filter((field) => field !== "kind");

/* -------------------------------------------------------------------------
 * Per-kind validation
 * ---------------------------------------------------------------------- */

/**
 * The slice of Zod's refinement context these rules use. Declared structurally
 * (rather than importing `z.RefinementCtx`) so `checkVehicleTaxonomy` can be
 * called with a plain collector from a test or from T203's resolver.
 */
export interface TaxonomyRefineContext {
  addIssue(issue: {
    code: "custom";
    path: PropertyKey[];
    message: string;
  }): void;
}

interface VehicleEntryShape {
  id?: unknown;
  kind?: unknown;
  fitment?: { gens?: unknown; markets?: unknown };
  [field: string]: unknown;
}

/** The id rule for each kind, as a predicate plus the text of the rule. */
const ID_RULES: Readonly<
  Record<
    VehicleKind,
    { readonly expectation: string; test(id: string): boolean }
  >
> = {
  generation: {
    expectation: `one of ${GENERATION_IDS.join(", ")}`,
    test: (id) => (GENERATION_IDS as readonly string[]).includes(id),
  },
  market: {
    expectation: `one of ${MARKETS.join(", ")}`,
    test: (id) => (MARKETS as readonly string[]).includes(id),
  },
  engine: { expectation: "a kebab-case id", test: kebab },
  transmission: { expectation: "a kebab-case id", test: kebab },
  "transfer-case": { expectation: "a kebab-case id", test: kebab },
  trim: { expectation: "a kebab-case id", test: kebab },
  combination: {
    // The gen/market scope is re-checked against the entry's own fields below;
    // this only enforces the shape.
    expectation: "`combos-<generation>-<market>`, optionally suffixed",
    test: kebab,
  },
};

function kebab(id: string): boolean {
  return TAXONOMY_ID_PATTERN.test(id);
}

/** `combos-gen3-cr`, or `combos-gen3-cr-diesel` when one file is not enough. */
export function combinationIdPrefix(
  generation: GenerationId,
  market: Market
): string {
  return `combos-${generation}-${market}`;
}

function checkId(
  entry: VehicleEntryShape,
  kind: VehicleKind,
  ctx: TaxonomyRefineContext
) {
  const { id } = entry;
  if (typeof id !== "string") return;

  const rule = ID_RULES[kind];
  if (!rule.test(id)) {
    ctx.addIssue({
      code: "custom",
      path: ["id"],
      message:
        `\`${id}\` is not a valid id for a \`${kind}\` entry: it must be ` +
        `${rule.expectation} (VEH-01 — every taxonomy node has a stable id)`,
    });
    return;
  }

  if (kind !== "combination") return;

  const { generation, market } = entry;
  if (typeof generation !== "string" || typeof market !== "string") return;

  const prefix = combinationIdPrefix(
    generation as GenerationId,
    market as Market
  );
  if (id !== prefix && !id.startsWith(`${prefix}-`)) {
    ctx.addIssue({
      code: "custom",
      path: ["id"],
      message:
        `a combination entry's id must start with \`${prefix}\` so its scope ` +
        `is visible in the id and two files cannot silently describe the same ` +
        `generation and market (VEH-03); got \`${id}\``,
    });
  }
}

/**
 * Parses the entry's taxonomy fields against its kind, and re-paths the
 * resulting issues onto the entry so SCF-04's "names the file and field" still
 * holds: a missing field is reported at that field, and a field belonging to
 * another kind is reported at itself rather than at the object root.
 */
function checkKindShape(
  entry: VehicleEntryShape,
  kind: VehicleKind,
  ctx: TaxonomyRefineContext
) {
  const present: Record<string, unknown> = {};
  for (const field of TAXONOMY_FIELDS) {
    if (entry[field] !== undefined) present[field] = entry[field];
  }

  const outcome = z
    .object(VEHICLE_KIND_SHAPES[kind] as z.ZodRawShape)
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
            `\`${key}\` is not a field of a \`${kind}\` entry — it belongs to ` +
            `another taxonomy kind (VEH-01)`,
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
 * An entry's fitment has to agree with what the entry is about. A generation
 * entry whose fitment names a different generation, or a combination entry
 * whose fitment does not name exactly the generation and market it describes,
 * is incoherent in a way no downstream page could recover from — and it is the
 * cheapest possible check, because both halves are in the same file.
 */
function checkFitmentCoherence(
  entry: VehicleEntryShape,
  kind: VehicleKind,
  ctx: TaxonomyRefineContext
) {
  const gens = entry.fitment?.gens;
  const markets = entry.fitment?.markets;
  const genList = Array.isArray(gens) ? gens : [];
  const marketList = Array.isArray(markets) ? markets : [];

  if (kind === "generation" && typeof entry.id === "string") {
    if (genList.length !== 1 || genList[0] !== entry.id) {
      ctx.addIssue({
        code: "custom",
        path: ["fitment", "gens"],
        message:
          `a generation entry describes exactly its own generation: expected ` +
          `["${entry.id}"], got ${JSON.stringify(genList)} (VEH-02 — one ` +
          `entry per generation, not one per market)`,
      });
    }

    const named = new Set(
      (Array.isArray(entry.marketNames) ? entry.marketNames : []).flatMap(
        (row) =>
          typeof row === "object" && row !== null && "market" in row
            ? [String((row as { market: unknown }).market)]
            : []
      )
    );
    for (const [index, market] of marketList.entries()) {
      if (named.size > 0 && !named.has(String(market))) {
        ctx.addIssue({
          code: "custom",
          path: ["fitment", "markets", index],
          message:
            `\`${String(market)}\` is not one of this generation's ` +
            `\`marketNames\`: name the market before claiming the generation ` +
            `was sold there (VEH-02)`,
        });
      }
    }
  }

  if (kind !== "combination") return;

  /*
   * Both halves of the scope are checked the same way, and both exactly.
   *
   * `fitment.markets` is optional in the base fitment shape, where omitting it
   * correctly means "no market restriction" — a torque figure applies in every
   * market. A combination entry is the one place that reading is wrong: the
   * entry's every fact is scoped to one market by construction, so an omitted
   * `markets` would publish a single market's powertrain list as if it were
   * global. Requiring it here does not change the base rule; it says this kind
   * of entry has no unrestricted-market form.
   *
   * Exact rather than "includes" for the same reason the generation kind is
   * exact: a fitment naming *more* than the entry's scope claims the entry's
   * facts cover vehicles it says nothing about.
   */
  const { generation, market } = entry;
  if (typeof generation === "string") {
    if (genList.length !== 1 || genList[0] !== generation) {
      ctx.addIssue({
        code: "custom",
        path: ["fitment", "gens"],
        message:
          `this entry records combinations for \`${generation}\` only, so its ` +
          `fitment is exactly ["${generation}"], not ` +
          `${JSON.stringify(genList)} (VEH-03)`,
      });
    }
  }
  if (typeof market === "string") {
    if (marketList.length !== 1 || marketList[0] !== market) {
      ctx.addIssue({
        code: "custom",
        path: ["fitment", "markets"],
        message:
          `this entry records combinations for the \`${market}\` market only, ` +
          `so its fitment is exactly ["${market}"], not ` +
          `${JSON.stringify(marketList)} — an omitted \`markets\` would ` +
          `publish one market's powertrains as if they were global (VEH-03)`,
      });
    }
  }
}

/** A generation is not its own parent; deeper cycles are T203's job. */
function checkParentGeneration(
  entry: VehicleEntryShape,
  ctx: TaxonomyRefineContext
) {
  if (entry.parentGeneration === undefined) return;
  if (entry.parentGeneration !== entry.id) return;
  ctx.addIssue({
    code: "custom",
    path: ["parentGeneration"],
    message: "a generation cannot be its own parent",
  });
}

/** Spec §2 fixes which engine families are petrol and which are diesel. */
function checkEngineFuel(entry: VehicleEntryShape, ctx: TaxonomyRefineContext) {
  const family = entry.engineFamily;
  const fuel = entry.fuel;
  if (typeof family !== "string" || typeof fuel !== "string") return;
  const expected = ENGINE_FAMILY_FUEL[family as EngineFamily];
  if (expected === undefined || expected === fuel) return;
  ctx.addIssue({
    code: "custom",
    path: ["fuel"],
    message:
      `the ${family.toUpperCase()} is a ${expected} engine (spec §2), but ` +
      `this entry says \`${fuel}\``,
  });
}

/* -------------------------------------------------------------------------
 * The collection schema
 * ---------------------------------------------------------------------- */

/**
 * Applies every taxonomy rule to an entry that already satisfies the base
 * entry shape. Exported so the rules can be unit-tested — and read — without
 * reconstructing the whole collection schema.
 */
export function checkVehicleTaxonomy(
  entry: unknown,
  ctx: TaxonomyRefineContext
): void {
  if (typeof entry !== "object" || entry === null) return;
  const candidate = entry as VehicleEntryShape;

  const { kind } = candidate;
  if (!(VEHICLE_KINDS as readonly unknown[]).includes(kind)) return;
  const vehicleKind = kind as VehicleKind;

  checkId(candidate, vehicleKind, ctx);
  checkKindShape(candidate, vehicleKind, ctx);
  checkFitmentCoherence(candidate, vehicleKind, ctx);
  if (vehicleKind === "generation") checkParentGeneration(candidate, ctx);
  if (vehicleKind === "engine") checkEngineFuel(candidate, ctx);
}

/**
 * The `vehicles` collection schema: the base entry envelope (id, fitment,
 * confidence, sources, both prose locales) plus the taxonomy rules above.
 *
 * The prose shape is a parameter rather than a local constant so
 * `src/content.config.ts` keeps passing the one `baseProse` every collection
 * shares — a second definition of "title and summary" is a second thing to
 * forget to translate.
 */
export function vehiclesEntrySchema<Prose extends z.ZodRawShape>(prose: Prose) {
  return defineEntrySchema(vehicleSharedShape, prose).superRefine(
    (entry, ctx) => {
      checkVehicleTaxonomy(entry, ctx);
    }
  );
}
