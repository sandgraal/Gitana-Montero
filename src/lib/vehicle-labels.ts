/**
 * How a vehicle's *data* is written out for a reader (FIT-03, HANDOFF-DESIGN).
 *
 * Everything this module produces is built from shared `data` — engine
 * families, valvetrains, factory fuel-system designations, chassis codes,
 * displacements, years — so nothing here is a translated string and nothing
 * here belongs in `src/i18n/ui.ts`. That is the same split the design handoff
 * draws with its typefaces: "if a value comes from shared `data`, it renders
 * in Plex Mono". These are the Plex Mono strings.
 *
 * The one locale-sensitive step is the *number formatting* — `3.5 L` in
 * English, `3,5 L` in Spanish — which is `Intl.NumberFormat` reading one
 * stored figure, not a figure written down twice (AGENTS.md).
 *
 * refs specs/001-foundation (FIT-03), specs/001-foundation/design/HANDOFF-DESIGN.md
 */

import type { EngineOption, GenerationOption } from "./vehicle-options.ts";

/** Separator the artboards use between data facets: `Gen 3 · US · 2002`. */
export const FACET_SEPARATOR = " · ";

/**
 * Fuel-system designations that are Mitsubishi's own name for the thing —
 * proper nouns, printed on the engine cover and in the brochure, identical in
 * both locales for the same reason `Montero` is.
 *
 * The rest of `FUEL_SYSTEMS` (`mpi`, `carburettor`, `indirect-injection`) are
 * generic descriptions of how fuel gets in, not names, so they are left out of
 * the label: writing "6G74 SOHC carburettor" would be describing the engine
 * where the others are naming it. Nothing is lost — the two 6G74 DOHC variants
 * are the only pair a family-plus-valvetrain label cannot separate, and `gdi`
 * is exactly what separates them.
 */
const BRANDED_FUEL_SYSTEMS: Readonly<Record<string, string>> = {
  gdi: "GDI",
  "di-d": "DI-D",
};

/** `2477` → `2.5 L` / `2,5 L`. One stored figure, formatted per locale. */
export function displacementLabel(
  displacementCc: number,
  locale: string
): string {
  return new Intl.NumberFormat(locale, {
    style: "unit",
    unit: "liter",
    unitDisplay: "narrow",
    maximumFractionDigits: 1,
    minimumFractionDigits: 1,
  }).format(displacementCc / 1000);
}

/** `6G74 SOHC` — family and head, the way factory literature prints them. */
export function engineShortLabel(engine: EngineOption): string {
  const parts = [engine.engineFamily.toUpperCase()];
  if (engine.valvetrain !== undefined) {
    parts.push(engine.valvetrain.toUpperCase());
  }
  const branded =
    engine.fuelSystem === undefined
      ? undefined
      : BRANDED_FUEL_SYSTEMS[engine.fuelSystem];
  if (branded !== undefined) parts.push(branded);
  return parts.join(" ");
}

/** `6G74 SOHC · 3.5 L` — the dropdown option. */
export function engineLabel(engine: EngineOption, locale: string): string {
  return `${engineShortLabel(engine)}${FACET_SEPARATOR}${displacementLabel(
    engine.displacementCc,
    locale
  )}`;
}

/**
 * `V60/V70` — the chassis-code subtitle on a generation button.
 *
 * The first two codes only. A generation entry lists every code the factory
 * used (`gen3` carries nine), and the artboard's button shows the two family
 * codes that identify the generation at a glance; the full list belongs on a
 * generation page, not on a button.
 */
export function chassisLabel(generation: GenerationOption): string {
  return generation.chassisCodes.slice(0, 2).join("/");
}

/**
 * `1999–2006`, or `1999–` while a span is open at its cited source.
 *
 * An en dash, and no invented end year: `production.to: null` means the source
 * did not state one (`src/schemas/vehicles.ts`).
 */
export function productionLabel(generation: GenerationOption): string {
  const { from, to } = generation.production;
  return `${from}–${to ?? ""}`;
}

/**
 * The active-state chip: `Gen 3 · US · 2002 · 6G74 SOHC`, plus `4WD` when the
 * visitor named a drive.
 *
 * `generationLabel` is passed in rather than derived because it is the one
 * translated word in the chip (`Gen 3` / `Generación 3`) and lives in
 * `src/i18n/ui.ts`; everything else is a code or a figure.
 */
export function vehicleChipLabel(input: {
  readonly generationLabel: string;
  readonly market: string;
  readonly year: number;
  readonly engine: EngineOption | null;
  readonly drive?: string | undefined;
}): string {
  const parts: string[] = [
    input.generationLabel,
    input.market.toUpperCase(),
    String(input.year),
  ];
  if (input.engine !== null) parts.push(engineShortLabel(input.engine));
  if (input.drive !== undefined) parts.push(input.drive.toUpperCase());
  return parts.join(FACET_SEPARATOR);
}
