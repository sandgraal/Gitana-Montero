/**
 * The odometer: one stored figure, two ways to read it (GAR-01′).
 *
 * > **GAR-01′** A user SHALL create vehicle profiles with a display name,
 * > taxonomy identity resolved by the 001 fitment engine, photos, and
 * > odometer.
 *
 * ## Why the unit is not a column
 *
 * `tests/garage/contract.ts` pins exactly one odometer column on `vehicles`:
 * `odometer_km`. That is the whole design, and it is the right one —
 * AGENTS.md's rule is that a figure is stored once, in one unit, and rendered
 * per reader. A second column holding "km" or "mi" would let the number and
 * its unit drift apart, and the first bug it produced would be a truck that
 * gained 60% of its mileage on a page reload.
 *
 * So kilometres are the storage unit and the display unit is a **reader
 * preference**, kept in `localStorage` beside the locale preference and the
 * vehicle selection, for the reasons `src/lib/vehicle-selection.ts` sets out
 * at length: origin-scoped, survives the locale switch for free, and never
 * mints a URL for something that is not a different document. A Costa Rican
 * owner reads kilometres; an owner who imported their Montero from the US
 * thinks in miles; the row underneath is identical.
 *
 * ## The round trip, in the direction that matters and in the one that does not
 *
 * `mi → km → mi` is **lossless**: rounding to the nearest whole kilometre
 * moves the value by at most 0.5 km = 0.31 mi, which is under half a mile, so
 * the number a mile-reader typed comes back as the number they typed
 * (`odometer.test.ts` pins it across the plausible range).
 *
 * `km → mi → km` is **not**, and cannot be: 247 500 km is 153 789.37 mi, and
 * that whole-mile display converted back lands on 247 499. That is a rounding
 * artefact, not a reading, and rewriting a row with it on every save would
 * walk somebody's odometer a kilometre at a time. The fix is not more
 * precision — it is not converting a figure nobody touched, which is what
 * `vehicleWriteFromDraft`'s `previous` argument is for
 * (`src/lib/garage/vehicle.ts`).
 *
 * refs specs/002-montero-garage (GAR-01′), AGENTS.md (a figure is stored once)
 */

/** The two units a reader may ask for. Storage is always the first. */
export const ODOMETER_UNITS = ["km", "mi"] as const;

export type OdometerUnit = (typeof ODOMETER_UNITS)[number];

/** The exact international definition, not an approximation. */
export const KM_PER_MILE = 1.609344;

/**
 * Where the reader's display unit is kept. Namespaced and not per-locale,
 * exactly like `VEHICLE_STORAGE_KEY`: a reader who prefers miles prefers them
 * in Spanish too.
 */
export const ODOMETER_UNIT_STORAGE_KEY = "monterogarage:odometer-unit";

/**
 * The largest odometer this accepts, in kilometres.
 *
 * Ten million kilometres is roughly 250 laps of the equator and about two
 * orders of magnitude past the highest-mileage Montero anyone has documented.
 * It exists to catch a slipped keystroke and a pasted phone number, not to
 * express an opinion about how long a 6G74 lasts.
 */
export const MAX_ODOMETER_KM = 9_999_999;

export function isOdometerUnit(value: unknown): value is OdometerUnit {
  return (
    typeof value === "string" &&
    (ODOMETER_UNITS as readonly string[]).includes(value)
  );
}

/** `12345 km` in miles, rounded to a whole mile for display. */
export function odometerInUnit(km: number, unit: OdometerUnit): number {
  return unit === "km" ? Math.round(km) : Math.round(km / KM_PER_MILE);
}

/** A reader's typed figure, in their unit, as whole kilometres to store. */
export function odometerToKm(value: number, unit: OdometerUnit): number {
  return unit === "km" ? Math.round(value) : Math.round(value * KM_PER_MILE);
}

/** What was wrong with a typed odometer, or `null` when nothing was. */
export type OdometerIssue = "not-a-number" | "negative" | "too-large";

/**
 * Parse an odometer field.
 *
 * An empty field is a legitimate answer — the column is nullable, and a user
 * who has not walked out to the truck yet should still be able to save the
 * profile — so it yields `{ km: null }` and no issue. Anything non-empty has
 * to be a plausible distance.
 *
 * Only the reader's own digits are trusted: separators a locale might insert
 * (`160 934`, `160,934`, `160.934`) are stripped before parsing, because the
 * same three characters mean different things in `en` and `es` and guessing
 * wrong would move the decimal point on somebody's truck.
 */
export function parseOdometer(
  raw: string,
  unit: OdometerUnit
): { readonly km: number | null; readonly issue: OdometerIssue | null } {
  const trimmed = raw.trim();
  if (trimmed === "") return { km: null, issue: null };

  const digitsOnly = trimmed.replace(/[\s,._']/g, "");
  if (!/^\d+$/.test(digitsOnly)) {
    // A leading minus is its own answer rather than "not a number", because
    // "-5" is a typo with an obvious correction and "abc" is not.
    return {
      km: null,
      issue: /^-\d/.test(trimmed) ? "negative" : "not-a-number",
    };
  }

  const km = odometerToKm(Number(digitsOnly), unit);
  if (km > MAX_ODOMETER_KM) return { km: null, issue: "too-large" };
  return { km, issue: null };
}

/**
 * `160934` → `160,934 km` / `160 934 km`, or `100,000 mi`.
 *
 * `Intl.NumberFormat` reading one stored figure — the same rule
 * `displacementLabel` follows in `src/lib/vehicle-labels.ts`. The unit is not
 * a translated string in `ui.ts`, because `km` and `mi` are unit symbols that
 * `Intl` already knows in both locales, and writing them down twice is the
 * duplication AGENTS.md forbids.
 */
export function formatOdometer(
  km: number,
  unit: OdometerUnit,
  locale: string
): string {
  return new Intl.NumberFormat(locale, {
    style: "unit",
    unit: unit === "km" ? "kilometer" : "mile",
    unitDisplay: "short",
    maximumFractionDigits: 0,
  }).format(odometerInUnit(km, unit));
}

/* -------------------------------------------------------------------------
 * Browser side — the `Window` is passed in, as in vehicle-selection.ts, so a
 * storage-less environment degrades to the default instead of throwing.
 * ---------------------------------------------------------------------- */

/** The reader's unit, defaulting to the stored one. */
export function readOdometerUnit(win: Window): OdometerUnit {
  try {
    const stored = win.localStorage.getItem(ODOMETER_UNIT_STORAGE_KEY);
    return isOdometerUnit(stored) ? stored : "km";
  } catch {
    return "km";
  }
}

export function writeOdometerUnit(unit: OdometerUnit, win: Window): void {
  try {
    win.localStorage.setItem(ODOMETER_UNIT_STORAGE_KEY, unit);
  } catch {
    // Private mode. The choice applies to this page and does not survive the
    // next navigation, which is the same trade the vehicle selection makes.
  }
}
