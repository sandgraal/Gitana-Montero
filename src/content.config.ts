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

/** One collection, base entry shape, loaded from `src/content/<name>/`. */
function entryCollection(name: string, shared: z.ZodRawShape = {}) {
  return defineCollection({
    loader: glob({ pattern: ENTRY_PATTERN, base: `./src/content/${name}` }),
    schema: defineEntrySchema(shared, baseProse),
  });
}

export const collections = {
  /** VEH-01…03 — generations, markets, engines, transmissions, trims. */
  vehicles: entryCollection("vehicles"),
  /** GLO-01…04 — canonical EN/ES terms and regional aliases. */
  glossary: entryCollection("glossary"),
  /** REF-01, REF-02 — FSM index, fluids, torque master table, capacities. */
  reference: entryCollection("reference", { torqueNm: z.number().optional() }),
  /** GAR-01…05 — the build log for the truck. */
  garage: entryCollection("garage"),
  /** PRB-01…06 — the symptom-driven problem finder. */
  problems: entryCollection("problems"),
  /** PRT-01…03 — parts, fitment, supersession chains. */
  parts: entryCollection("parts"),
  /** PRC-01…03 — step-by-step procedures. */
  procedures: entryCollection("procedures"),
  /** MOD-01, MOD-02 — modifications and their tradeoffs. */
  mods: entryCollection("mods"),
  /** COM-01, COM-02 — the bilingual community directory. */
  community: entryCollection("community"),
};
