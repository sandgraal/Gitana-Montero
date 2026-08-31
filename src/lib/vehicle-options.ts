/**
 * What the vehicle selector may offer, and in what order (FIT-03).
 *
 * The selector asks four questions in sequence — generation, then market, then
 * year, then engine — and each answer narrows the next. This module computes
 * those option lists. It computes *nothing* about whether a combination is
 * real: every such question is asked of `src/lib/fitment/`, which is the only
 * code allowed to answer it (FIT-01).
 *
 * ## The three-valued answer, rendered as three outcomes
 *
 * `classifyCombination` returns `existed` / `impossible` / `unknown`, and the
 * artboard's "impossible combinations are filtered out as you pick" is that
 * verdict made visible. Each of the three is honoured literally:
 *
 * | verdict      | what the selector does                                   |
 * |--------------|----------------------------------------------------------|
 * | `existed`    | offered, in the **recorded** group                       |
 * | `unknown`    | offered, in the **not recorded** group                   |
 * | `impossible` | not offered at all                                       |
 *
 * Collapsing `unknown` into `impossible` — offering only what the combination
 * data lists — would be the destructive reading VEH-03 exists to prevent:
 * every combination entry in the corpus today is honestly `coverage:
 * "partial"`, so it would hide almost every real truck behind "we have not
 * written that scope up yet". Collapsing it into `existed` would claim a
 * source we do not have. Two groups with their own labels is the only
 * rendering that says what the data actually says.
 *
 * ## Where each candidate list comes from
 *
 * - **Generations** — the `generation` entries themselves.
 * - **Markets** — the selected generation's `marketNames` (VEH-02: the
 *   generation entry is where "sold in this market, under this name" lives).
 *   Not re-derived from anywhere else, and not filtered further: a market a
 *   generation names is a market that generation was sold in, full stop.
 * - **Years** — the generation's recorded `production` span. Those spans are
 *   **JDM-scoped by contract** (conductor ruling 2026-08-30, restated on
 *   `generationsInProduction`), so a market whose real calendar differed may
 *   offer a year or two the reader would not recognise. That is the same
 *   known gap GAP-01 tracks, and it fails in the safe direction: an offered
 *   year that a market never saw yields an `unknown` engine list, never a
 *   hidden entry.
 * - **Engines** — every `engine` entry whose *own* fitment matches the
 *   selection so far, which is `matchesVehicle` again rather than a second
 *   reading of `gens`.
 *
 * refs specs/001-foundation (FIT-01, FIT-03, FIT-04, VEH-02, VEH-03)
 */

import {
  buildTaxonomy,
  classifyCombination,
  matchesVehicle,
  type Taxonomy,
} from "./fitment/index.ts";
import { DRIVE_TYPES } from "../schemas/vehicle-vocabulary.ts";

/** One market a generation was sold in, with the name it was sold under. */
export interface MarketOption {
  readonly id: string;
  /** `Montero` / `Pajero` / `Shogun` — a proper noun, shared data (VEH-02). */
  readonly name: string;
}

export interface GenerationOption {
  readonly id: string;
  /** `V60`, `V70` — factory chassis codes, rendered in the button subtitle. */
  readonly chassisCodes: readonly string[];
  readonly production: { readonly from: number; readonly to: number | null };
  readonly markets: readonly MarketOption[];
}

export interface EngineOption {
  readonly id: string;
  readonly engineFamily: string;
  readonly displacementCc: number;
  readonly valvetrain?: string;
  /**
   * Carried because it is the only thing telling `6g74-dohc` and `6g74-gdi`
   * apart — same family, same head, same displacement.
   */
  readonly fuelSystem?: string;
  /** The engine entry's own fitment — which trucks it was ever fitted to. */
  readonly fitment: unknown;
}

/**
 * Everything the browser needs to drive the selector, as one serializable
 * object. Built once per page by `src/components/VehicleSelector.astro` and
 * inlined as JSON.
 *
 * `nodes` is the minimal projection of the `vehicles` collection that
 * `buildTaxonomy` reads — ids, kinds, production spans, parent links and
 * combination offerings. Deliberately a projection and not the whole
 * collection: the prose, the sources and the display fields are several times
 * the size and answer no fitment question.
 */
export interface SelectorTaxonomyData {
  readonly nodes: readonly unknown[];
  readonly generations: readonly GenerationOption[];
  readonly engines: readonly EngineOption[];
}

/** An engine offered for a scope, with what the taxonomy knows about it. */
export interface EngineChoice {
  readonly option: EngineOption;
  /** `true` when a combination entry lists this powertrain for the scope. */
  readonly recorded: boolean;
}

/**
 * The selector's option model for one page.
 *
 * A factory rather than free functions because the taxonomy index is built
 * once and then queried on every keystroke: rebuilding it per call would make
 * the panel's re-render cost grow with the corpus for no reason.
 */
export interface VehicleOptions {
  /** The fitment engine's index, for callers that also need to match entries. */
  readonly taxonomy: Taxonomy;
  readonly generations: readonly GenerationOption[];
  /** `DRIVE_TYPES`, in their canonical order. */
  readonly drives: readonly string[];
  generation(gen: string): GenerationOption | null;
  marketsFor(gen: string): readonly MarketOption[];
  yearsFor(gen: string): readonly number[];
  enginesFor(
    gen: string,
    market: string,
    year: number
  ): readonly EngineChoice[];
}

/**
 * The upper bound for a generation whose production is still open
 * (`to: null`). Reading an open span as "up to today" is the honest
 * translation of "open at the time of the cited source" into a finite list of
 * years a person can pick from; it never invents an end year in the data.
 */
function openSpanEnd(now: Date): number {
  return now.getUTCFullYear();
}

export function createVehicleOptions(
  data: SelectorTaxonomyData,
  now: Date = new Date()
): VehicleOptions {
  const taxonomy = buildTaxonomy(data.nodes);
  const byId = new Map(data.generations.map((entry) => [entry.id, entry]));

  const generation = (gen: string): GenerationOption | null =>
    byId.get(gen) ?? null;

  return {
    taxonomy,
    generations: data.generations,
    drives: DRIVE_TYPES,
    generation,

    marketsFor(gen) {
      return generation(gen)?.markets ?? [];
    },

    yearsFor(gen) {
      const entry = generation(gen);
      if (entry === null) return [];
      const { from } = entry.production;
      const to = entry.production.to ?? openSpanEnd(now);
      if (to < from) return [];
      return Array.from({ length: to - from + 1 }, (_, step) => from + step);
    },

    enginesFor(gen, market, year) {
      const choices: EngineChoice[] = [];
      for (const option of data.engines) {
        const selection = { gen, market, year, engine: option.id };
        // The engine entry's own fitment: was this engine ever in such a truck?
        if (!matchesVehicle(option.fitment, selection, taxonomy)) continue;

        const verdict = classifyCombination(selection, taxonomy);
        if (verdict === "impossible") continue;
        choices.push({ option, recorded: verdict === "existed" });
      }
      return choices;
    },
  };
}

/**
 * Whether a stored selection still names options this taxonomy offers.
 *
 * A selection can outlive the data that produced it — a market removed from a
 * generation's `marketNames`, an engine entry renamed — and a filter built
 * from a stale selection would quietly stop matching anything. Checked when
 * the selector loads, so a stale selection is dropped rather than rendered as
 * a chip that filters everything away.
 */
export function selectionIsOfferable(
  selection: { gen: string; market: string; year: number; engine: string },
  options: VehicleOptions
): boolean {
  const generation = options.generation(selection.gen);
  if (generation === null) return false;
  if (!generation.markets.some((market) => market.id === selection.market)) {
    return false;
  }
  if (!options.yearsFor(selection.gen).includes(selection.year)) return false;
  return options
    .enginesFor(selection.gen, selection.market, selection.year)
    .some((choice) => choice.option.id === selection.engine);
}
