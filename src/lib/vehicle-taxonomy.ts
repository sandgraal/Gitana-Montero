/**
 * The `vehicles` collection, projected into what the browser needs (FIT-03).
 *
 * The selector runs in the browser — the site is static output, so narrowing
 * "which engines could this truck have had" as the visitor picks cannot happen
 * on a server. That means the fitment engine runs client-side too, and it
 * needs a taxonomy to run against. This module builds the smallest input that
 * answers every question the selector asks.
 *
 * ## Why a projection and not the collection
 *
 * `getCollection("vehicles")` is ~46 entries of prose, summaries and citation
 * lists: about 100 KB of JSON, of which the fitment engine reads maybe a
 * tenth. `buildTaxonomy` only ever looks at `id`, `kind`, `production`,
 * `parentGeneration`, and a combination entry's `generation` / `market` /
 * `coverage` / `offerings` — so those are the fields carried, plus the few
 * *display* fields the selector renders (chassis codes, market names, engine
 * family and displacement). The result is ~10 KB, ~1.2 KB over the wire.
 *
 * The projection is deliberately mechanical: it copies fields, it never
 * derives anything. Every derived answer is `src/lib/fitment/`'s (FIT-01) and
 * every option list is `src/lib/vehicle-options.ts`'s.
 *
 * ## Locale
 *
 * Nothing here is per-locale. Chassis codes, market names (`Montero`,
 * `Pajero`, `Shogun` — proper nouns), engine families and displacements are
 * shared `data`, stored once (AGENTS.md). The strings that *are* prose — a
 * market's "United States and Canada", a system label — are looked up by the
 * component in the page's own locale and never travel in this payload.
 *
 * refs specs/001-foundation (FIT-01, FIT-03, VEH-01, VEH-02, VEH-03)
 */

import { GENERATION_IDS } from "../schemas/vehicle-vocabulary.ts";
import type {
  EngineOption,
  GenerationOption,
  SelectorTaxonomyData,
} from "./vehicle-options.ts";

/**
 * One entry as this module reads it — the fields of a `vehicles` entry that
 * either the fitment engine or the selector's chrome needs.
 *
 * Structural rather than the collection's own inferred type so this module can
 * be unit-tested with plain objects, exactly as the fitment engine is.
 */
export interface VehicleTaxonomyEntry {
  readonly id?: unknown;
  readonly kind?: unknown;
  readonly fitment?: unknown;
  readonly production?: unknown;
  readonly parentGeneration?: unknown;
  readonly marketNames?: unknown;
  readonly chassisCodes?: unknown;
  readonly generation?: unknown;
  readonly market?: unknown;
  readonly coverage?: unknown;
  readonly offerings?: unknown;
  readonly engineFamily?: unknown;
  readonly displacementCc?: unknown;
  readonly valvetrain?: unknown;
  readonly fuelSystem?: unknown;
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function stringList(value: unknown): readonly string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function marketNames(value: unknown): readonly { id: string; name: string }[] {
  if (!Array.isArray(value)) return [];
  const rows: { id: string; name: string }[] = [];
  for (const item of value) {
    if (typeof item !== "object" || item === null) continue;
    const { market, name } = item as { market?: unknown; name?: unknown };
    const id = asString(market);
    const label = asString(name);
    if (id === null || label === null) continue;
    rows.push({ id, name: label });
  }
  return rows;
}

function production(
  value: unknown
): { from: number; to: number | null } | null {
  if (typeof value !== "object" || value === null) return null;
  const { from, to } = value as { from?: unknown; to?: unknown };
  if (typeof from !== "number") return null;
  return { from, to: typeof to === "number" ? to : null };
}

/**
 * The taxonomy nodes `buildTaxonomy` reads, and nothing else.
 *
 * Field names match the entry's own, because `buildTaxonomy` takes entry
 * objects: renaming anything here would mean teaching the engine a second
 * vocabulary for the same facts.
 */
function fitmentNode(entry: VehicleTaxonomyEntry): Record<string, unknown> {
  const node: Record<string, unknown> = { id: entry.id, kind: entry.kind };

  if (entry.kind === "generation") {
    node["production"] = entry.production;
    if (entry.parentGeneration !== undefined) {
      node["parentGeneration"] = entry.parentGeneration;
    }
  }

  if (entry.kind === "combination") {
    node["generation"] = entry.generation;
    node["market"] = entry.market;
    node["coverage"] = entry.coverage;
    node["offerings"] = entry.offerings;
  }

  return node;
}

/**
 * The selector's whole payload, in a stable order.
 *
 * Generations come out in the order the caller supplied — the pages pass
 * `GENERATION_IDS` order, which is chronological and is what the button row
 * reads left to right. Engines are sorted by id so the dropdown does not
 * reshuffle when a file is added.
 */
export function selectorTaxonomyData(
  entries: readonly VehicleTaxonomyEntry[]
): SelectorTaxonomyData {
  const nodes: Record<string, unknown>[] = [];
  const generations: GenerationOption[] = [];
  const engines: EngineOption[] = [];

  for (const entry of entries) {
    const id = asString(entry.id);
    if (id === null) continue;
    nodes.push(fitmentNode(entry));

    if (entry.kind === "generation") {
      const span = production(entry.production);
      if (span === null) continue;
      generations.push({
        id,
        chassisCodes: stringList(entry.chassisCodes),
        production: span,
        markets: marketNames(entry.marketNames),
      });
      continue;
    }

    if (entry.kind !== "engine") continue;
    if (typeof entry.displacementCc !== "number") continue;
    const family = asString(entry.engineFamily);
    if (family === null) continue;

    const valvetrain = asString(entry.valvetrain);
    const fuelSystem = asString(entry.fuelSystem);
    engines.push({
      id,
      engineFamily: family,
      displacementCc: entry.displacementCc,
      ...(valvetrain === null ? {} : { valvetrain }),
      ...(fuelSystem === null ? {} : { fuelSystem }),
      fitment: entry.fitment,
    });
  }

  engines.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  // Chronological, not alphabetical: `getCollection` hands entries back in
  // filename order, which sorts `gen2-5` before `gen2`. The button row reads
  // left to right and has to read as a timeline.
  generations.sort((a, b) => generationRank(a.id) - generationRank(b.id));

  return { nodes, generations, engines };
}

/** `GENERATION_IDS` position; anything unrecognised sorts last. */
function generationRank(id: string): number {
  const at = (GENERATION_IDS as readonly string[]).indexOf(id);
  return at === -1 ? GENERATION_IDS.length : at;
}

/* -------------------------------------------------------------------------
 * Reading the payload back, in the browser
 * ---------------------------------------------------------------------- */

/**
 * Where `VehicleSelector.astro` inlines the payload.
 *
 * Named here rather than in the component because the selector is not its only
 * reader: a listing that filters itself by the reader's truck needs the same
 * taxonomy, and shipping it twice on one page would be the same ~10 KB twice
 * and two things to keep in step. One payload per page, one selector string,
 * both sides importing it.
 */
export const SELECTOR_DATA_SELECTOR = "[data-vehicle-selector-data]";

/**
 * The inlined payload, or `null` when this page has no selector (or its JSON
 * is unreadable).
 *
 * Typed as the taxonomy data plus unknown extras: the selector adds its own
 * per-locale `labels` and `text` blocks, which are its business and not a
 * listing's. A consumer that needs those narrows the result itself.
 */
export function readSelectorPayload(
  doc: Document
): (SelectorTaxonomyData & Record<string, unknown>) | null {
  const node = doc.querySelector(SELECTOR_DATA_SELECTOR);
  if (node === null) return null;
  try {
    const parsed: unknown = JSON.parse(node.textContent ?? "");
    if (typeof parsed !== "object" || parsed === null) return null;
    const candidate = parsed as SelectorTaxonomyData;
    if (!Array.isArray(candidate.nodes)) return null;
    if (!Array.isArray(candidate.generations)) return null;
    if (!Array.isArray(candidate.engines)) return null;
    return candidate as SelectorTaxonomyData & Record<string, unknown>;
  } catch {
    return null;
  }
}
