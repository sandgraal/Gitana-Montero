/**
 * The vehicle taxonomy's **closed vocabularies**, with no Zod (VEH-01).
 *
 * Every constant here was defined in `src/schemas/vehicles.ts` and is still
 * exported from there — that module re-exports this one, so no existing import
 * changed meaning and no value moved. What changed is only *where the file
 * boundary falls*, and it falls here for one concrete reason.
 *
 * ## Why the split exists (T204)
 *
 * The vehicle selector runs the fitment engine **in the browser**: this site
 * is static output, so narrowing "which engines could this truck have had" as
 * a visitor picks cannot happen anywhere else. That put `src/lib/fitment/` on
 * a client bundle for the first time, and it imports these vocabularies to do
 * its work.
 *
 * `src/schemas/vehicles.ts` builds Zod schemas at module scope. Those
 * constructions are side effects Rollup cannot prove pure, so importing a
 * single `const` array from it pulled the whole of `astro/zod` — and, through
 * `src/schemas/entry.ts`, the rest of the schema layer — into every page's
 * JavaScript. Measured: **75 KB** on a site whose largest script was 5 KB, on
 * every page, to read seven string constants that a browser needs and a
 * validator does not.
 *
 * This module is therefore deliberately a leaf: **no imports at all**. Adding
 * one is how the 75 KB comes back.
 *
 * The rules these vocabularies encode, and the reasoning behind each closed
 * set, are documented where they are used — `src/schemas/vehicles.ts` for the
 * schema they constrain, `src/lib/fitment/` for how a fitment resolves against
 * them. This file is the values themselves.
 *
 * refs specs/001-foundation (VEH-01, VEH-02, VEH-03, FIT-01, FIT-03)
 */

/**
 * The node types of the taxonomy. An entry's `kind` decides which fields it
 * carries and which id rule it obeys.
 */
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

/**
 * Sales markets, per spec §2. Closed rather than free-form so every market
 * reference in every collection is checked by the build instead of by review.
 */
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

/**
 * Generation ids, chronological. `gen2-5` is the 1997 facelift: a generation
 * id in its own right whose entry declares `parentGeneration: "gen2"`, so the
 * containment is content, stated once, and the resolver expands it.
 *
 * The order is the contract for anything that sorts generations — the selector
 * button row and `sortedGenerations` in the fitment engine both read it as a
 * timeline.
 */
export const GENERATION_IDS = [
  "gen1",
  "gen2",
  "gen2-5",
  "gen3",
  "gen4",
] as const;

export type GenerationId = (typeof GENERATION_IDS)[number];

/**
 * What a `fitment.drive` id may say (owner ruling, 2026-08-30): a closed
 * two-value discriminator, not an entity kind — there is no drive entry to
 * write, because there is nothing to say about "4wd" that a transfer-case
 * entry does not already say better.
 */
export const DRIVE_TYPES = ["2wd", "4wd"] as const;

export type DriveType = (typeof DRIVE_TYPES)[number];

/**
 * Stable ids are kebab-case: lowercase alphanumerics joined by single hyphens.
 * Uppercase or underscored ids would make `6G74_SOHC` and `6g74-sohc` two
 * spellings of one engine, and every reference a coin flip.
 */
export const TAXONOMY_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Production years the taxonomy covers, from spec §1 ("all generations
 * (1982–2021)"). Bounded so a transposed digit (`1892`, `2201`) is a build
 * error rather than a silently impossible fitment.
 */
export const PRODUCTION_YEAR_RANGE = { from: 1982, to: 2021 } as const;
