/**
 * Content collections (SCF-01, I18N-06).
 *
 * Every collection is built from `defineEntrySchema` — the single place the
 * `{ id, fitment, ...shared, confidence, sources, prose: { en, es } }` shape is
 * assembled — so the bilingual rule and the data/prose split are enforced
 * structurally rather than by review. A collection that hand-rolled its shape
 * could accept a one-locale entry while every factory unit test stayed green,
 * which is why `tests/schemas/collections.test.ts` grades what is registered
 * here and not just the factory.
 *
 * T104 registers the **base** shape for each collection the spec names
 * (§4–§8). Collection-specific fields — engine ids and chassis codes
 * (VEH-01), symptoms and fix paths (PRB-01), part numbers and supersession
 * chains (PRT-01), and so on — are added by the phase task that owns each
 * collection, by extending the `shared` and `prose` shapes passed below. Per
 * AGENTS.md a schema change is never a drive-by edit: it belongs to the task
 * that owns the collection.
 *
 * refs specs/001-foundation (SCF-01, SCF-04, I18N-06)
 */
import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";
import { defineEntrySchema } from "./schemas/entry";
import { communitySchema } from "./schemas/community";
import { glossaryEntrySchema } from "./schemas/glossary";
import { vehiclesEntrySchema } from "./schemas/vehicles";

/**
 * Files whose name starts with `_` are drafts/notes and are never loaded, per
 * Astro's own convention. Entries are data files or Markdown; the human text
 * lives in `prose.en` / `prose.es` either way, so a Markdown body is never the
 * canonical prose for one locale.
 */
const ENTRY_PATTERN = "**/[^_]*.{md,mdx,json,yaml,yml}";

/**
 * Prose fields every entry carries, in both locales.
 *
 * Nothing numeric may appear here — `defineEntrySchema` throws at define time
 * if it does (AGENTS.md: "numbers are never translated").
 */
const baseProse = {
  title: z.string(),
  summary: z.string(),
};

/** The shape a collection gets until the phase task that owns it lands. */
const baseEntrySchema = () => defineEntrySchema({}, baseProse);

/**
 * One collection loaded from `src/content/<name>/`.
 *
 * Most collections still get `baseEntrySchema()`: their own fields arrive
 * with the phase task that owns them. A collection whose task *has* landed
 * passes the schema that task built — always via `defineEntrySchema` in
 * `src/schemas/<name>.ts`, so the `{ id, fitment, …, prose: { en, es } }`
 * envelope is identical either way and `tests/schemas/collections.test.ts`
 * grades both forms the same.
 *
 * Generic in the schema, and required rather than defaulted (T205): Astro
 * derives `entry.data` from `z.infer` of whatever type this parameter
 * *declares*, so annotating it as the base `z.ZodType` erased every
 * collection's data to `unknown` and any page reading a collection lost its
 * types. A generic with a default value would need an unsound cast to keep
 * the default, so every collection names its schema instead — one visible
 * word per line, and no collection is silently on the base shape.
 */
function entryCollection<S extends z.ZodType>(name: string, schema: S) {
  return defineCollection({
    loader: glob({ pattern: ENTRY_PATTERN, base: `./src/content/${name}` }),
    schema,
  });
}

export const collections = {
  /** VEH-01…03 — generations, markets, engines, transmissions, trims. */
  vehicles: entryCollection("vehicles", vehiclesEntrySchema(baseProse)),
  /**
   * GLO-01…04 — canonical EN/ES terms and regional aliases.
   *
   * Assembled in `src/schemas/glossary.ts` (still through
   * `defineEntrySchema`) because the canonical-term format is the input to a
   * merge-blocking check and deserves its own module and its own tests. T205.
   */
  glossary: entryCollection("glossary", glossaryEntrySchema),
  /** REF-01, REF-02 — FSM index, fluids, torque master table, capacities. */
  reference: entryCollection("reference", baseEntrySchema()),
  /** GAR-01…05 — the build log for the truck. */
  garage: entryCollection("garage", baseEntrySchema()),
  /** PRB-01…06 — the symptom-driven problem finder. */
  problems: entryCollection("problems", baseEntrySchema()),
  /** PRT-01…03 — parts, fitment, supersession chains. */
  parts: entryCollection("parts", baseEntrySchema()),
  /** PRC-01…03 — step-by-step procedures. */
  procedures: entryCollection("procedures", baseEntrySchema()),
  /** MOD-01, MOD-02 — modifications and their tradeoffs. */
  mods: entryCollection("mods", baseEntrySchema()),
  /** COM-01, COM-02 — the bilingual community directory (T700). */
  community: entryCollection("community", communitySchema),
};
