/**
 * Graders for the two derived views (GAR-03′).
 *
 * Fixtures are chosen so that a wrong implementation fails rather than
 * coincidentally agrees — the T2-302 lesson, where every time fixture was 72
 * minutes, one of the few values a lossy display round trip survives, and a
 * live defect stayed green for a whole task. Concretely:
 *
 * - The **latest** odometer reading is never also the **highest** one, so
 *   `Math.max` over the column fails.
 * - The reading on the newest record is never the reading on the newest
 *   *plan*, so forgetting to exclude plans fails.
 * - Money totals use amounts whose decimal sum is not representable in binary
 *   floating point, so summing as decimals fails.
 * - Two currencies always appear together, so a single-number total fails.
 * - Distances are never zero when the answer is "unknown", so `?? 0` fails.
 */
import { describe, expect, it } from "vitest";
import {
  PLANNED_GROUPS,
  currentState,
  currentStateIsEmpty,
  latestOdometer,
  plannedEstimate,
  plannedGroup,
  plannedQueue,
  serviceLines,
  type PlannedItem,
} from "./derived.ts";
import type { RecordRow, ReferenceCatalogue } from "./record.ts";

const CATALOGUE: ReferenceCatalogue = {
  problem: [{ id: "gen3-front-end-clunk", title: "Front-end clunk" }],
  part: [{ id: "gen3-engine-oil-5w30", title: "Engine oil 5W-30" }],
  procedure: [
    { id: "gen3-engine-oil-change", title: "Engine oil and filter change" },
    { id: "gen3-brake-fluid-flush", title: "Brake fluid flush" },
  ],
};

let serial = 0;

function row(over: Partial<RecordRow> = {}): RecordRow {
  serial += 1;
  return {
    id: `r${serial}`,
    vehicle_id: "v1",
    occurred_on: "2026-01-15",
    kind: "work",
    title: "A job",
    body: null,
    cost_amount: null,
    cost_currency: null,
    time_minutes: null,
    odometer_km: null,
    problem_ids: [],
    part_ids: [],
    procedure_ids: [],
    is_public: false,
    is_cost_public: false,
    ...over,
  };
}

const TODAY = "2026-06-15";

describe("latestOdometer — the mileage line of the sheet", () => {
  it("is unknown, not zero, when no record carries a reading", () => {
    expect(latestOdometer([])).toBeNull();
    expect(latestOdometer([row(), row({ kind: "note" })])).toBeNull();
  });

  it("takes the newest reading and not the highest one", () => {
    // The 2024 record reads *higher* than the 2026 one. A `Math.max`
    // implementation returns 268 400 and is wrong: the owner transposed a
    // digit two years ago and has since written the truck's real mileage.
    const sheet = latestOdometer([
      row({ occurred_on: "2024-03-02", odometer_km: 268_400 }),
      row({ occurred_on: "2026-04-11", odometer_km: 251_930 }),
      row({ occurred_on: "2025-09-08", odometer_km: 244_106 }),
    ]);
    expect(sheet?.km).toBe(251_930);
    expect(sheet?.occurredOn).toBe("2026-04-11");
  });

  it("says so when an earlier record reads higher", () => {
    const sheet = latestOdometer([
      row({ occurred_on: "2024-03-02", odometer_km: 268_400 }),
      row({ occurred_on: "2026-04-11", odometer_km: 251_930 }),
    ]);
    expect(sheet?.contradicted).toBe(true);
  });

  it("does not call an ordinary rising history a contradiction", () => {
    const sheet = latestOdometer([
      row({ occurred_on: "2024-03-02", odometer_km: 218_400 }),
      row({ occurred_on: "2026-04-11", odometer_km: 251_930 }),
    ]);
    expect(sheet?.contradicted).toBe(false);
  });

  it("does not flag two readings on the same day", () => {
    // Their order is the id tie-break, which is arbitrary; a data-error notice
    // fired by an arbitrary order would fire on an ordinary two-job Saturday.
    const sheet = latestOdometer([
      row({ id: "a", occurred_on: "2026-04-11", odometer_km: 251_930 }),
      row({ id: "b", occurred_on: "2026-04-11", odometer_km: 251_928 }),
    ]);
    expect(sheet?.contradicted).toBe(false);
  });

  it("ignores a plan's odometer, however recent the plan is", () => {
    // A plan dated ahead carrying "do this at 260 000" is a target, not a
    // reading. Counting it moves the truck 8 070 km it has not travelled.
    const sheet = latestOdometer([
      row({ occurred_on: "2026-04-11", odometer_km: 251_930 }),
      row({ occurred_on: "2026-12-01", kind: "plan", odometer_km: 260_000 }),
    ]);
    expect(sheet?.km).toBe(251_930);
    expect(sheet?.occurredOn).toBe("2026-04-11");
  });

  it("breaks a same-day tie the way the timeline does", () => {
    const sheet = latestOdometer([
      row({ id: "r-aaa", occurred_on: "2026-04-11", odometer_km: 251_930 }),
      row({ id: "r-zzz", occurred_on: "2026-04-11", odometer_km: 251_931 }),
    ]);
    expect(sheet?.recordId).toBe("r-zzz");
  });

  it("names the record it came from", () => {
    const sheet = latestOdometer([
      row({ id: "r-the-one", occurred_on: "2026-04-11", odometer_km: 9 }),
    ]);
    expect(sheet?.recordId).toBe("r-the-one");
  });
});

describe("serviceLines — the service history of the sheet", () => {
  const latest = {
    km: 251_930,
    occurredOn: "2026-04-11",
    recordId: "x",
    contradicted: false,
  };

  it("is empty when nothing has been linked", () => {
    expect(serviceLines([row(), row()], CATALOGUE, latest)).toEqual([]);
  });

  it("keeps the most recent record naming each id", () => {
    const lines = serviceLines(
      [
        row({
          occurred_on: "2025-02-04",
          odometer_km: 231_500,
          procedure_ids: ["gen3-engine-oil-change"],
        }),
        row({
          occurred_on: "2026-03-30",
          odometer_km: 250_100,
          procedure_ids: ["gen3-engine-oil-change"],
        }),
      ],
      CATALOGUE,
      latest
    );
    expect(lines).toHaveLength(1);
    expect(lines[0]?.lastDoneOn).toBe("2026-03-30");
    expect(lines[0]?.odometerKm).toBe(250_100);
    // 251 930 − 250 100. A `?? 0` or a max-based odometer both miss it.
    expect(lines[0]?.sinceKm).toBe(1_830);
  });

  it("never counts a plan as work done", () => {
    // The single most consequential exclusion here: a planned oil change that
    // told an owner their oil was changed is a sheet actively lying.
    const lines = serviceLines(
      [
        row({
          occurred_on: "2025-02-04",
          odometer_km: 231_500,
          procedure_ids: ["gen3-engine-oil-change"],
        }),
        row({
          kind: "plan",
          occurred_on: "2026-08-01",
          odometer_km: 255_000,
          procedure_ids: ["gen3-engine-oil-change"],
        }),
      ],
      CATALOGUE,
      latest
    );
    expect(lines).toHaveLength(1);
    expect(lines[0]?.lastDoneOn).toBe("2025-02-04");
    expect(lines[0]?.odometerKm).toBe(231_500);
  });

  it("reports an unknown distance as unknown and not as zero", () => {
    const noReading = serviceLines(
      [row({ occurred_on: "2025-02-04", part_ids: ["gen3-engine-oil-5w30"] })],
      CATALOGUE,
      latest
    );
    expect(noReading[0]?.odometerKm).toBeNull();
    expect(noReading[0]?.sinceKm).toBeNull();

    const noLatest = serviceLines(
      [
        row({
          occurred_on: "2025-02-04",
          odometer_km: 231_500,
          part_ids: ["gen3-engine-oil-5w30"],
        }),
      ],
      CATALOGUE,
      null
    );
    expect(noLatest[0]?.sinceKm).toBeNull();
  });

  it("refuses a negative distance rather than rendering one", () => {
    const lines = serviceLines(
      [
        row({
          occurred_on: "2026-04-11",
          odometer_km: 268_400,
          part_ids: ["gen3-engine-oil-5w30"],
        }),
      ],
      CATALOGUE,
      { ...latest, contradicted: true }
    );
    expect(lines[0]?.sinceKm).toBeNull();
  });

  it("reports a genuine zero as zero", () => {
    // Serviced at the reading that is still the latest one. Real, not unknown.
    const lines = serviceLines(
      [
        row({
          occurred_on: "2026-04-11",
          odometer_km: 251_930,
          part_ids: ["gen3-engine-oil-5w30"],
        }),
      ],
      CATALOGUE,
      latest
    );
    expect(lines[0]?.sinceKm).toBe(0);
  });

  it("resolves titles per kind and keeps an unresolvable id", () => {
    const lines = serviceLines(
      [
        row({
          occurred_on: "2026-03-30",
          part_ids: ["gen3-engine-oil-5w30"],
          procedure_ids: ["gen3-retired-entry"],
        }),
      ],
      CATALOGUE,
      latest
    );
    const byId = new Map(lines.map((line) => [line.id, line]));
    expect(byId.get("gen3-engine-oil-5w30")?.title).toBe("Engine oil 5W-30");
    expect(byId.get("gen3-engine-oil-5w30")?.kind).toBe("part");
    // Kept, titled `null`, so the page renders the id — a retired reference
    // entry must not silently delete part of somebody's service history.
    expect(byId.has("gen3-retired-entry")).toBe(true);
    expect(byId.get("gen3-retired-entry")?.title).toBeNull();
  });

  it("does not confuse the same id in two different columns", () => {
    const lines = serviceLines(
      [
        row({
          occurred_on: "2026-03-30",
          part_ids: ["shared-id"],
          procedure_ids: ["shared-id"],
        }),
      ],
      CATALOGUE,
      latest
    );
    expect(lines.map((line) => line.kind).sort()).toEqual([
      "part",
      "procedure",
    ]);
  });

  it("orders the longest-untouched line first", () => {
    const lines = serviceLines(
      [
        row({
          occurred_on: "2026-03-30",
          procedure_ids: ["gen3-engine-oil-change"],
        }),
        row({
          occurred_on: "2023-11-02",
          procedure_ids: ["gen3-brake-fluid-flush"],
        }),
        row({
          occurred_on: "2025-06-19",
          problem_ids: ["gen3-front-end-clunk"],
        }),
      ],
      CATALOGUE,
      latest
    );
    expect(lines.map((line) => line.id)).toEqual([
      "gen3-brake-fluid-flush",
      "gen3-front-end-clunk",
      "gen3-engine-oil-change",
    ]);
  });

  it("does not mutate the records it was handed", () => {
    const rows = [
      row({ occurred_on: "2026-03-30", part_ids: ["gen3-engine-oil-5w30"] }),
      row({ occurred_on: "2023-11-02", part_ids: ["gen3-engine-oil-5w30"] }),
    ];
    const order = rows.map((entry) => entry.id);
    serviceLines(rows, CATALOGUE, latest);
    expect(rows.map((entry) => entry.id)).toEqual(order);
  });
});

describe("plannedQueue — 001 GAR-03's queue, ordered by priority", () => {
  it("is unknown when the records could not be loaded", () => {
    // Not `[]`. An empty queue says "nothing is planned", which is a statement
    // about the truck, and a failed request has no business making one.
    expect(plannedQueue(null, TODAY)).toBeNull();
  });

  it("is empty — not null — when the vehicle genuinely has no plans", () => {
    expect(plannedQueue([row(), row({ kind: "note" })], TODAY)).toEqual([]);
  });

  it("holds only plans", () => {
    const queue = plannedQueue(
      [
        row({ kind: "work", occurred_on: "2026-07-01" }),
        row({ kind: "plan", occurred_on: "2026-07-02" }),
        row({ kind: "receipt", occurred_on: "2026-07-03" }),
        row({ kind: "note", occurred_on: "2026-07-04" }),
      ],
      TODAY
    );
    expect(queue?.map((item) => item.row.kind)).toEqual(["plan"]);
  });

  it("runs soonest first across both groups", () => {
    const queue = plannedQueue(
      [
        row({ id: "far", kind: "plan", occurred_on: "2027-01-20" }),
        row({ id: "late", kind: "plan", occurred_on: "2026-02-28" }),
        row({ id: "soon", kind: "plan", occurred_on: "2026-06-30" }),
        row({ id: "later-still", kind: "plan", occurred_on: "2026-05-01" }),
      ],
      TODAY
    );
    expect(queue?.map((item) => item.row.id)).toEqual([
      "late",
      "later-still",
      "soon",
      "far",
    ]);
    expect(queue?.map((item) => item.group)).toEqual([
      "overdue",
      "overdue",
      "upcoming",
      "upcoming",
    ]);
  });

  it("puts today in `upcoming`, not `overdue`", () => {
    // The boundary itself. A plan for this morning is not late.
    const queue = plannedQueue(
      [row({ kind: "plan", occurred_on: TODAY })],
      TODAY
    );
    expect(queue?.[0]?.group).toBe("upcoming");
  });

  it("puts yesterday in `overdue`", () => {
    const queue = plannedQueue(
      [row({ kind: "plan", occurred_on: "2026-06-14" })],
      TODAY
    );
    expect(queue?.[0]?.group).toBe("overdue");
  });

  it("breaks a same-day tie by id, so renders do not reshuffle", () => {
    const queue = plannedQueue(
      [
        row({ id: "r-zzz", kind: "plan", occurred_on: "2026-07-01" }),
        row({ id: "r-aaa", kind: "plan", occurred_on: "2026-07-01" }),
      ],
      TODAY
    );
    expect(queue?.map((item) => item.row.id)).toEqual(["r-aaa", "r-zzz"]);
  });

  it("does not reorder the array it was handed", () => {
    const rows = [
      row({ id: "b", kind: "plan", occurred_on: "2027-01-20" }),
      row({ id: "a", kind: "plan", occurred_on: "2026-02-28" }),
    ];
    plannedQueue(rows, TODAY);
    expect(rows.map((entry) => entry.id)).toEqual(["b", "a"]);
  });

  it("has exactly two groups", () => {
    expect([...PLANNED_GROUPS]).toEqual(["overdue", "upcoming"]);
  });
});

describe("plannedGroup", () => {
  it("keeps the queue's order inside each rail", () => {
    const queue =
      plannedQueue(
        [
          row({ id: "p3", kind: "plan", occurred_on: "2026-09-01" }),
          row({ id: "p1", kind: "plan", occurred_on: "2026-03-01" }),
          row({ id: "p2", kind: "plan", occurred_on: "2026-07-01" }),
        ],
        TODAY
      ) ?? [];
    expect(plannedGroup(queue, "overdue").map((entry) => entry.id)).toEqual([
      "p1",
    ]);
    expect(plannedGroup(queue, "upcoming").map((entry) => entry.id)).toEqual([
      "p2",
      "p3",
    ]);
  });
});

describe("plannedEstimate — the draft figures on the queue", () => {
  function queue(...rows: RecordRow[]): PlannedItem[] {
    return plannedQueue(rows, TODAY) ?? [];
  }

  it("says nothing rather than zero when nothing is estimated", () => {
    const estimate = plannedEstimate(
      queue(
        row({ kind: "plan", occurred_on: "2026-07-01" }),
        row({ kind: "plan", occurred_on: "2026-08-01" })
      )
    );
    // `0` would read as "this queue is free and instant".
    expect(estimate.minutes).toBeNull();
    expect(estimate.byCurrency.size).toBe(0);
    expect(estimate.totalItems).toBe(2);
    expect(estimate.itemsWithTime).toBe(0);
  });

  it("gives the time and each currency their own coverage", () => {
    // The F1 case exactly: 7 plans, 2 carrying only a time, 4 carrying only a
    // cost. One shared coverage number reads as "2 h, $400, from 4 of 7",
    // which is true of neither figure. Each total must carry its own.
    const estimate = plannedEstimate(
      queue(
        row({ kind: "plan", occurred_on: "2026-07-01", time_minutes: 45 }),
        row({ kind: "plan", occurred_on: "2026-07-02", time_minutes: 75 }),
        row({
          kind: "plan",
          occurred_on: "2026-07-03",
          cost_amount: 100,
          cost_currency: "USD",
        }),
        row({
          kind: "plan",
          occurred_on: "2026-07-04",
          cost_amount: 100,
          cost_currency: "USD",
        }),
        row({
          kind: "plan",
          occurred_on: "2026-07-05",
          cost_amount: 100,
          cost_currency: "USD",
        }),
        row({
          kind: "plan",
          occurred_on: "2026-07-06",
          cost_amount: 100,
          cost_currency: "USD",
        }),
        row({ kind: "plan", occurred_on: "2026-07-07" })
      )
    );
    expect(estimate.totalItems).toBe(7);
    expect(estimate.minutes).toBe(120);
    // Two behind the duration, four behind the money. Different numbers, so a
    // single shared figure cannot describe both.
    expect(estimate.itemsWithTime).toBe(2);
    expect(estimate.byCurrency.get("USD")).toEqual({ amount: 400, items: 4 });
  });

  it("does not lend one currency's coverage to another", () => {
    // Three colón items and one dollar item. "From 4 of 5" under the dollar
    // line would be the same defect one level down.
    const estimate = plannedEstimate(
      queue(
        row({
          kind: "plan",
          occurred_on: "2026-07-01",
          cost_amount: 10_000,
          cost_currency: "CRC",
        }),
        row({
          kind: "plan",
          occurred_on: "2026-07-02",
          cost_amount: 20_000,
          cost_currency: "CRC",
        }),
        row({
          kind: "plan",
          occurred_on: "2026-07-03",
          cost_amount: 12_750,
          cost_currency: "CRC",
        }),
        row({
          kind: "plan",
          occurred_on: "2026-07-04",
          cost_amount: 120,
          cost_currency: "USD",
        }),
        row({ kind: "plan", occurred_on: "2026-07-05" })
      )
    );
    expect(estimate.byCurrency.get("CRC")).toEqual({
      amount: 42_750,
      items: 3,
    });
    expect(estimate.byCurrency.get("USD")).toEqual({ amount: 120, items: 1 });
    expect(estimate.totalItems).toBe(5);
  });

  it("totals minutes and reports how many items are behind the figure", () => {
    // 45 + 100 + 359 = 504. None of the three survives an hours round trip,
    // and the sum is not a whole number of hours either.
    const estimate = plannedEstimate(
      queue(
        row({ kind: "plan", occurred_on: "2026-07-01", time_minutes: 45 }),
        row({ kind: "plan", occurred_on: "2026-07-02", time_minutes: 100 }),
        row({ kind: "plan", occurred_on: "2026-07-03", time_minutes: 359 }),
        row({ kind: "plan", occurred_on: "2026-07-04" })
      )
    );
    expect(estimate.minutes).toBe(504);
    expect(estimate.itemsWithTime).toBe(3);
    expect(estimate.totalItems).toBe(4);
  });

  it("never sums two currencies into one figure", () => {
    const estimate = plannedEstimate(
      queue(
        row({
          kind: "plan",
          occurred_on: "2026-07-01",
          cost_amount: 38_500,
          cost_currency: "CRC",
        }),
        row({
          kind: "plan",
          occurred_on: "2026-07-02",
          cost_amount: 120,
          cost_currency: "USD",
        }),
        row({
          kind: "plan",
          occurred_on: "2026-07-03",
          cost_amount: 4_250,
          cost_currency: "CRC",
        })
      )
    );
    expect(estimate.byCurrency.get("CRC")).toEqual({
      amount: 42_750,
      items: 2,
    });
    expect(estimate.byCurrency.get("USD")).toEqual({ amount: 120, items: 1 });
  });

  it("totals money exactly, not in binary floating point", () => {
    // 0.1 + 0.2 !== 0.3 as doubles; 38 500.55 + 120.45 !== 38 621 either.
    // Summing decimals leaves a total that does not equal the visible parts.
    const pennies = plannedEstimate(
      queue(
        row({
          kind: "plan",
          occurred_on: "2026-07-01",
          cost_amount: 0.1,
          cost_currency: "USD",
        }),
        row({
          kind: "plan",
          occurred_on: "2026-07-02",
          cost_amount: 0.2,
          cost_currency: "USD",
        })
      )
    );
    expect(pennies.byCurrency.get("USD")?.amount).toBe(0.3);

    const bigger = plannedEstimate(
      queue(
        row({
          kind: "plan",
          occurred_on: "2026-07-01",
          cost_amount: 38_500.55,
          cost_currency: "CRC",
        }),
        row({
          kind: "plan",
          occurred_on: "2026-07-02",
          cost_amount: 120.45,
          cost_currency: "CRC",
        })
      )
    );
    expect(bigger.byCurrency.get("CRC")?.amount).toBe(38_621);
  });

  it("ignores an amount whose currency is missing", () => {
    // The schema's pair constraint makes this impossible to store, so it can
    // only arrive from somewhere that bypassed it — and a bare number with no
    // currency is not money anybody can total.
    const estimate = plannedEstimate(
      queue(
        row({
          kind: "plan",
          occurred_on: "2026-07-01",
          cost_amount: 999,
          cost_currency: null,
        })
      )
    );
    expect(estimate.byCurrency.size).toBe(0);
  });
});

describe("currentState — the whole sheet", () => {
  it("is unknown when the records could not be loaded", () => {
    expect(currentState(null, CATALOGUE, TODAY)).toBeNull();
  });

  it("is an empty sheet — not unknown — for a garage with no records", () => {
    const sheet = currentState([], CATALOGUE, TODAY);
    expect(sheet).not.toBeNull();
    expect(sheet && currentStateIsEmpty(sheet)).toBe(true);
    expect(sheet?.odometer).toBeNull();
    expect(sheet?.services).toEqual([]);
    expect(sheet?.open).toEqual({ overdue: 0, upcoming: 0 });
  });

  it("assembles the mileage, the history and the open items together", () => {
    const sheet = currentState(
      [
        row({
          occurred_on: "2026-04-11",
          odometer_km: 251_930,
          procedure_ids: ["gen3-engine-oil-change"],
        }),
        row({
          occurred_on: "2023-11-02",
          odometer_km: 198_640,
          procedure_ids: ["gen3-brake-fluid-flush"],
        }),
        row({ kind: "plan", occurred_on: "2026-02-28" }),
        row({ kind: "plan", occurred_on: "2026-09-30" }),
        row({ kind: "plan", occurred_on: "2026-11-30" }),
      ],
      CATALOGUE,
      TODAY
    );
    expect(sheet?.odometer?.km).toBe(251_930);
    expect(sheet?.services.map((line) => line.id)).toEqual([
      "gen3-brake-fluid-flush",
      "gen3-engine-oil-change",
    ]);
    // 251 930 − 198 640, three years of driving, not a rounding artefact.
    expect(sheet?.services[0]?.sinceKm).toBe(53_290);
    expect(sheet?.services[1]?.sinceKm).toBe(0);
    expect(sheet?.open).toEqual({ overdue: 1, upcoming: 2 });
    expect(sheet?.recordsConsidered).toBe(5);
  });

  it("counts every record, not only the ones it could use", () => {
    const sheet = currentState(
      [row(), row({ kind: "note" })],
      CATALOGUE,
      TODAY
    );
    expect(sheet?.recordsConsidered).toBe(2);
    expect(sheet && currentStateIsEmpty(sheet)).toBe(false);
  });
});
