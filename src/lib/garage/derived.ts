/**
 * The two derived views: the current-state sheet and the planned queue
 * (GAR-03′). Pure, so every rule is graded by `derived.test.ts`.
 *
 * > **GAR-03′** THE derived views of 001 GAR-02/03 (current-state sheet,
 * > planned queue) SHALL be computed per vehicle from its records, never
 * > hand-maintained.
 *
 * and the two requirements it carries forward:
 *
 * > **GAR-02 (001)** THE site SHALL render a derived current-state sheet:
 * > what is on the truck now (parts, mods, fluids), mileage, and service
 * > history — computed from garage entries, never hand-maintained.
 * >
 * > **GAR-03 (001)** THE site SHALL render a planned-work queue from garage
 * > entries with status `planned`, ordered by priority.
 *
 * Everything below reads the `records` array the page already holds. It opens
 * no request, adds no column and consults no second source — "never
 * hand-maintained" is not a promise made in a comment here, it is the fact
 * that there is nowhere else for any of these figures to come from.
 *
 * ## `null` is not `[]`, at every entry point (PR #68)
 *
 * The receipts lesson generalises badly if it is only applied to receipts. A
 * failed `listRecords` reaching this module as an empty array would make every
 * function below answer confidently: no odometer reading, no service history,
 * nothing planned. Each of those is a *statement about the truck*, and all
 * three would be wrong — the honest answer is "this could not be worked out".
 *
 * So {@link currentState} and {@link plannedQueue} take
 * `readonly RecordRow[] | null` and return `null` for `null`. A caller cannot
 * accidentally read a failure as an empty garage, because the failure has a
 * different type from the empty garage, and the page renders the two with
 * different words.
 *
 * ## No new column, no new taxonomy, no invented interval
 *
 * Three things this module deliberately does not do, each because doing it
 * would have needed something AGENTS.md says is never a drive-by edit:
 *
 * - **Priority is the date.** GAR-03 says "ordered by priority" and no
 *   priority column exists. Adding one is a schema change this task did not
 *   authorise, and inventing a client-side ranking would be a second, unstored
 *   opinion about the owner's own plans. The date the owner already gave each
 *   plan *is* their statement of when it matters, and the only non-arbitrary
 *   cut in it is today: past, or ahead. There is no third bucket, because any
 *   third bucket needs a horizon nobody chose.
 * - **A consumable is whatever the owner linked.** "Fluids/consumables state"
 *   would need the site to know that some reference entry is engine oil. There
 *   is no consumable taxonomy on `parts`/`procedures` and adding one is a
 *   schema change. So {@link serviceLines} groups by the reference id the
 *   *owner* attached to a record: the entries they linked are the lines of the
 *   sheet, and an oil-change procedure they linked twice is a line that says
 *   when it was last done. That reads correctly for fluids without pretending
 *   to a classification the site does not have.
 * - **Nothing here says "due".** A due date needs a service interval, and the
 *   only intervals this repo has (`serviceIntervalSchema`,
 *   `src/schemas/reference.ts`) live on `reference` entries, which a record
 *   cannot point at — GAR-02′ names problems, parts and procedures. So the
 *   sheet reports *elapsed*: last done, and how far the truck has gone since.
 *   "You are 2 000 km overdue" would be a fact the site made up.
 *
 * ## Unknown renders as unknown
 *
 * Every optional figure that cannot be worked out is `null` and not `0`. The
 * one that matters most is {@link ServiceLine.sinceKm}: a service whose record
 * carried no odometer, or a garage whose latest odometer is unknown, yields
 * `null` — never zero, which would read as "done at the current mileage",
 * which is the opposite of not knowing.
 *
 * refs specs/002-montero-garage (GAR-03′, GAR-02′), specs/001-foundation
 * (GAR-02, GAR-03), AGENTS.md
 */

import {
  REFERENCE_COLUMNS,
  REFERENCE_KINDS,
  isPlanned,
  type RecordRow,
  type ReferenceCatalogue,
  type ReferenceKind,
} from "./record.ts";

/* -------------------------------------------------------------------------
 * Ordering
 * ---------------------------------------------------------------------- */

/**
 * "Which of these two happened later?", the comparator `timelineOrder` sorts
 * the done half of the rail by.
 *
 * Shared rather than re-derived so the sheet and the rail cannot disagree
 * about which record is the most recent one: the reading this module calls
 * "latest" is the topmost card on the timeline that carries an odometer, and
 * a reader comparing the two tabs must not find them naming different days.
 * `id` breaks the tie for the same reason it does there — two records on one
 * day must not swap places between renders.
 */
function laterFirst(left: RecordRow, right: RecordRow): number {
  return (
    right.occurred_on.localeCompare(left.occurred_on) ||
    right.id.localeCompare(left.id)
  );
}

/* -------------------------------------------------------------------------
 * The odometer (001 GAR-02's "mileage")
 * ---------------------------------------------------------------------- */

/** The most recent odometer reading the records carry. */
export interface OdometerReading {
  /** Whole kilometres, the one stored unit (`./odometer.ts`). */
  readonly km: number;
  /** The `YYYY-MM-DD` the reading was taken. */
  readonly occurredOn: string;
  /** Which record it came from, so the sheet can be checked against the rail. */
  readonly recordId: string;
  /**
   * `true` when a record dated **strictly earlier** reads higher.
   *
   * An odometer does not run backwards, so this is the owner's own data
   * disagreeing with itself — a transposed figure, a reading copied from the
   * wrong receipt, or a swapped cluster. The sheet says so rather than
   * silently presenting the later, lower figure as the truck's mileage, and
   * rather than "correcting" it: both records are the owner's testimony and
   * neither is the site's to overrule.
   *
   * Same-day pairs are not a contradiction. Two readings on one date have no
   * order between them beyond the id tie-break, which is arbitrary, and
   * flagging an arbitrary order as a data error would fire on a perfectly
   * ordinary day of two jobs.
   */
  readonly contradicted: boolean;
}

/**
 * The latest odometer reading, or `null` when no record carries one.
 *
 * ## Two things it is not
 *
 * **Not the highest reading.** The largest number in the column is the answer
 * to a different question, and it is the wrong one the moment somebody enters
 * a transposed digit — 2 475 000 km would then be the truck's mileage forever,
 * with no way for a later, correct record to displace it.
 *
 * **Not the vehicle profile's `odometer_km`.** That column is hand-maintained,
 * and GAR-03′ says this view is computed from the records. The two answer
 * different questions and the page labels them differently: the stat row shows
 * the figure the owner keeps current, this sheet shows the last figure they
 * actually wrote down against a job.
 *
 * Plans are excluded, and that is load-bearing rather than tidy. A plan is
 * dated in the future by design (`RECORD_DATE_RANGE` allows it precisely so),
 * so a planned service carrying a target odometer would otherwise become "the
 * truck's current mileage" — a reading of a day that has not happened.
 */
export function latestOdometer(
  rows: readonly RecordRow[]
): OdometerReading | null {
  const withReading = rows.filter(
    (row) => !isPlanned(row) && row.odometer_km !== null
  );
  if (withReading.length === 0) return null;

  const latest = [...withReading].sort(laterFirst)[0];
  if (latest === undefined || latest.odometer_km === null) return null;

  const contradicted = withReading.some(
    (row) =>
      row.occurred_on < latest.occurred_on &&
      row.odometer_km !== null &&
      row.odometer_km > (latest.odometer_km ?? 0)
  );

  return {
    km: latest.odometer_km,
    occurredOn: latest.occurred_on,
    recordId: latest.id,
    contradicted,
  };
}

/* -------------------------------------------------------------------------
 * Service history (001 GAR-02's "parts, mods, fluids" and "service history")
 * ---------------------------------------------------------------------- */

/** One thing the owner has linked to a record, and when it was last done. */
export interface ServiceLine {
  readonly kind: ReferenceKind;
  readonly id: string;
  /**
   * The entry's title in the reader's locale, or `null` when the site can no
   * longer resolve the id.
   *
   * `null` is rendered as the id itself, never dropped — the same rule the
   * timeline's chips follow. A reference entry can be retired after a record
   * was written, and tidying the line away would delete part of the owner's
   * service history to hide the site's own churn.
   */
  readonly title: string | null;
  /** `YYYY-MM-DD` of the most recent done record naming this id. */
  readonly lastDoneOn: string;
  /** That record's id. */
  readonly lastRecordId: string;
  /** The odometer on that record, or `null` when it carried none. */
  readonly odometerKm: number | null;
  /**
   * Kilometres between that record and {@link latestOdometer}, or `null`.
   *
   * `null` — never `0` — whenever either end is unknown, or when the arithmetic
   * would come out negative (which means the readings contradict each other,
   * and a negative distance travelled is not an answer worth rendering).
   * A genuine `0` is a real answer: the service was done at the reading that is
   * still the latest one.
   */
  readonly sinceKm: number | null;
}

/**
 * The service history, one line per reference entry the owner has linked.
 *
 * Plans are excluded: a planned oil change is not an oil change, and a sheet
 * that counted one would tell an owner their oil was done when it was not.
 * That is the single most consequential exclusion in this module.
 *
 * ## The order is oldest first
 *
 * Deliberately the opposite of the timeline, which is right beside it. The
 * rail already answers "what happened recently"; repeating it here in the same
 * order would be a second copy of the same list. What a state sheet is *for*
 * is the other end — the thing that has gone longest without attention heads
 * the list, which is where an owner's eye should land.
 *
 * It is an ordering, not a verdict: nothing here says a line is due, because
 * nothing here knows an interval (see the module note).
 */
export function serviceLines(
  rows: readonly RecordRow[],
  catalogue: ReferenceCatalogue,
  latest: OdometerReading | null
): ServiceLine[] {
  /** kind → id → the latest done record naming it. */
  const newest = new Map<ReferenceKind, Map<string, RecordRow>>();
  for (const kind of REFERENCE_KINDS) newest.set(kind, new Map());

  for (const row of rows) {
    if (isPlanned(row)) continue;
    for (const kind of REFERENCE_KINDS) {
      const seen = newest.get(kind);
      if (seen === undefined) continue;
      // A `text[]` the database returned; a duplicate in one row would
      // otherwise be harmless but is deduped so the comparison below runs once.
      for (const id of new Set(row[REFERENCE_COLUMNS[kind]] ?? [])) {
        const held = seen.get(id);
        if (held === undefined || laterFirst(row, held) < 0) seen.set(id, row);
      }
    }
  }

  const lines: ServiceLine[] = [];
  for (const kind of REFERENCE_KINDS) {
    const options = catalogue[kind] ?? [];
    for (const [id, row] of newest.get(kind) ?? []) {
      const odometerKm = row.odometer_km;
      const gap =
        latest === null || odometerKm === null ? null : latest.km - odometerKm;
      lines.push({
        kind,
        id,
        title: options.find((option) => option.id === id)?.title ?? null,
        lastDoneOn: row.occurred_on,
        lastRecordId: row.id,
        odometerKm,
        sinceKm: gap === null || gap < 0 ? null : gap,
      });
    }
  }

  lines.sort(
    (left, right) =>
      left.lastDoneOn.localeCompare(right.lastDoneOn) ||
      REFERENCE_KINDS.indexOf(left.kind) -
        REFERENCE_KINDS.indexOf(right.kind) ||
      left.id.localeCompare(right.id)
  );
  return lines;
}

/* -------------------------------------------------------------------------
 * The planned queue (001 GAR-03)
 * ---------------------------------------------------------------------- */

/**
 * The two groups, and there is no third.
 *
 * `overdue` is a plan whose date is already behind the reader; `upcoming` is
 * every other plan. The boundary is today, which is the only line in a
 * calendar that nobody has to choose. A "soon" group would need a horizon —
 * thirty days? ninety? — and that horizon would be this module inventing a
 * judgement about somebody else's truck.
 *
 * `overdue` does **not** mean the site thinks the work is late against a
 * service interval. It means the owner wrote a date and that date has passed.
 */
export const PLANNED_GROUPS = ["overdue", "upcoming"] as const;

export type PlannedGroup = (typeof PLANNED_GROUPS)[number];

export interface PlannedItem {
  readonly row: RecordRow;
  readonly group: PlannedGroup;
}

/**
 * The planned-work queue: plans in priority order, each tagged with its group.
 *
 * Priority is the date, for the reason the module note gives — and within the
 * queue it runs **soonest first across both groups**, so the most overdue item
 * is at the head and the furthest-off plan is at the tail. That is one
 * continuous ordering rather than two sorted lists glued together, which
 * matters because the page draws the groups as two rails: a reader who reads
 * them in order reads the queue in order.
 *
 * `today` is passed in rather than read from the clock, so the boundary is
 * observable in a grader and so the page can use the reader's own local day
 * (the same `todayLocal()` the record form's date field defaults to) rather
 * than UTC's, which is tomorrow for a Costa Rican owner writing in the
 * evening.
 *
 * `null` in, `null` out: see the module note.
 */
export function plannedQueue(
  rows: readonly RecordRow[] | null,
  today: string
): PlannedItem[] | null {
  if (rows === null) return null;
  return rows
    .filter(isPlanned)
    .sort(
      (left, right) =>
        left.occurred_on.localeCompare(right.occurred_on) ||
        left.id.localeCompare(right.id)
    )
    .map((row) => ({
      row,
      group: row.occurred_on < today ? "overdue" : "upcoming",
    }));
}

/** Just the queue's items in one group, in the queue's own order. */
export function plannedGroup(
  items: readonly PlannedItem[],
  group: PlannedGroup
): RecordRow[] {
  return items.filter((item) => item.group === group).map((item) => item.row);
}

/**
 * One currency's total, and how many items are behind it.
 *
 * The count lives here rather than only on the estimate as a whole because a
 * queue can carry two currencies, and one coverage figure spread over both
 * cost lines describes neither (T2-303 review, F1, one level down). "₡42 750,
 * from 4 of 7" is wrong when three of those four were colones and the fourth
 * was dollars — so each line carries its own.
 */
export interface CurrencyTotal {
  readonly amount: number;
  /** How many planned items contributed to {@link amount}. */
  readonly items: number;
}

/**
 * What the owner estimated the queue will take and cost.
 *
 * The two figures a plan's draft fields carry (`time_minutes`, `cost_amount` +
 * `cost_currency`), totalled — with the coverage attached, because a total is
 * a lie without it. "Six hours" over a queue of seven where two carry an
 * estimate is not six hours of work; it is six hours of the two somebody
 * bothered to estimate.
 *
 * The coverage is **per figure and never shared**. Every total in this object
 * sits next to its own count: {@link itemsWithTime} for the duration, and
 * {@link CurrencyTotal.items} for each currency's amount. The first version
 * exposed one number for all of them and the page rendered a single sentence
 * under every row — 7 plans with 2 time-only and 4 cost-only read as "2 h,
 * $400, from 4 of 7", which is true of neither figure (T2-303 review, F1).
 * There is deliberately no "items with an estimate of any kind" field here,
 * because that is the number that produced the wrong sentence.
 */
export interface PlannedEstimate {
  /** Every item in the queue, estimated or not. */
  readonly totalItems: number;
  /** Whole minutes, or `null` when no item carries a time. */
  readonly minutes: number | null;
  readonly itemsWithTime: number;
  /**
   * Amounts totalled **per currency**, keyed by ISO 4217 code.
   *
   * A map and not a number, and this is the whole reason the type is shaped
   * this way. A currency is not a display unit (`./record.ts` sets it out at
   * length): ₡38 500 and $120 are different money, and converting between them
   * needs a rate that is only true on one day. Summing them into one figure
   * would be the single most expensive wrong answer this page could give, so
   * the type makes it unavailable — there is no field here to put it in.
   *
   * Each entry carries its **own** item count, so one currency's coverage is
   * never borrowed to describe another's (see {@link CurrencyTotal}).
   *
   * Empty when nothing in the queue carries a cost.
   */
  readonly byCurrency: ReadonlyMap<string, CurrencyTotal>;
}

export function plannedEstimate(
  items: readonly PlannedItem[]
): PlannedEstimate {
  let minutes = 0;
  let itemsWithTime = 0;
  /*
   * Totalled in cents and divided once at the end. `0.1 + 0.2` is not `0.3` in
   * binary floating point, and a queue of a dozen colón amounts summed as
   * decimals lands a fraction of a céntimo off — which `formatCost` then
   * rounds into a total that does not equal the sum of the parts a reader can
   * see on the cards. Integers make the arithmetic exact.
   *
   * The count rides along in the same map so a currency's total and its
   * coverage are incremented in one place and cannot come apart.
   */
  const cents = new Map<string, { total: number; items: number }>();

  for (const { row } of items) {
    if (row.time_minutes !== null) {
      minutes += row.time_minutes;
      itemsWithTime += 1;
    }
    if (row.cost_amount !== null && row.cost_currency !== null) {
      const held = cents.get(row.cost_currency) ?? { total: 0, items: 0 };
      cents.set(row.cost_currency, {
        total: held.total + Math.round(row.cost_amount * 100),
        items: held.items + 1,
      });
    }
  }

  const byCurrency = new Map<string, CurrencyTotal>();
  for (const [currency, held] of cents) {
    byCurrency.set(currency, { amount: held.total / 100, items: held.items });
  }

  return {
    totalItems: items.length,
    minutes: itemsWithTime === 0 ? null : minutes,
    itemsWithTime,
    byCurrency,
  };
}

/* -------------------------------------------------------------------------
 * The sheet
 * ---------------------------------------------------------------------- */

/** How many plans are behind their date and how many are ahead of it. */
export interface OpenItems {
  readonly overdue: number;
  readonly upcoming: number;
}

/** Everything the current-state tab renders, from one array of records. */
export interface CurrentState {
  /** `null` when no record carries an odometer reading. */
  readonly odometer: OdometerReading | null;
  readonly services: readonly ServiceLine[];
  readonly open: OpenItems;
  /**
   * How many records the sheet was worked out from.
   *
   * `0` is the honest empty garage — nothing recorded yet — and is a different
   * statement from the `null` this whole object becomes when the records could
   * not be loaded. The page has different words for the two.
   */
  readonly recordsConsidered: number;
}

/**
 * The current-state sheet (GAR-03′ / 001 GAR-02).
 *
 * `null` when `rows` is `null`, which is the page's "the records did not
 * arrive". Every other case is a real sheet, including the empty one.
 */
export function currentState(
  rows: readonly RecordRow[] | null,
  catalogue: ReferenceCatalogue,
  today: string
): CurrentState | null {
  if (rows === null) return null;
  const odometer = latestOdometer(rows);
  const queue = plannedQueue(rows, today) ?? [];
  return {
    odometer,
    services: serviceLines(rows, catalogue, odometer),
    open: {
      overdue: queue.filter((item) => item.group === "overdue").length,
      upcoming: queue.filter((item) => item.group === "upcoming").length,
    },
    recordsConsidered: rows.length,
  };
}

/** `true` when the sheet has nothing to say because nothing is recorded. */
export function currentStateIsEmpty(sheet: CurrentState): boolean {
  return sheet.recordsConsidered === 0;
}
