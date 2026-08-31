/**
 * Base entry schema building blocks (T104) — the shared `data` / locale-keyed
 * `prose` split every content collection is assembled from.
 *
 * ## Why the schemas live here and not in `src/content.config.ts`
 *
 * `astro:content` is a virtual module: Vitest cannot resolve it without the
 * Astro Vite plugin, so anything importing it is awkward to unit-test. The Zod
 * building blocks therefore live in this plain module (Zod comes from
 * `astro/zod`, the same instance `astro:content` re-exports) and
 * `src/content.config.ts` imports them to call `defineCollection`. SCF-01 is
 * still satisfied: the collections are *defined in* `content.config.ts`, they
 * are just *built from* this module.
 *
 * ## The rules this module enforces
 *
 * - `prose.en` and `prose.es` are both required, with no escape hatch
 *   (I18N-06). A blank or whitespace-only prose string is treated as missing:
 *   a present-but-empty locale is the obvious loophole around "both or
 *   neither".
 * - Numbers are never translated (AGENTS.md). `defineEntrySchema` refuses to
 *   build a schema whose prose shape declares a numeric field, *at any depth* —
 *   a figure nested one level inside prose is duplicated per locale exactly
 *   like a top-level one.
 * - Unknown fields are named, not silently stripped (SCF-04): every object in
 *   the entry shape is strict.
 * - Every entry carries a `fitment` and a `confidence` tier (AGENTS.md), and
 *   every source carries an `archiveUrl` (forum threads die and take the
 *   evidence with them).
 *
 * refs specs/001-foundation (I18N-05, I18N-06, SCF-01, SCF-04)
 */
import { z } from "astro/zod";
// `.ts` on purpose throughout: this module is on FIT-02's build-hook import
// chain, which Node's ESM resolver walks directly. See `src/lib/fitment/index.ts`.
import { LOCALES, type Locale } from "../i18n/routing.ts";
// Cyclic by construction — see `driveListSchema` below for why that is safe
// here and why the constant lives in `vehicles.ts` rather than in this module.
import { DRIVE_TYPES } from "./vehicles.ts";

/* -------------------------------------------------------------------------
 * Structural surface the graders read (see tests/helpers/schema-outcome.ts).
 * ---------------------------------------------------------------------- */

export interface SchemaIssue {
  readonly code: string;
  readonly path: readonly PropertyKey[];
  readonly message: string;
  /** Present on `unrecognized_keys` issues. */
  readonly keys?: readonly string[];
}

/* -------------------------------------------------------------------------
 * Locales — spec §2 "Locale", I18N-06
 *
 * Re-exported from `src/i18n/routing.ts` rather than redeclared: the set of
 * locales is one fact, and a routing layer that knows about a locale the
 * schemas do not (or the reverse) is exactly the drift I18N-01 forbids.
 * ---------------------------------------------------------------------- */

export { LOCALES } from "../i18n/routing.ts";
export type { Locale } from "../i18n/routing.ts";

export const localeSchema = z.enum(LOCALES);

/* -------------------------------------------------------------------------
 * Confidence tiers — spec §2, AGENTS.md "Facts"
 * ---------------------------------------------------------------------- */

/**
 * The five tiers, ordered **strongest evidence first** (index 0 = strongest),
 * per the total order the owner ratified on 2026-08-27:
 * `fsm-confirmed > tsb > community-consensus > first-hand > anecdotal`.
 *
 * Index order is the contract: rendering rules ("anything below `tsb`",
 * PRB-04's "`community-consensus` or lower") compare positions in this array
 * rather than re-listing the chain.
 */
export const CONFIDENCE_TIERS = [
  "fsm-confirmed",
  "tsb",
  "community-consensus",
  "first-hand",
  "anecdotal",
] as const;

export type ConfidenceTier = (typeof CONFIDENCE_TIERS)[number];

export const confidenceSchema = z.enum(CONFIDENCE_TIERS);

/**
 * Tiers whose whole meaning is "a document says so": claiming one while citing
 * nothing is a structural falsehood, so `defineEntrySchema` rejects it.
 *
 * The weaker tiers stay citable-but-not-required on purpose — `first-hand` is
 * the owner's own truck and `anecdotal` is by definition unsourced. Per-figure
 * citation (REF-02, "every numeric spec carries a source") is `check:citations`
 * in T105; this is only the tier/evidence contradiction a schema can see.
 */
export const CITATION_REQUIRED_TIERS = ["fsm-confirmed", "tsb"] as const;

/* -------------------------------------------------------------------------
 * Shared string primitives
 * ---------------------------------------------------------------------- */

const BLANK_MESSAGE = "must not be blank";

/**
 * A string that is present *and* says something.
 *
 * Exported (T700) so collection schemas built on top of this module reuse the
 * same "blank is missing" rule instead of each reinventing `z.string().min(1)`
 * — a bare `min(1)` accepts `" "`, which is exactly the loophole this module
 * exists to close.
 */
export const nonBlankString = () =>
  z
    .string()
    .min(1, { message: BLANK_MESSAGE })
    .refine((value) => value.trim().length > 0, { message: BLANK_MESSAGE });

/**
 * `astro/zod`'s `.url()` accepts any parseable URL, including
 * `javascript:alert(1)` — a stored-XSS shape we would happily render into an
 * anchor. Sources are documents on the web, so the protocol is checked
 * explicitly rather than left to the URL parser. This subsumes `.url()`:
 * anything `new URL()` cannot parse is rejected here too.
 */
function isHttpUrl(value: string): boolean {
  try {
    const { protocol } = new URL(value);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Exported (T700) for the same reason as `nonBlankString`: every URL any
 * collection stores — a community's homepage as much as a source document —
 * goes through this protocol check, never through `.url()` alone.
 */
export const httpUrlSchema = () =>
  z.string().refine(isHttpUrl, { message: "must be an http(s) URL" });

/** `YYYY-MM-DD`, the form every `accessed` date is recorded in. */
export const isoDateSchema = () =>
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { message: "must be YYYY-MM-DD" });

/* -------------------------------------------------------------------------
 * Sources — plan.md "Content conventions", AGENTS.md "Cite what you read"
 * ---------------------------------------------------------------------- */

/**
 * What kind of document a citation points at, per plan.md "Content
 * conventions" (list amended 2026-08-28 to add `manufacturer` and
 * `reference`).
 *
 * The array order is descriptive, not semantic. Unlike `CONFIDENCE_TIERS` —
 * whose index order is an explicit contract — nothing compares positions here;
 * the kinds merely read strongest-to-weakest as a reading aid.
 *
 * A source kind is an **evidence class**, not a confidence tier. The two stay
 * separate fields, and *this schema* still does not map one onto the other —
 * but as of T207 the relationship is no longer unconstrained.
 *
 * ## The kind→tier coherence rule (T207, 2026-08-30) — NORMATIVE
 *
 * The documentary tiers ({@link CITATION_REQUIRED_TIERS}: `fsm-confirmed`,
 * `tsb`) require at least one source of a documentary kind
 * ({@link FACTORY_DOCUMENTED_KINDS}: `fsm`, `tsb`, `manufacturer`). It
 * restates AGENTS.md's own definition — "`fsm-confirmed` means
 * **factory-documented**: the FSM, official spec sheets, factory brochures and
 * catalogues — manufacturer primary literature (owner ruling 2026-08-28)" — so
 * an `fsm-confirmed` entry cited only by a forum thread is not a strong claim
 * weakly supported, it is a false label.
 *
 * The rule is enforced by `scripts/check-citations.mjs`, **not here**, for the
 * reason recorded on the tier/source invariant that landed the same way:
 * whether the documents an entry cites are good enough for the tier it claims
 * is content policy, and this module's refinements are reserved for structural
 * contradictions a shape can see (a tier that claims a document exists while
 * `sources` is empty). Kind is only visible to a schema as a string in an
 * array; "is this evidence strong enough" is not.
 *
 * The per-kind notes below say which tiers each kind can support. The
 * `fsm`/`tsb`/`manufacturer` line is the normative rule above. **Everything
 * the weaker kinds say is reader guidance, and nothing enforces it** — a
 * `community-consensus` entry cited only by a `vendor` catalogue is legal, and
 * whether it should be is a question for review, not for a gate that cannot
 * read the document.
 *
 * - `fsm` — the Factory Service Manual. Supports `fsm-confirmed`. *(normative)*
 * - `tsb` — a Technical Service Bulletin. Supports `tsb`, and `fsm-confirmed`
 *   for a figure the bulletin itself states — a TSB is factory primary
 *   literature. *(normative)*
 * - `manufacturer` — factory literature that is not the FSM: spec sheets,
 *   brochures, catalogues, official Mitsubishi pages. Added with the owner's
 *   "factory-documented" ruling (AGENTS.md, 2026-08-28), which widened the top
 *   tier from *the FSM alone* to *manufacturer primary literature* — so this
 *   kind can support `fsm-confirmed`. Before it existed, a factory brochure
 *   had to file as `vendor`, which reads as "a shop that sells the part" and
 *   lost the fact that the manufacturer itself published the figure.
 *   *(normative)*
 * - `forum` — an enthusiast thread or club post. Supports
 *   `community-consensus` at best, and only in aggregate. *(guidance)*
 * - `video` — a build or repair video. Same standing as `forum`. *(guidance)*
 * - `vendor` — a parts seller's catalogue or fitment guide. Good for part
 *   numbers and supersession, not for factory figures. *(guidance)*
 * - `reference` — tertiary or institutional reference: dictionaries (DLE,
 *   Diccionario de americanismos), encyclopedias, and government or official
 *   pages (gov.uk MOT, COSEVI RTV). Added alongside `manufacturer`. It is the
 *   honest kind for the terminology and jurisdiction claims the glossary and
 *   market entries make, and supports those at `community-consensus` level: a
 *   dictionary settles what a word means and a ministry page settles what a
 *   rule is, but neither is factory evidence about a truck. **Wikipedia
 *   belongs here**, not under `forum`, where it was previously filed for lack
 *   of anywhere better — an encyclopedia is not an enthusiast thread, and the
 *   mis-filing understated otherwise-citable entries. *(guidance)*
 * - `first-hand` — the owner's own truck. Supports `first-hand`, never more.
 *   *(guidance — but note that a `first-hand` source can never satisfy the
 *   normative rule above, so it cannot carry a documentary tier)*
 */
export const SOURCE_KINDS = [
  "fsm",
  "tsb",
  "manufacturer",
  "forum",
  "video",
  "vendor",
  "reference",
  "first-hand",
] as const;

export type SourceKind = (typeof SOURCE_KINDS)[number];

/**
 * The kinds that can support a documentary tier — the T207 kind→tier
 * coherence rule's right-hand side (see the `SOURCE_KINDS` docstring above).
 *
 * These are AGENTS.md's "factory-documented" set, verbatim: the FSM, the
 * bulletins, and manufacturer primary literature. Everything else is somebody
 * reporting what a document said, which is a different thing from the
 * document.
 *
 * Declared here and consumed by `scripts/check-citations.mjs` (through the
 * plain-Node mirror in `scripts/lib/content-entries.mjs`, which
 * `tests/lib/content-entries.test.ts` pins against this export). The rule is
 * *enforced* there rather than in this module — see the docstring above for
 * why a kind/tier judgment is a check-script rule and not a schema
 * refinement.
 */
export const FACTORY_DOCUMENTED_KINDS = [
  "fsm",
  "tsb",
  "manufacturer",
] as const satisfies readonly SourceKind[];

/**
 * Every field is required, `archiveUrl` included: AGENTS.md says archive the
 * URL *at the time of citation*, so there is no window in which a source
 * exists without its snapshot.
 */
export const sourceSchema = z
  .object({
    title: nonBlankString(),
    url: httpUrlSchema(),
    archiveUrl: httpUrlSchema(),
    accessed: isoDateSchema(),
    kind: z.enum(SOURCE_KINDS),
  })
  .strict();

export type Source = z.infer<typeof sourceSchema>;

/* -------------------------------------------------------------------------
 * Fitment placeholder — spec §2 "Fitment", AGENTS.md "explicit fitment"
 *
 * Shape only. Resolving gen / market / engine ids against the taxonomy, and
 * rejecting combinations that never existed, is FIT-02 — `src/lib/fitment/`
 * (T203), not this one. These are opaque id lists, with the one exception the
 * owner ruled on below.
 * ---------------------------------------------------------------------- */

const idListSchema = () => z.array(nonBlankString()).min(1);

/**
 * `drive` is the one fitment facet whose vocabulary is closed at the schema
 * level (owner ruling, 2026-08-30 — see `DRIVE_TYPES` in
 * `src/schemas/vehicles.ts`). Every other facet names a taxonomy *entry*,
 * which only the resolver can see; `drive` names a value from a two-item
 * constant, so a typo is catchable here and there is no reason to defer it.
 *
 * ## Why the membership test is inside a refinement and not `z.enum`
 *
 * `DRIVE_TYPES` lives in `src/schemas/vehicles.ts` (the ruling puts it with
 * the other vehicle vocabularies), and that module imports `defineEntrySchema`
 * from this one. The import cycle is real and unavoidable given where the
 * constant was ruled to live. A `z.enum(DRIVE_TYPES)` would read the binding
 * while *this* module's body evaluates, which under ESM cycle semantics is a
 * temporal-dead-zone `ReferenceError` whenever `vehicles.ts` is the module
 * entered first. Reading it inside the refinement defers the access to parse
 * time, by which point both modules are fully evaluated. Same rule, same
 * message; only the moment of the lookup moves.
 */
const driveListSchema = () =>
  idListSchema().superRefine((values, ctx) => {
    values.forEach((value, index) => {
      if ((DRIVE_TYPES as readonly string[]).includes(value)) return;
      ctx.addIssue({
        code: "custom",
        path: [index],
        message:
          `\`${value}\` is not a drive type: \`fitment.drive\` is the closed ` +
          `vocabulary ${DRIVE_TYPES.map((type) => `\`${type}\``).join(" / ")} ` +
          `(owner ruling 2026-08-30, \`DRIVE_TYPES\` in ` +
          `src/schemas/vehicles.ts). refs specs/001-foundation`,
      });
    });
  });

export const fitmentSchema = z
  .object({
    /** At least one generation: "it's a Montero thing" is not a fitment. */
    gens: idListSchema(),
    markets: idListSchema().optional(),
    years: z
      .object({
        from: z.number().int().optional(),
        to: z.number().int().optional(),
      })
      .strict()
      .optional(),
    engines: idListSchema().optional(),
    transmissions: idListSchema().optional(),
    transferCases: idListSchema().optional(),
    trims: idListSchema().optional(),
    drive: driveListSchema().optional(),
  })
  .strict();

export type Fitment = z.infer<typeof fitmentSchema>;

/* -------------------------------------------------------------------------
 * The numeric-prose guard — AGENTS.md "Numbers are never translated"
 * ---------------------------------------------------------------------- */

/**
 * `astro/zod` (Zod 4) tags every schema with a string `_def.type`. These are
 * the tags that mean "a number reached a per-locale field".
 */
const NUMERIC_DEF_TYPES: ReadonlySet<string> = new Set([
  "number",
  "int",
  "bigint",
  "int64",
  "uint64",
  "nan",
]);

/**
 * `_def` keys that hold child schemas. Wrappers (`optional`, `nullable`,
 * `default`, `catch`, `readonly`, `promise`) keep theirs under `innerType`;
 * containers and composites use the rest. A guard that unwraps only one level
 * is not a guard, so every one of these is followed.
 */
const CHILD_DEF_KEYS = [
  "innerType",
  "element",
  "valueType",
  "keyType",
  "left",
  "right",
  "in",
  "out",
  "schema",
  "items",
  "rest",
  "options",
  "catchall",
] as const;

type ZodDef = Record<string, unknown> & { type?: unknown };

function isNumericValue(value: unknown): boolean {
  return typeof value === "number" || typeof value === "bigint";
}

/**
 * `z.literal(88)` and `z.enum(NumericEnum)` carry their numbers as *values*,
 * not as a numeric `_def.type` — `z.literal(88)._def` is
 * `{ type: "literal", values: [88] }`. A difficulty of 1–5 (PRB-01, PRC-01) is
 * naturally spelled as a numeric literal union, so this is the likeliest
 * numeric field anyone would actually write into prose.
 */
function hasNumericValues(def: ZodDef): boolean {
  if (def.type === "literal") {
    const { values } = def;
    return Array.isArray(values) && values.some(isNumericValue);
  }

  if (def.type === "enum") {
    const { entries } = def;
    if (typeof entries !== "object" || entries === null) return false;
    return Object.values(entries).some(isNumericValue);
  }

  return false;
}

/**
 * The guard **fails closed**: anything that looks like a schema but whose
 * internals this code cannot read is treated as a fault, not as clean. A
 * silent `null` here would wave a whole subtree past the numeric check the
 * moment `astro/zod` renames a `_def` key — exactly the kind of drift that
 * would otherwise surface as a torque figure duplicated into two locales.
 */
function defOf(candidate: unknown, path: string): ZodDef | null {
  if (typeof candidate !== "object" || candidate === null) return null;

  const { _def: def } = candidate as { _def?: unknown };
  if (
    typeof def === "object" &&
    def !== null &&
    typeof (def as ZodDef).type === "string"
  ) {
    return def as ZodDef;
  }

  const { safeParse } = candidate as { safeParse?: unknown };
  if (typeof safeParse === "function") {
    throw new Error(
      `cannot verify the prose field \`${path}\`: it parses like a schema but ` +
        `exposes no readable \`_def.type\`, so the "numbers are never ` +
        `translated" guard cannot see inside it. Build prose fields from ` +
        `\`astro/zod\` schemas (AGENTS.md). refs specs/001-foundation`
    );
  }

  return null;
}

function joinPath(path: string, key: string): string {
  return path === "" ? key : `${path}.${key}`;
}

/**
 * Depth-first search for a numeric type anywhere inside `schema`, returning
 * the dotted path of the offending field or `null`.
 *
 * Object shapes extend the path (so the error names
 * `nestedTorque.torqueNm`); wrappers, arrays, unions, tuples and records do
 * not, because their children have no field name of their own.
 */
function findNumericField(
  schema: unknown,
  path: string,
  seen: Set<object>
): string | null {
  const def = defOf(schema, path);
  if (def === null) return null;
  if (seen.has(def)) return null;
  seen.add(def);

  if (typeof def.type === "string" && NUMERIC_DEF_TYPES.has(def.type)) {
    return path;
  }

  if (hasNumericValues(def)) return path;

  const shape = def["shape"];
  if (typeof shape === "object" && shape !== null) {
    for (const [key, child] of Object.entries(shape)) {
      const hit = findNumericField(child, joinPath(path, key), seen);
      if (hit !== null) return hit;
    }
  }

  // `z.lazy()` hides its schema behind a getter; calling it is safe because
  // `seen` breaks the cycle a recursive schema would otherwise create.
  const getter = def["getter"];
  if (typeof getter === "function") {
    const hit = findNumericField((getter as () => unknown)(), path, seen);
    if (hit !== null) return hit;
  }

  for (const key of CHILD_DEF_KEYS) {
    const child = def[key];
    const candidates = Array.isArray(child) ? child : [child];
    for (const candidate of candidates) {
      const hit = findNumericField(candidate, path, seen);
      if (hit !== null) return hit;
    }
  }

  return null;
}

/**
 * Field names the entry shape owns; a collection may not redeclare them.
 *
 * Exported so T105's `check:citations` (REF-02) can tell the fixed entry
 * envelope apart from collection-specific shared data without re-listing this
 * set — the id/fitment/confidence/sources/prose fields are structural, never
 * "a numeric spec" in the citation sense, even though `fitment.years` holds
 * numbers.
 */
export const RESERVED_ENTRY_FIELDS: readonly string[] = [
  "id",
  "fitment",
  "confidence",
  "sources",
  "prose",
];

function assertNoNumericProse(prose: z.ZodRawShape): void {
  for (const [field, schema] of Object.entries(prose)) {
    const hit = findNumericField(schema, field, new Set());
    if (hit !== null) {
      throw new Error(
        `numbers are never translated: the prose field \`${hit}\` declares a ` +
          `numeric type. Locale-independent figures — part numbers, torque, ` +
          `capacities, intervals — belong in the shared data shape, stored ` +
          `once and rendered into both locales (AGENTS.md). ` +
          `refs specs/001-foundation`
      );
    }
  }
}

function assertNoReservedFields(shape: z.ZodRawShape, label: string): void {
  for (const field of Object.keys(shape)) {
    if (RESERVED_ENTRY_FIELDS.includes(field)) {
      throw new Error(
        `the ${label} shape may not redeclare \`${field}\`: it is part of ` +
          `every entry and is owned by defineEntrySchema ` +
          `(refs specs/001-foundation)`
      );
    }
  }
}

/* -------------------------------------------------------------------------
 * Blank-prose guard — I18N-06 ("a stub is not a locale")
 * ---------------------------------------------------------------------- */

/** Paths of every blank / whitespace-only string reachable inside `value`. */
function blankStringPaths(value: unknown): PropertyKey[][] {
  const found: PropertyKey[][] = [];

  const walk = (node: unknown, path: PropertyKey[]): void => {
    if (typeof node === "string") {
      if (node.trim().length === 0) found.push(path);
      return;
    }
    if (Array.isArray(node)) {
      node.forEach((item, index) => walk(item, [...path, index]));
      return;
    }
    if (typeof node === "object" && node !== null) {
      for (const [key, child] of Object.entries(node)) {
        walk(child, [...path, key]);
      }
    }
  };

  walk(value, []);
  return found;
}

/* -------------------------------------------------------------------------
 * The entry factory — plan.md "The data/prose split"
 * ---------------------------------------------------------------------- */

/**
 * Builds a collection entry schema from a locale-independent `shared` shape
 * and a per-locale `prose` shape:
 *
 * ```ts
 * { id, fitment, ...shared, confidence, sources, prose: { en, es } }
 * ```
 *
 * Throws at define time — before any content is ever parsed — if `prose`
 * declares a numeric field at any depth, or if either shape redeclares a field
 * the entry shape owns.
 */
export function defineEntrySchema<
  Shared extends z.ZodRawShape,
  Prose extends z.ZodRawShape,
>(shared: Shared, prose: Prose) {
  assertNoReservedFields(shared, "shared data");
  assertNoReservedFields(prose, "prose");
  assertNoNumericProse(prose);

  const proseLocaleSchema = z
    .object(prose)
    .strict()
    .superRefine((value, ctx) => {
      for (const path of blankStringPaths(value)) {
        ctx.addIssue({
          code: "custom",
          path,
          message: `${BLANK_MESSAGE}: a present-but-empty locale field is a missing translation (I18N-06)`,
        });
      }
    });

  return z
    .object({
      id: nonBlankString(),
      fitment: fitmentSchema,
      ...shared,
      confidence: confidenceSchema,
      sources: z.array(sourceSchema),
      prose: z
        .object({ en: proseLocaleSchema, es: proseLocaleSchema })
        .strict(),
    })
    .strict()
    .superRefine((entry, ctx) => {
      const { confidence, sources } = entry as {
        confidence?: unknown;
        sources?: unknown;
      };

      if (
        typeof confidence === "string" &&
        (CITATION_REQUIRED_TIERS as readonly string[]).includes(confidence) &&
        Array.isArray(sources) &&
        sources.length === 0
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["sources"],
          message:
            `confidence \`${confidence}\` claims a document says so, but this ` +
            `entry cites nothing: an entry at ` +
            `${CITATION_REQUIRED_TIERS.join(" or ")} needs at least one ` +
            `source (AGENTS.md "cite what you actually read"). Lower the tier ` +
            `or add the citation. refs specs/001-foundation`,
        });
      }
    });
}

/** The locale-keyed prose half of any entry, for consumers that render it. */
export type EntryProse<T> = Record<Locale, T>;
