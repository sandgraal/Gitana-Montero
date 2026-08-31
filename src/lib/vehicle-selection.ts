/**
 * The visitor's chosen vehicle: how it is written down, read back, and
 * announced to the rest of the page (FIT-03).
 *
 * > **FIT-03** WHEN a visitor selects a vehicle (gen + market + year +
 * > engine), THE site SHALL filter any collection listing to entries whose
 * > fitment matches, and SHALL persist the selection across pages and locales.
 *
 * This module owns the *state*. It owns nothing about matching — "does entry E
 * apply to vehicle V" is `src/lib/fitment/` and only ever `src/lib/fitment/`
 * (FIT-01). A {@link VehicleSelection} produced here is handed to that engine
 * unchanged.
 *
 * ## Persistence mechanism: `localStorage`, not URL parameters
 *
 * FIT-03 asks for persistence "across pages **and locales**", and those two
 * words rule out the obvious alternative.
 *
 * - **`localStorage` is origin-scoped**, so it survives both halves for free:
 *   a click from `/en/community/` to `/es/comunidad/` is the same origin, and
 *   the stored selection is still there on the other side with nothing to
 *   propagate. This is the same mechanism, and the same reasoning, as the
 *   locale preference in `src/i18n/locale-preference.ts`.
 * - **URL parameters would have to be threaded through every link on the
 *   site** — including the locale switcher, whose hrefs are graded against
 *   `localeHref()` (`tests/locale-switcher.test.ts`), and the `hreflang` and
 *   canonical sets, which must name the URL that was actually built
 *   (`check:hreflang`). A selection is a *reader preference*, not a different
 *   document, so giving it a URL would mint an unbounded set of URLs for one
 *   page and invite them to be indexed and shared as if they were.
 * - **A cookie** buys nothing here. The locale preference is *also* written to
 *   one because a future server or edge redirect has to read it before any
 *   JavaScript runs (I18N-02). Nothing on the server side needs the vehicle:
 *   the site is static output, filtering happens in the browser, and every
 *   page renders complete and unfiltered without it.
 *
 * The cost is honest and bounded: the selection does not travel between
 * browsers or devices, and a shared link is always the unfiltered page. When
 * user accounts land (002 ACC-01…04) a signed-in visitor's garage vehicle
 * becomes the better source, and this module is the seam it replaces.
 *
 * ## No JavaScript
 *
 * Every page renders its full listing server-side, and the selector chrome is
 * laid out **by CSS only when scripting is available**: `BaseLayout` adds a
 * `js` class to `<html>` from a two-statement inline script before first
 * paint, and `.vs` is `display: none` until that class is present. A visitor
 * with no JavaScript therefore sees every entry and no dead control, and a
 * visitor with it gets the bar in the first layout rather than watching the
 * page jump when a module script reveals it.
 *
 * (An earlier draft shipped the bar with the `hidden` attribute and removed it
 * from the script. That is the usual pattern and it is wrong *here*, because
 * this control sits above the page content: revealing it after hydration
 * pushed everything down — measured at 0.345 CLS on the community page, well
 * past SCF-06's budget. The same fix was applied to the glossary and community
 * filter toolbars, which had the mirror-image bug: an author `display: flex`
 * silently overrode the user-agent `[hidden]` rule, so their controls were
 * visible and inert with scripting off.)
 *
 * Filtering is an *enhancement over* a complete page, never a precondition for
 * reading one.
 *
 * refs specs/001-foundation (FIT-01, FIT-03, I18N-01)
 */

import type { VehicleSelection } from "./fitment/index.ts";
import {
  DRIVE_TYPES,
  GENERATION_IDS,
  MARKETS,
  PRODUCTION_YEAR_RANGE,
  TAXONOMY_ID_PATTERN,
} from "../schemas/vehicle-vocabulary.ts";

/**
 * Where the selection is kept. Namespaced to the site exactly like
 * `LOCALE_STORAGE_KEY`, and deliberately *not* per-locale: one truck, one
 * value, read identically from `/en/…` and `/es/…`. Making it locale-suffixed
 * is how "persists across locales" would quietly stop being true.
 */
export const VEHICLE_STORAGE_KEY = "monterogarage:vehicle";

/**
 * Broadcast on `document` whenever the stored selection changes, so a listing
 * on the page can re-filter without the selector knowing anything about it.
 *
 * A DOM event rather than a shared module singleton because the selector lives
 * in the site chrome (`BaseLayout`) and a listing lives in a page component:
 * they are separate `<script>` bundles that never share an instance. The
 * event's `detail` is the new selection, or `null` when it was cleared.
 */
export const VEHICLE_CHANGE_EVENT = "montero:vehicle-change";

export type VehicleChangeEvent = CustomEvent<VehicleSelection | null>;

/**
 * A selection as it is stored: FIT-03's required quadruple plus the one
 * optional facet the selector offers.
 *
 * `drive` is here and `transmission` / `transferCase` / `trim` are not,
 * because `DRIVE_TYPES` is a closed two-value vocabulary (owner ruling
 * 2026-08-30) — a control with two options, not a fifth dropdown over taxonomy
 * entries. The other three stay unanswerable through this UI, which is
 * precisely why filtered listings carry a provisional indicator
 * (`provisionalMatchFacets` in `src/lib/fitment/`).
 */
export interface StoredVehicleSelection extends VehicleSelection {
  readonly gen: string;
  readonly market: string;
  readonly year: number;
  readonly engine: string;
  readonly drive?: string;
}

/** The fields a valid stored value carries, in write order. */
const STORED_FIELDS = ["gen", "market", "year", "engine", "drive"] as const;

function isGeneration(value: unknown): value is string {
  return (
    typeof value === "string" &&
    (GENERATION_IDS as readonly string[]).includes(value)
  );
}

function isMarket(value: unknown): value is string {
  return (
    typeof value === "string" && (MARKETS as readonly string[]).includes(value)
  );
}

function isDrive(value: unknown): value is string {
  return (
    typeof value === "string" &&
    (DRIVE_TYPES as readonly string[]).includes(value)
  );
}

/**
 * Engine ids are open (`6g74-sohc`, `4m41`), so the only shape check available
 * without the taxonomy is the kebab-case rule every taxonomy id is stored
 * under. Whether the id resolves is the fitment engine's question, asked
 * against a real taxonomy — this is only "is it plausibly an id at all".
 */
function isEngineId(value: unknown): value is string {
  return typeof value === "string" && TAXONOMY_ID_PATTERN.test(value);
}

function isProductionYear(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= PRODUCTION_YEAR_RANGE.from &&
    value <= PRODUCTION_YEAR_RANGE.to
  );
}

/**
 * A stored value, validated, or `null`.
 *
 * Strict on purpose: `localStorage` is reader-writable and survives deploys,
 * so a value from an older shape (or from a console) must not become a filter
 * that silently hides content. Anything that is not a complete, well-formed
 * selection is treated as no selection at all — the state in which every page
 * shows everything.
 */
export function parseVehicleSelection(
  value: unknown
): StoredVehicleSelection | null {
  const raw =
    typeof value === "string" ? safeParseJson(value) : (value ?? null);
  if (typeof raw !== "object" || raw === null || Array.isArray(raw))
    return null;

  const record = raw as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (!(STORED_FIELDS as readonly string[]).includes(key)) return null;
  }

  const { gen, market, year, engine, drive } = record;
  if (!isGeneration(gen)) return null;
  if (!isMarket(market)) return null;
  if (!isProductionYear(year)) return null;
  if (!isEngineId(engine)) return null;
  if (drive !== undefined && !isDrive(drive)) return null;

  return drive === undefined
    ? { gen, market, year, engine }
    : { gen, market, year, engine, drive };
}

function safeParseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

/** The stored form. Key order is fixed so the written string is stable. */
export function serializeVehicleSelection(
  selection: StoredVehicleSelection
): string {
  const ordered: Record<string, unknown> = {};
  for (const field of STORED_FIELDS) {
    const value = selection[field];
    if (value !== undefined) ordered[field] = value;
  }
  return JSON.stringify(ordered);
}

/**
 * Two selections describing the same truck. Used to skip a redundant write and
 * the event it would fire — a listing that re-filters on every keystroke of a
 * `<select>` is a listing that flickers.
 */
export function sameVehicleSelection(
  a: StoredVehicleSelection | null,
  b: StoredVehicleSelection | null
): boolean {
  if (a === null || b === null) return a === b;
  return serializeVehicleSelection(a) === serializeVehicleSelection(b);
}

/* -------------------------------------------------------------------------
 * Browser side
 *
 * Every function takes the `Window` rather than reaching for the global, so
 * the DOM tests can drive a JSDOM window and so a storage-less environment
 * (private mode, third-party storage blocked) degrades to "no selection"
 * instead of throwing on page load.
 * ---------------------------------------------------------------------- */

export function readVehicleSelection(
  win: Window
): StoredVehicleSelection | null {
  try {
    return parseVehicleSelection(win.localStorage.getItem(VEHICLE_STORAGE_KEY));
  } catch {
    return null;
  }
}

/** Persist a selection and announce it. Returns what was actually stored. */
export function writeVehicleSelection(
  selection: StoredVehicleSelection,
  win: Window
): StoredVehicleSelection | null {
  const validated = parseVehicleSelection(selection);
  if (validated === null) return null;
  try {
    win.localStorage.setItem(
      VEHICLE_STORAGE_KEY,
      serializeVehicleSelection(validated)
    );
  } catch {
    // Storage can throw in private mode. The selection still applies to this
    // page — announcing it is what makes the filter work — it just will not
    // survive the next navigation.
  }
  announceVehicleSelection(validated, win);
  return validated;
}

/** Forget the selection and announce it (the chip's `x`). */
export function clearVehicleSelection(win: Window): void {
  try {
    win.localStorage.removeItem(VEHICLE_STORAGE_KEY);
  } catch {
    // As above: nothing to remove, nothing to report.
  }
  announceVehicleSelection(null, win);
}

function announceVehicleSelection(
  selection: StoredVehicleSelection | null,
  win: Window
): void {
  /*
   * The *window's own* `CustomEvent`, not the ambient global. Under JSDOM the
   * two are different constructors in different realms, and an event built
   * from the wrong one is rejected by `dispatchEvent`. `Window` does not
   * declare the constructor property (only `Window & typeof globalThis`
   * does), so it is read through a narrow cast rather than by widening the
   * parameter and pushing that requirement onto every caller.
   */
  const ctor =
    (win as Window & { CustomEvent?: typeof CustomEvent }).CustomEvent ??
    CustomEvent;

  win.document.dispatchEvent(
    new ctor(VEHICLE_CHANGE_EVENT, {
      detail: selection,
      bubbles: false,
    }) as VehicleChangeEvent
  );
}

/**
 * Subscribe to selection changes. Returns an unsubscribe function.
 *
 * Also listens for the `storage` event, so a selection made in one tab reaches
 * the listing open in another — which is the same "persists across pages"
 * promise, one window over.
 */
export function onVehicleSelectionChange(
  win: Window,
  handler: (selection: StoredVehicleSelection | null) => void
): () => void {
  const onChange = (event: Event) => {
    handler((event as VehicleChangeEvent).detail ?? null);
  };
  const onStorage = (event: Event) => {
    const storageEvent = event as StorageEvent;
    if (storageEvent.key !== null && storageEvent.key !== VEHICLE_STORAGE_KEY) {
      return;
    }
    handler(readVehicleSelection(win));
  };

  win.document.addEventListener(VEHICLE_CHANGE_EVENT, onChange);
  win.addEventListener("storage", onStorage);

  return () => {
    win.document.removeEventListener(VEHICLE_CHANGE_EVENT, onChange);
    win.removeEventListener("storage", onStorage);
  };
}
