/**
 * A record: the row, the form draft, and the crossing between them (GAR-02′).
 *
 * > **GAR-02′** A user SHALL add records to their vehicle: dated, typed
 * > (work / receipt / note / plan), with optional cost, time, odometer,
 * > attachments, and typed references to reference entries (problems, parts,
 * > procedures).
 *
 * The counterpart to `./vehicle.ts`, with the same division: this module is
 * pure — no DOM, no Supabase client, no `import.meta.env` — so every rule about
 * what a record *is* can be graded by `record.test.ts` without a browser or a
 * database, and the page component is left with markup and wiring.
 *
 * ## A record is the user's own testimony
 *
 * AGENTS.md, and it governs everything below: user-entered garage records are
 * the user's own testimony. They are attributed to their vehicle, never
 * presented as site-verified reference facts, and never fact-checked by the
 * site. Two consequences are structural rather than editorial:
 *
 * - **`title` and `body` are the user's words, in whatever language they wrote
 *   them.** They are not site content, so they are not bilingual, they are
 *   never run through the glossary's canonical-term gate, and nothing in this
 *   module or on the page rewrites them. The *chrome* around them — every
 *   label, every chip's caption, every message — comes from `src/i18n/ui.ts`
 *   in the reader's locale (I18N-08), which is the whole of what is translated.
 * - **No confidence tier, no citation, no source.** Those belong to reference
 *   entries. A record saying a job took four hours is a claim about one truck
 *   on one day, and dressing it in the reference side's apparatus would be
 *   exactly the confusion AGENTS.md forbids.
 *
 * ## Numbers are stored once, per AGENTS.md
 *
 * Three figures on a record are quantities with units, and each is stored in
 * one unit and rendered in the reader's:
 *
 * | column | stored as | entered as | rendered by |
 * |---|---|---|---|
 * | `odometer_km` | whole kilometres | km or mi | `formatOdometer` (`./odometer.ts`) |
 * | `time_minutes` | whole minutes | hours or minutes | {@link formatDuration} |
 * | `cost_amount` + `cost_currency` | the amount and its ISO 4217 code | either | {@link formatCost} |
 *
 * The cost is the one that cannot follow the odometer's "one unit for
 * everybody" rule, because a currency is not a unit of display: ₡38 000 and
 * $38 000 are different amounts of money, and converting between them needs a
 * rate that is only true on one day. So the currency the user chose is stored
 * *beside* the amount and is never converted — `tests/garage/contract.ts` pins
 * both columns for exactly this reason, and the pair constraint in the schema
 * (`cost_amount is null or cost_currency is not null`) makes an amount without
 * its currency impossible.
 *
 * ## Done versus planned is `kind`, not a new column
 *
 * The Taller artboard draws done entries with a filled rust dot and planned
 * ones with an outlined dot, a dashed card and an amber badge. That
 * distinction is already in the contract: `record_kind` is a closed enum whose
 * fourth value is `plan`. No status column was added and none is needed — a
 * schema addition is never a drive-by edit (AGENTS.md), and a second way to
 * say "this has not happened yet" is a second way for the two to disagree.
 *
 * refs specs/002-montero-garage (GAR-02′, GAR-05′, SHR-01, SHR-03),
 * specs/001-foundation/design/HANDOFF-DESIGN.md (Taller artboard), AGENTS.md
 */

import {
  odometerInUnit,
  parseOdometer,
  type OdometerIssue,
  type OdometerUnit,
} from "./odometer.ts";

/* -------------------------------------------------------------------------
 * The row
 * ---------------------------------------------------------------------- */

/**
 * The four kinds, in the enum's own order.
 *
 * `public.record_kind` is a closed set because GAR-02′ names four values and
 * only four; this array is the browser-side copy of it, and a fifth value here
 * would be an insert the database refuses.
 */
export const RECORD_KINDS = ["work", "receipt", "note", "plan"] as const;

export type RecordKind = (typeof RECORD_KINDS)[number];

export function isRecordKind(value: unknown): value is RecordKind {
  return (
    typeof value === "string" &&
    (RECORD_KINDS as readonly string[]).includes(value)
  );
}

/**
 * The `records` row as the browser sees it — exactly the columns
 * `tests/garage/contract.ts` pins, in `snake_case`, because that is what
 * PostgREST returns and renaming them on the way in would be a second place
 * for the schema to live.
 */
export interface RecordRow {
  readonly id: string;
  readonly vehicle_id: string;
  /** `YYYY-MM-DD`. A `date` column, so no time and no zone — see {@link isCalendarDate}. */
  readonly occurred_on: string;
  readonly kind: RecordKind;
  readonly title: string | null;
  readonly body: string | null;
  readonly cost_amount: number | null;
  /** ISO 4217, upper case — the schema's own `^[A-Z]{3}$` check. */
  readonly cost_currency: string | null;
  readonly time_minutes: number | null;
  readonly odometer_km: number | null;
  readonly problem_ids: readonly string[];
  readonly part_ids: readonly string[];
  readonly procedure_ids: readonly string[];
  readonly is_public: boolean;
  readonly is_cost_public: boolean;
}

/**
 * The columns a create or an update sends — the ones a *person* filled in.
 *
 * Not `is_public` and not `is_cost_public`. They default to `false` in the
 * schema (SHR-01, SHR-03) and this write path never mentions them, so no save
 * of a record can publish one. Opening a record, and opening its cost
 * separately from the rest of it, is a sharing decision with its own surface
 * in Phase P3 (SHR-02, SHR-03, SHR-06) — and a create path that transmits
 * visibility is a create path where a typo publishes what somebody paid.
 */
export interface RecordWrite {
  readonly vehicle_id: string;
  readonly occurred_on: string;
  readonly kind: RecordKind;
  readonly title: string | null;
  readonly body: string | null;
  readonly cost_amount: number | null;
  readonly cost_currency: string | null;
  readonly time_minutes: number | null;
  readonly odometer_km: number | null;
  readonly problem_ids: readonly string[];
  readonly part_ids: readonly string[];
  readonly procedure_ids: readonly string[];
}

/* -------------------------------------------------------------------------
 * Money
 * ---------------------------------------------------------------------- */

/**
 * The currencies the form offers.
 *
 * Two, and they are the two this audience actually pays in: colones at the
 * repuestera in Costa Rica, dollars for an imported part or a US-bought truck.
 * The column takes any ISO 4217 code — the schema's check is `^[A-Z]{3}$`, not
 * an allow-list — so widening this list later is a change to one array and
 * nothing else, and a row that already carries another code still renders
 * (`formatCost` asks `Intl`, which knows every code, rather than a table here).
 */
export const RECORD_CURRENCIES = ["CRC", "USD"] as const;

export type RecordCurrency = (typeof RECORD_CURRENCIES)[number];

/** The schema's own constraint, so a bad code fails here and not at the API. */
export const CURRENCY_CODE_PATTERN = /^[A-Z]{3}$/;

/**
 * The form's starting currency, by locale.
 *
 * A default, never a conversion: whatever is stored is what the user chose,
 * and nothing on this site turns colones into dollars. A Costa Rican reader's
 * receipts are overwhelmingly in colones and an English reader's are
 * overwhelmingly not, so this saves the commonest case one dropdown — and
 * {@link readCurrency} overrides it with whatever the user picked last, which
 * is a better guess than either.
 */
export const DEFAULT_CURRENCY_BY_LOCALE: Readonly<
  Record<string, RecordCurrency>
> = {
  en: "USD",
  es: "CRC",
};

/**
 * Where the last-used currency is kept.
 *
 * Namespaced beside the odometer unit and the locale preference, and for the
 * same reasons (`src/lib/vehicle-selection.ts` sets them out at length). It is
 * a form default only: the value that matters is the one saved on each row.
 */
export const CURRENCY_STORAGE_KEY = "monterogarage:currency";

export function isRecordCurrency(value: unknown): value is RecordCurrency {
  return (
    typeof value === "string" &&
    (RECORD_CURRENCIES as readonly string[]).includes(value)
  );
}

/** The currency the form should start on. */
export function defaultCurrency(locale: string): RecordCurrency {
  return DEFAULT_CURRENCY_BY_LOCALE[locale.slice(0, 2)] ?? "USD";
}

/** The last currency this reader used, or the locale's default. */
export function readCurrency(win: Window, locale: string): RecordCurrency {
  try {
    const stored = win.localStorage.getItem(CURRENCY_STORAGE_KEY);
    return isRecordCurrency(stored) ? stored : defaultCurrency(locale);
  } catch {
    return defaultCurrency(locale);
  }
}

export function writeCurrency(currency: RecordCurrency, win: Window): void {
  try {
    win.localStorage.setItem(CURRENCY_STORAGE_KEY, currency);
  } catch {
    // Private mode: the choice applies to this page and does not survive the
    // next navigation. The same trade the odometer unit makes.
  }
}

/**
 * The largest cost accepted, in whatever currency was chosen.
 *
 * Just under a thousand million: about two million US dollars, or fifteen
 * hundred million colones. It exists to catch a pasted phone number and a
 * slipped keystroke, not to have an opinion about what an engine rebuild
 * costs.
 */
export const MAX_COST_AMOUNT = 999_999_999;

export type CostIssue =
  "not-a-number" | "negative" | "too-large" | "ambiguous-separator";

/**
 * Parse a typed cost.
 *
 * ## Why this is not `parseOdometer` with a decimal point
 *
 * An odometer has no fractional part, so that parser can throw away every
 * separator and read the digits. A cost does have one, and the same three
 * characters mean opposite things in the two locales this site ships:
 * `1.500` is fifteen hundred to a Costa Rican reader and one and a half to an
 * English one. Guessing moves the decimal point on somebody's money by a
 * factor of a thousand, in the field where being wrong is most expensive.
 *
 * So the rule is positional rather than locale-driven, and it refuses rather
 * than guesses:
 *
 * - The **last** separator is the decimal mark when it is followed by one or
 *   two digits (`1.234,56`, `1,234.56`, `38,5`, `38.50`). Every earlier
 *   separator is a group separator and must be followed by exactly three
 *   digits.
 * - A separator followed by exactly three digits, with nothing after it,
 *   groups (`38 500`, `1,500`, `1.500`) — **unless it is the only separator
 *   in the string**, in which case `1.500` is genuinely ambiguous and the
 *   answer is `ambiguous-separator`: the page asks the reader to write it
 *   without separators rather than storing one of the two readings.
 * - Spaces and apostrophes are always group separators; they have no decimal
 *   reading anywhere.
 *
 * Empty is a legitimate answer — the column is nullable, GAR-02′ calls cost
 * "optional", and a note about a job that cost nothing to do is still a record.
 */
export function parseCost(raw: string): {
  readonly amount: number | null;
  readonly issue: CostIssue | null;
} {
  const trimmed = raw.trim();
  if (trimmed === "") return { amount: null, issue: null };

  if (/^-/.test(trimmed)) return { amount: null, issue: "negative" };

  // Characters with no decimal reading anywhere go first, so the analysis
  // below only ever sees `.` and `,`. `\s` already covers the non-breaking and
  // narrow non-breaking spaces `Intl` itself emits as group separators.
  const compact = trimmed.replace(/[\s'\u2019]/g, "");
  if (!/^[0-9.,]+$/.test(compact)) {
    return { amount: null, issue: "not-a-number" };
  }

  const separators = compact.match(/[.,]/g) ?? [];
  if (separators.length === 0) return finishCost(Number(compact));

  const last =
    compact.length - 1 - [...compact].reverse().findIndex(isSeparator);
  const tail = compact.slice(last + 1);

  let integerText: string;
  let fractionText: string;

  if (tail.length === 1 || tail.length === 2) {
    integerText = compact.slice(0, last);
    fractionText = tail;
  } else if (tail.length === 3) {
    // Grouped — but only believably so when another separator of the *same*
    // character agrees. `1.500` on its own is fifteen hundred to one reader
    // and one and a half to the other, and `1,500.000` mixes both conventions
    // in one string; neither is a reading worth guessing at.
    const uniform = separators.every((mark) => mark === separators[0]);
    if (separators.length === 1 || !uniform) {
      return { amount: null, issue: "ambiguous-separator" };
    }
    integerText = compact;
    fractionText = "";
  } else {
    return { amount: null, issue: "not-a-number" };
  }

  const digits = integerDigits(integerText);
  if (digits === null || !/^\d*$/.test(fractionText)) {
    return { amount: null, issue: "not-a-number" };
  }

  return finishCost(
    Number(fractionText === "" ? digits : `${digits}.${fractionText}`)
  );
}

function isSeparator(character: string): boolean {
  return character === "." || character === ",";
}

/**
 * The digits of the part left of the decimal mark, or `null` when it is not a
 * number anybody meant to type.
 *
 * Two accepted shapes and no third: one unbroken run of digits (`1234567`), or
 * properly grouped thousands (`1.234.567`, `38,500`). `1,2345` is neither, and
 * a string that reaches here having already been checked for stray characters
 * can still be that.
 */
function integerDigits(text: string): string | null {
  if (text === "") return null;
  if (/^\d+$/.test(text)) return text;
  const groups = text.split(/[.,]/);
  const [first, ...rest] = groups;
  if (first === undefined || !/^\d{1,3}$/.test(first)) return null;
  if (rest.some((group) => !/^\d{3}$/.test(group))) return null;
  return groups.join("");
}

function finishCost(value: number): {
  readonly amount: number | null;
  readonly issue: CostIssue | null;
} {
  if (!Number.isFinite(value)) return { amount: null, issue: "not-a-number" };
  if (value < 0) return { amount: null, issue: "negative" };
  if (value > MAX_COST_AMOUNT) return { amount: null, issue: "too-large" };
  // Two decimal places is what every currency this site offers subdivides
  // into; more is a paste artefact, and rounding here keeps the stored figure
  // and the rendered one the same number.
  return { amount: Math.round(value * 100) / 100, issue: null };
}

/**
 * `38500.5, "CRC", "es"` → `38.500,50 ₡`.
 *
 * `Intl` reading one stored pair, the same rule `formatOdometer` follows: the
 * symbol and the separators are the locale's business and are never written
 * down in `ui.ts`. The minimum fraction is zero for a whole amount, because
 * `₡38,00` is how nobody in Costa Rica writes thirty-eight colones, and two
 * otherwise so `38.5` renders as `38,50` rather than `38,5`.
 */
export function formatCost(
  amount: number,
  currency: string,
  locale: string
): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    currencyDisplay: "narrowSymbol",
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/* -------------------------------------------------------------------------
 * Time
 * ---------------------------------------------------------------------- */

/** The two units the form offers. Storage is always whole minutes. */
export const TIME_UNITS = ["h", "min"] as const;

export type TimeUnit = (typeof TIME_UNITS)[number];

export function isTimeUnit(value: unknown): value is TimeUnit {
  return (
    typeof value === "string" &&
    (TIME_UNITS as readonly string[]).includes(value)
  );
}

/**
 * A thousand hours. Long enough for the longest frame-off rebuild anybody
 * would log as one entry, short enough to catch a mistyped `1.2` that arrived
 * as `12000`.
 */
export const MAX_TIME_MINUTES = 60_000;

export type TimeIssue = "not-a-number" | "negative" | "too-large";

/**
 * Parse a typed duration into whole minutes.
 *
 * Either unit takes a fractional part (`1.5`, `1,5` — both, since the decimal
 * comma is how half the readers of this site write it, and at this scale there
 * is no thousands separator to confuse it with). Hours are where that matters;
 * a fractional *minute* is not a figure anybody logs, but it is rounded to the
 * nearest whole minute rather than refused, because rejecting `1.5 min` would
 * be a lecture in place of an answer the field can perfectly well store.
 *
 * Empty is a legitimate answer: GAR-02′ calls time optional.
 */
export function parseTime(
  raw: string,
  unit: TimeUnit
): { readonly minutes: number | null; readonly issue: TimeIssue | null } {
  const trimmed = raw.trim();
  if (trimmed === "") return { minutes: null, issue: null };
  if (/^-/.test(trimmed)) return { minutes: null, issue: "negative" };

  const normalized = trimmed.replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(normalized)) {
    return { minutes: null, issue: "not-a-number" };
  }

  const value = Number(normalized);
  const minutes = unit === "h" ? Math.round(value * 60) : Math.round(value);
  if (minutes > MAX_TIME_MINUTES) return { minutes: null, issue: "too-large" };
  return { minutes, issue: null };
}

/** Stored minutes back in the unit the form is showing. */
export function timeInUnit(minutes: number, unit: TimeUnit): number {
  return unit === "h" ? Math.round((minutes / 60) * 10) / 10 : minutes;
}

/**
 * The text of the time field, re-expressed after the reader changes the unit.
 *
 * The least-surprising thing a unit control can do is convert what is in the
 * field: `2` in hours becomes `120` in minutes, and the reader's answer to
 * "how long did it take" does not change meaning under them. The two
 * alternatives were both worse and both shipped in the first draft of this
 * page (T2-302 review, F4): re-rendering from the stored row silently threw
 * away whatever they had typed and not yet saved, and doing nothing silently
 * *reinterpreted* it, so a new record's `2` hours became two minutes.
 *
 * Text that does not parse is returned unchanged. A half-typed figure is still
 * the reader's, and rewriting it to `0` while they are mid-keystroke is the
 * same class of surprise this function exists to remove.
 *
 * The save path does not depend on this: `recordWriteFromDraft` compares the
 * field against `previous` rendered in the *current* unit, so converting an
 * untouched stored figure here still saves as the stored figure.
 */
export function convertTimeField(
  raw: string,
  from: TimeUnit,
  to: TimeUnit
): string {
  if (from === to) return raw;
  const parsed = parseTime(raw, from);
  if (parsed.issue !== null || parsed.minutes === null) return raw;
  return String(timeInUnit(parsed.minutes, to));
}

/**
 * `72, "en"` → `1.2 h`; `45, "es"` → `45 min`.
 *
 * Under an hour reads in minutes and at or over it reads in hours with one
 * decimal, which is how the artboard writes it ("1.2 h actual") and how a
 * person says it. `Intl` knows both unit names in both locales, so neither is
 * a translated string.
 */
export function formatDuration(minutes: number, locale: string): string {
  if (minutes < 60) {
    return new Intl.NumberFormat(locale, {
      style: "unit",
      unit: "minute",
      unitDisplay: "short",
      maximumFractionDigits: 0,
    }).format(minutes);
  }
  return new Intl.NumberFormat(locale, {
    style: "unit",
    unit: "hour",
    unitDisplay: "short",
    maximumFractionDigits: 1,
  }).format(minutes / 60);
}

/* -------------------------------------------------------------------------
 * The date
 * ---------------------------------------------------------------------- */

/**
 * The window a record's date has to fall in.
 *
 * Wide on purpose. A record may be dated in the future — that is what a `plan`
 * *is*, and a booked timing-belt job next March is the ordinary case — and it
 * may be dated long before the owner bought the truck, because a folder of
 * previous-owner receipts is exactly the history GAR-02′ exists to keep. The
 * bounds catch a slipped keystroke (`0202`, `2202`) and nothing else.
 */
export const RECORD_DATE_RANGE = { from: "1970-01-01", to: "2100-12-31" };

/**
 * `true` when `value` is a real `YYYY-MM-DD` calendar date.
 *
 * Round-tripped through `Date` rather than regex-only, so `2025-02-30` is
 * rejected: `Date.UTC` rolls it into March and the re-rendered string no longer
 * matches. UTC throughout — a `date` column has no zone, and building a local
 * `Date` from these parts would shift the day for readers west of Greenwich,
 * which is every reader in Costa Rica.
 */
export function isCalendarDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match === null) return false;
  const [, year, month, day] = match;
  const stamp = Date.UTC(Number(year), Number(month) - 1, Number(day));
  const back = new Date(stamp).toISOString().slice(0, 10);
  return back === value;
}

/**
 * `2026-07-19` in the reader's locale, as a date and never a moment.
 *
 * Parsed as UTC and formatted in UTC for the reason above: the stored value is
 * a calendar day, and rendering it through a local timezone would show the
 * nineteenth to a reader in Europe and the eighteenth to one in Costa Rica.
 */
export function formatRecordDate(value: string, locale: string): string {
  if (!isCalendarDate(value)) return value;
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}

/* -------------------------------------------------------------------------
 * Typed references into the reference collections (GAR-02′)
 * ---------------------------------------------------------------------- */

/**
 * The three reference collections a record may point at, in the order they
 * appear on a card.
 *
 * These are the three `text[]` columns `tests/garage/contract.ts` pins, and
 * the reason there is no fourth: GAR-02′ names problems, parts and procedures.
 */
export const REFERENCE_KINDS = ["problem", "part", "procedure"] as const;

export type ReferenceKind = (typeof REFERENCE_KINDS)[number];

/** Which row column each kind is stored in. */
export const REFERENCE_COLUMNS: Readonly<
  Record<ReferenceKind, "problem_ids" | "part_ids" | "procedure_ids">
> = {
  problem: "problem_ids",
  part: "part_ids",
  procedure: "procedure_ids",
};

/** One entry the site actually ships, as the picker and the chips need it. */
export interface ReferenceOption {
  readonly id: string;
  /** The entry's `prose.<locale>.title`, already in the reader's language. */
  readonly title: string;
}

/**
 * What the site can currently resolve, per kind.
 *
 * Built by the page from `getCollection("problems" | "parts" | "procedures")`
 * at build time and handed to the browser as one inlined JSON payload — the
 * same shape of seam `VehicleSelector.astro` uses for the taxonomy.
 *
 * ## Why the reference side gained no schema field for this (the GAR-02′ call)
 *
 * A record referencing a torque spec could have been modelled from either end:
 * an array of ids on the *record* (user data), or a "referenced by" field on
 * the *reference entry* (site content). It has to be the first, and not only
 * because the contract already pinned the three columns:
 *
 * - Reference content is git-owned and public; records are database-owned and
 *   private (MIG-03, SHR-01). A field on a content entry naming a user's
 *   record would put a private row's existence in a public file, and would
 *   have to be edited by a PR every time somebody logged an oil change.
 * - AGENTS.md: a schema change is never a drive-by edit. Nothing in this task
 *   authorised one, and nothing in it needed one.
 *
 * So the ids are a **typed slug array validated against built content at
 * render time**: {@link unknownReferenceIds} refuses to save one the site does
 * not ship, and {@link resolveReferences} renders a stored id the site can no
 * longer resolve as itself rather than dropping it — because a reference entry
 * can be renamed or retired after a record was written, and silently deleting
 * part of somebody's record to tidy up a dangling link is the one thing this
 * page must never do.
 */
export type ReferenceCatalogue = Readonly<
  Record<ReferenceKind, readonly ReferenceOption[]>
>;

export const EMPTY_CATALOGUE: ReferenceCatalogue = {
  problem: [],
  part: [],
  procedure: [],
};

/** A stored reference as a card renders it. `title === null` = unresolved. */
export interface ResolvedReference {
  readonly kind: ReferenceKind;
  readonly id: string;
  readonly title: string | null;
}

export function resolveReferences(
  row: Pick<RecordRow, "problem_ids" | "part_ids" | "procedure_ids">,
  catalogue: ReferenceCatalogue
): ResolvedReference[] {
  const resolved: ResolvedReference[] = [];
  for (const kind of REFERENCE_KINDS) {
    const ids = row[REFERENCE_COLUMNS[kind]] ?? [];
    for (const id of ids) {
      const found = catalogue[kind].find((option) => option.id === id);
      resolved.push({ kind, id, title: found?.title ?? null });
    }
  }
  return resolved;
}

/* -------------------------------------------------------------------------
 * The draft
 * ---------------------------------------------------------------------- */

/** The form's working copy, as the controls hold it. */
export interface RecordDraft {
  readonly occurredOn: string;
  readonly kind: string;
  readonly title: string;
  readonly body: string;
  readonly cost: string;
  readonly currency: string;
  readonly time: string;
  readonly timeUnit: TimeUnit;
  readonly odometer: string;
  readonly odometerUnit: OdometerUnit;
  readonly problemIds: readonly string[];
  readonly partIds: readonly string[];
  readonly procedureIds: readonly string[];
}

/**
 * The longest title accepted. A timeline card's heading is meant to be
 * scannable at a glance ("Front sway-bar end links replaced" is 32
 * characters); past this it is the body text wearing a heading's clothes, and
 * the body field is right there.
 */
export const MAX_RECORD_TITLE_LENGTH = 120;

/**
 * The longest body accepted. Four thousand characters is around six hundred
 * words — a long, detailed account of one job. It is a guard against a pasted
 * document, not a word limit anybody will meet while writing.
 */
export const MAX_RECORD_BODY_LENGTH = 4000;

export type RecordDraftIssue =
  | {
      readonly field: "occurredOn";
      readonly code: "required" | "not-a-date" | "out-of-range";
    }
  | { readonly field: "kind"; readonly code: "unknown" }
  | { readonly field: "title"; readonly code: "required" | "too-long" }
  | { readonly field: "body"; readonly code: "too-long" }
  | { readonly field: "cost"; readonly code: CostIssue }
  | { readonly field: "currency"; readonly code: "unknown" }
  | { readonly field: "time"; readonly code: TimeIssue }
  | { readonly field: "odometer"; readonly code: OdometerIssue }
  | { readonly field: "references"; readonly code: "unknown" };

export function emptyRecordDraft(input: {
  readonly today: string;
  readonly currency: RecordCurrency;
  readonly odometerUnit: OdometerUnit;
  /** The unit the reader last chose. Hours when nobody has chosen yet. */
  readonly timeUnit?: TimeUnit;
}): RecordDraft {
  return {
    occurredOn: input.today,
    kind: "work",
    title: "",
    body: "",
    cost: "",
    currency: input.currency,
    time: "",
    timeUnit: input.timeUnit ?? "h",
    odometer: "",
    odometerUnit: input.odometerUnit,
    problemIds: [],
    partIds: [],
    procedureIds: [],
  };
}

/**
 * Every reference id in `draft` that the site cannot resolve.
 *
 * The check the page runs before saving. It is not a security boundary —
 * nothing stops a determined client from posting any string into a `text[]`,
 * and nothing needs to: the array is the owner's own data in the owner's own
 * row. It is a correctness measure, so a typo does not become a chip nobody
 * can follow.
 */
export function unknownReferenceIds(
  draft: Pick<RecordDraft, "problemIds" | "partIds" | "procedureIds">,
  catalogue: ReferenceCatalogue
): string[] {
  const chosen: Record<ReferenceKind, readonly string[]> = {
    problem: draft.problemIds,
    part: draft.partIds,
    procedure: draft.procedureIds,
  };
  const unknown: string[] = [];
  for (const kind of REFERENCE_KINDS) {
    const known = new Set(catalogue[kind].map((option) => option.id));
    for (const id of chosen[kind]) {
      if (!known.has(id)) unknown.push(id);
    }
  }
  return unknown;
}

/**
 * Every issue in `draft`, empty when it is saveable.
 *
 * A list rather than the first problem, for the reason `validateVehicleDraft`
 * gives: a reader gets told about both their empty title and their impossible
 * date in one pass instead of discovering them one save at a time.
 *
 * `title` is required here while the column is nullable, and that is
 * deliberate on both sides. Every card on the timeline needs a line a reader
 * can scan, so the form asks for one; the column stays nullable because a row
 * written by anything else — a future import, the T2-304 seed, a mechanic's
 * accepted proposal (003) — must still render, and {@link recordHeadline}
 * falls back to the kind for exactly that case.
 */
export function validateRecordDraft(
  draft: RecordDraft,
  catalogue: ReferenceCatalogue = EMPTY_CATALOGUE
): readonly RecordDraftIssue[] {
  const issues: RecordDraftIssue[] = [];

  if (draft.occurredOn.trim() === "") {
    issues.push({ field: "occurredOn", code: "required" });
  } else if (!isCalendarDate(draft.occurredOn.trim())) {
    issues.push({ field: "occurredOn", code: "not-a-date" });
  } else if (
    draft.occurredOn < RECORD_DATE_RANGE.from ||
    draft.occurredOn > RECORD_DATE_RANGE.to
  ) {
    issues.push({ field: "occurredOn", code: "out-of-range" });
  }

  if (!isRecordKind(draft.kind)) {
    issues.push({ field: "kind", code: "unknown" });
  }

  const title = normalizeRecordText(draft.title);
  if (title === "") issues.push({ field: "title", code: "required" });
  else if (title.length > MAX_RECORD_TITLE_LENGTH) {
    issues.push({ field: "title", code: "too-long" });
  }

  if (draft.body.trim().length > MAX_RECORD_BODY_LENGTH) {
    issues.push({ field: "body", code: "too-long" });
  }

  const cost = parseCost(draft.cost);
  if (cost.issue !== null) issues.push({ field: "cost", code: cost.issue });
  // The pair constraint, on this side of the request: an amount with no
  // currency is a number nobody can read, and the schema refuses it anyway.
  if (cost.amount !== null && !CURRENCY_CODE_PATTERN.test(draft.currency)) {
    issues.push({ field: "currency", code: "unknown" });
  }

  const time = parseTime(draft.time, draft.timeUnit);
  if (time.issue !== null) issues.push({ field: "time", code: time.issue });

  const odometer = parseOdometer(draft.odometer, draft.odometerUnit);
  if (odometer.issue !== null) {
    issues.push({ field: "odometer", code: odometer.issue });
  }

  if (unknownReferenceIds(draft, catalogue).length > 0) {
    issues.push({ field: "references", code: "unknown" });
  }

  return issues;
}

/**
 * Collapse the runs of whitespace a paste brings with it, and trim.
 *
 * Not a sanitiser — nothing here is interpolated as HTML; the page sets
 * `textContent`. The body keeps its line breaks (a job written in steps is
 * written in lines) and is only trimmed at the ends.
 */
export function normalizeRecordText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/**
 * The row body for an insert or an update, or `null` when the draft has
 * issues.
 *
 * `previous` plays exactly the part it plays in `vehicleWriteFromDraft`, and it
 * plays it for **both** of this row's two-unit figures: when a field still
 * reads what {@link recordDraftFromRow} put there, the stored value is carried
 * over unconverted.
 *
 * ## The odometer's trap is the time's trap
 *
 * A display round trip is not lossless in the direction that starts from
 * storage. 247 500 km renders as 153 789 mi and converts back to 247 499 — and
 * 45 minutes renders as 0.8 h and converts back to **48**, 100 minutes to 102,
 * and one minute to zero. So a reader who fixed a typo in the *title* would
 * have added three minutes to the job on every save, and a one-minute entry
 * would have vanished on the first.
 *
 * The first version of this guarded only the odometer, and the suite missed it
 * because every fixture used 72 minutes — 1.2 h, one of the few values that
 * survives the round trip (T2-302 review, F1). The fix is not more precision;
 * it is not converting a figure nobody touched, so both branches below are the
 * same branch written twice, on purpose, against one shared rendering of
 * `previous`.
 */
export function recordWriteFromDraft(
  vehicleId: string,
  draft: RecordDraft,
  catalogue: ReferenceCatalogue = EMPTY_CATALOGUE,
  previous: RecordRow | null = null
): RecordWrite | null {
  if (validateRecordDraft(draft, catalogue).length > 0) return null;
  if (!isRecordKind(draft.kind)) return null;

  // `previous` as the form would be showing it, in the units the form is
  // currently in — the only thing "untouched" can honestly be compared to.
  const asShown =
    previous === null
      ? null
      : recordDraftFromRow(previous, {
          odometerUnit: draft.odometerUnit,
          timeUnit: draft.timeUnit,
        });

  const odometerKm =
    previous !== null && asShown !== null && draft.odometer === asShown.odometer
      ? previous.odometer_km
      : parseOdometer(draft.odometer, draft.odometerUnit).km;

  const timeMinutes =
    previous !== null && asShown !== null && draft.time === asShown.time
      ? previous.time_minutes
      : parseTime(draft.time, draft.timeUnit).minutes;

  const cost = parseCost(draft.cost);
  const body = draft.body.trim();

  return {
    vehicle_id: vehicleId,
    occurred_on: draft.occurredOn.trim(),
    kind: draft.kind,
    title: normalizeRecordText(draft.title),
    body: body === "" ? null : body,
    cost_amount: cost.amount,
    cost_currency: cost.amount === null ? null : draft.currency,
    time_minutes: timeMinutes,
    odometer_km: odometerKm,
    problem_ids: [...draft.problemIds],
    part_ids: [...draft.partIds],
    procedure_ids: [...draft.procedureIds],
  };
}

/** A stored row, back in the form's shape, for the edit path. */
export function recordDraftFromRow(
  row: RecordRow,
  units: { readonly odometerUnit: OdometerUnit; readonly timeUnit: TimeUnit }
): RecordDraft {
  return {
    occurredOn: row.occurred_on,
    kind: row.kind,
    title: row.title ?? "",
    body: row.body ?? "",
    cost: row.cost_amount === null ? "" : String(row.cost_amount),
    currency: row.cost_currency ?? "",
    time:
      row.time_minutes === null
        ? ""
        : String(timeInUnit(row.time_minutes, units.timeUnit)),
    timeUnit: units.timeUnit,
    odometer:
      row.odometer_km === null
        ? ""
        : String(odometerInUnit(row.odometer_km, units.odometerUnit)),
    odometerUnit: units.odometerUnit,
    problemIds: [...row.problem_ids],
    partIds: [...row.part_ids],
    procedureIds: [...row.procedure_ids],
  };
}

/* -------------------------------------------------------------------------
 * The timeline
 * ---------------------------------------------------------------------- */

/** `true` for the one kind that has not happened yet. */
export function isPlanned(row: Pick<RecordRow, "kind">): boolean {
  return row.kind === "plan";
}

/**
 * The order the Taller artboard draws: what happened, newest first, then what
 * is planned, soonest first.
 *
 * Two runs rather than one sort key, because the two halves want opposite
 * directions. History reads newest-first — the last thing done to the truck is
 * the thing you came to check. A plan reads soonest-first, because the next
 * job is the one that matters and a plan dated three years out is not the
 * headline. The artboard puts the planned card at the foot of the rail, which
 * is the same statement in pictures.
 *
 * `id` breaks every tie, so two records on the same day never swap places
 * between renders.
 */
export function timelineOrder(rows: readonly RecordRow[]): RecordRow[] {
  const done = rows.filter((row) => !isPlanned(row));
  const planned = rows.filter(isPlanned);
  done.sort(
    (left, right) =>
      right.occurred_on.localeCompare(left.occurred_on) ||
      right.id.localeCompare(left.id)
  );
  planned.sort(
    (left, right) =>
      left.occurred_on.localeCompare(right.occurred_on) ||
      left.id.localeCompare(right.id)
  );
  return [...done, ...planned];
}

/** Just the plans, soonest first — the artboard's planned queue, unadorned. */
export function plannedRecords(rows: readonly RecordRow[]): RecordRow[] {
  return timelineOrder(rows).filter(isPlanned);
}

/**
 * The two figures in the stat row: how much is written down, and how much of
 * it is still ahead.
 *
 * `entries` counts every record — a plan somebody wrote down is an entry in
 * their garage — and `planned` counts the subset that has not happened. The
 * artboard shows them side by side for that reading: 47 entries, 5 of them
 * planned.
 */
export function recordCounts(rows: readonly RecordRow[]): {
  readonly entries: number;
  readonly planned: number;
} {
  return {
    entries: rows.length,
    planned: rows.filter(isPlanned).length,
  };
}

/**
 * The line a card leads with.
 *
 * The user's own title when there is one. When there is not — a row written
 * before this form existed, an import, an accepted proposal — the caller's
 * localized name for the kind stands in, so a card is never a heading with
 * nothing in it (WCAG 2.1 AA, the same H42.2 rule the vehicle name hits).
 */
export function recordHeadline(
  row: Pick<RecordRow, "title" | "kind">,
  kindLabel: string
): string {
  const title = (row.title ?? "").trim();
  return title === "" ? kindLabel : title;
}
