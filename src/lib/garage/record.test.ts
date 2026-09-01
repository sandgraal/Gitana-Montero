import { describe, expect, it } from "vitest";
import {
  EMPTY_CATALOGUE,
  MAX_COST_AMOUNT,
  MAX_RECORD_TITLE_LENGTH,
  MAX_TIME_MINUTES,
  RECORD_CURRENCIES,
  RECORD_KINDS,
  convertTimeField,
  defaultCurrency,
  emptyRecordDraft,
  formatCost,
  formatDuration,
  formatRecordDate,
  isCalendarDate,
  isPlanned,
  isRecordKind,
  parseCost,
  parseTime,
  plannedRecords,
  readCurrency,
  recordCounts,
  recordDraftFromRow,
  recordHeadline,
  recordWriteFromDraft,
  resolveReferences,
  timeInUnit,
  timelineOrder,
  unknownReferenceIds,
  validateRecordDraft,
  writeCurrency,
  type RecordDraft,
  type RecordRow,
  type ReferenceCatalogue,
} from "./record.ts";

const CATALOGUE: ReferenceCatalogue = {
  problem: [{ id: "gen3-front-sway-bar-links", title: "Sway-bar end links" }],
  part: [{ id: "gen3-sway-bar-link", title: "Sway-bar link" }],
  procedure: [{ id: "gen3-sway-bar-link-swap", title: "Link replacement" }],
};

function row(over: Partial<RecordRow> = {}): RecordRow {
  return {
    id: "r1",
    vehicle_id: "v1",
    occurred_on: "2026-07-19",
    kind: "work",
    title: "Front sway-bar end links replaced",
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

function draft(over: Partial<RecordDraft> = {}): RecordDraft {
  return {
    ...emptyRecordDraft({
      today: "2026-07-19",
      currency: "CRC",
      odometerUnit: "km",
    }),
    title: "Oil and filter change",
    ...over,
  };
}

describe("the kind enum", () => {
  it("is the contract's four values and no fifth", () => {
    // `public.record_kind` is closed because GAR-02′ names four values.
    expect([...RECORD_KINDS]).toEqual(["work", "receipt", "note", "plan"]);
    expect(isRecordKind("plan")).toBe(true);
    expect(isRecordKind("planned")).toBe(false);
    expect(isRecordKind(null)).toBe(false);
  });

  it("is what says a record has not happened yet", () => {
    expect(isPlanned(row({ kind: "plan" }))).toBe(true);
    expect(isPlanned(row({ kind: "work" }))).toBe(false);
  });
});

describe("parseCost", () => {
  it("reads a plain figure", () => {
    expect(parseCost("38")).toEqual({ amount: 38, issue: null });
    expect(parseCost("38500")).toEqual({ amount: 38500, issue: null });
  });

  it("treats an empty field as no cost, not as free", () => {
    // `cost_amount numeric not null default 0` would be a claim that the job
    // was free; the column is nullable and so is this.
    expect(parseCost("")).toEqual({ amount: null, issue: null });
    expect(parseCost("   ")).toEqual({ amount: null, issue: null });
  });

  it("reads either locale's decimal mark when it is unambiguous", () => {
    expect(parseCost("38.50").amount).toBe(38.5);
    expect(parseCost("38,50").amount).toBe(38.5);
    expect(parseCost("1.234,56").amount).toBe(1234.56);
    expect(parseCost("1,234.56").amount).toBe(1234.56);
  });

  it("treats spaces and apostrophes as grouping, never as decimals", () => {
    expect(parseCost("38 500").amount).toBe(38500);
    expect(parseCost("1 234 567,89").amount).toBe(1234567.89);
    expect(parseCost("1'234.56").amount).toBe(1234.56);
  });

  it("refuses the one case that means two different things", () => {
    // `1.500` is fifteen hundred to a Costa Rican reader and one and a half
    // to an English one. Guessing moves somebody's money by a factor of a
    // thousand, so the page asks instead.
    expect(parseCost("1.500")).toEqual({
      amount: null,
      issue: "ambiguous-separator",
    });
    expect(parseCost("1,500")).toEqual({
      amount: null,
      issue: "ambiguous-separator",
    });
  });

  it("accepts the same figure once a second separator agrees", () => {
    expect(parseCost("1.234.567").amount).toBe(1234567);
    expect(parseCost("1,234,567").amount).toBe(1234567);
  });

  it("refuses a string that mixes both conventions and ends in three", () => {
    expect(parseCost("1,500.000").issue).toBe("ambiguous-separator");
  });

  it("refuses text, malformed groups and stray marks", () => {
    expect(parseCost("thirty").issue).toBe("not-a-number");
    expect(parseCost("38,5000").issue).toBe("not-a-number");
    expect(parseCost("1,2345.00").issue).toBe("not-a-number");
    expect(parseCost("₡38").issue).toBe("not-a-number");
  });

  it("names a negative as a negative rather than as gibberish", () => {
    expect(parseCost("-5").issue).toBe("negative");
  });

  it("caps a pasted phone number", () => {
    expect(parseCost(String(MAX_COST_AMOUNT)).amount).toBe(MAX_COST_AMOUNT);
    expect(parseCost(String(MAX_COST_AMOUNT + 1)).issue).toBe("too-large");
  });

  it("never stores more than the two decimals a currency subdivides into", () => {
    expect(parseCost("38.56").amount).toBe(38.56);
    // Three digits after the mark is the grouping reading as much as the
    // decimal one, so it is refused as ambiguous rather than rounded.
    expect(parseCost("38.567").issue).toBe("ambiguous-separator");
    expect(parseCost("38.5678").issue).toBe("not-a-number");
  });
});

describe("formatCost", () => {
  it("renders one stored pair in the reader's locale", () => {
    expect(formatCost(38500, "CRC", "es")).toContain("38.500");
    expect(formatCost(38500, "USD", "en")).toContain("38,500");
  });

  it("does not put centavos on a whole colón amount", () => {
    expect(formatCost(38, "CRC", "es")).not.toContain("38,00");
    expect(formatCost(38.5, "USD", "en")).toContain("38.50");
  });

  it("never converts: the currency is the stored one", () => {
    // The amount is identical; only the code and the locale differ, so a
    // difference in the digits would mean a rate got applied somewhere.
    expect(formatCost(100, "CRC", "en")).toContain("100");
    expect(formatCost(100, "USD", "en")).toContain("100");
  });
});

describe("the currency preference", () => {
  it("starts from the locale and is only ever a form default", () => {
    expect(defaultCurrency("es")).toBe("CRC");
    expect(defaultCurrency("en")).toBe("USD");
    expect(defaultCurrency("es-CR")).toBe("CRC");
    expect(RECORD_CURRENCIES).toContain(defaultCurrency("qq"));
  });

  it("prefers what the reader last used", () => {
    const store = new Map<string, string>();
    const win = {
      localStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => void store.set(key, value),
      },
    } as unknown as Window;

    expect(readCurrency(win, "en")).toBe("USD");
    writeCurrency("CRC", win);
    expect(readCurrency(win, "en")).toBe("CRC");
  });

  it("falls back to the locale when storage is blocked", () => {
    const win = {
      get localStorage(): Storage {
        throw new Error("private mode");
      },
    } as unknown as Window;
    expect(readCurrency(win, "es")).toBe("CRC");
    expect(() => writeCurrency("USD", win)).not.toThrow();
  });
});

describe("parseTime", () => {
  it("stores whole minutes whichever unit was typed", () => {
    expect(parseTime("1.2", "h").minutes).toBe(72);
    expect(parseTime("1,2", "h").minutes).toBe(72);
    expect(parseTime("45", "min").minutes).toBe(45);
  });

  it("treats an empty field as no time recorded", () => {
    expect(parseTime("", "h")).toEqual({ minutes: null, issue: null });
  });

  it("refuses text, negatives and a mistyped magnitude", () => {
    expect(parseTime("a while", "h").issue).toBe("not-a-number");
    expect(parseTime("-1", "h").issue).toBe("negative");
    expect(parseTime(String(MAX_TIME_MINUTES + 1), "min").issue).toBe(
      "too-large"
    );
  });

  it("round-trips a figure through the unit the form is showing", () => {
    expect(timeInUnit(72, "h")).toBe(1.2);
    expect(timeInUnit(45, "min")).toBe(45);
  });
});

describe("convertTimeField", () => {
  it("converts what is in the field rather than reinterpreting it", () => {
    // The F4 case: on a new record, `2` hours must not become two minutes
    // because the unit control moved.
    expect(convertTimeField("2", "h", "min")).toBe("120");
    expect(convertTimeField("120", "min", "h")).toBe("2");
    expect(convertTimeField("1,5", "h", "min")).toBe("90");
  });

  it("leaves the field alone when the unit did not change", () => {
    expect(convertTimeField("2", "h", "h")).toBe("2");
  });

  it("leaves a half-typed or empty figure exactly as typed", () => {
    // Rewriting somebody's keystrokes to `0` mid-entry is the same class of
    // surprise this function exists to remove.
    expect(convertTimeField("", "h", "min")).toBe("");
    expect(convertTimeField("about two", "h", "min")).toBe("about two");
    expect(convertTimeField("-1", "h", "min")).toBe("-1");
  });

  it("keeps a converted stored figure recognisable as untouched", () => {
    // The join with F1: switching units on an unedited record has to leave
    // the field equal to what `recordDraftFromRow` would render in the new
    // unit, or the save path would stop seeing it as untouched and would
    // write the walked value after all.
    const previous = row({ time_minutes: 45 });
    const inMinutes = recordDraftFromRow(previous, {
      odometerUnit: "km",
      timeUnit: "min",
    }).time;
    const switched = convertTimeField(inMinutes, "min", "h");
    expect(switched).toBe(
      recordDraftFromRow(previous, { odometerUnit: "km", timeUnit: "h" }).time
    );
    const write = recordWriteFromDraft(
      "v1",
      {
        ...recordDraftFromRow(previous, {
          odometerUnit: "km",
          timeUnit: "h",
        }),
        title: "Edited only the title",
        time: switched,
      },
      CATALOGUE,
      previous
    );
    expect(write?.time_minutes).toBe(45);
  });
});

describe("formatDuration", () => {
  it("reads in minutes under the hour and in hours above it", () => {
    expect(formatDuration(45, "en")).toContain("45");
    expect(formatDuration(72, "en")).toContain("1.2");
    expect(formatDuration(72, "es")).toContain("1,2");
  });
});

describe("the date", () => {
  it("accepts a real calendar day and refuses one that is not", () => {
    expect(isCalendarDate("2026-07-19")).toBe(true);
    expect(isCalendarDate("2025-02-30")).toBe(false);
    expect(isCalendarDate("2026-7-9")).toBe(false);
    expect(isCalendarDate("19/07/2026")).toBe(false);
  });

  it("renders the stored day, not a moment in a timezone", () => {
    // A `date` column has no zone. Formatting it through a local one would
    // show the eighteenth to every reader west of Greenwich.
    expect(formatRecordDate("2026-07-19", "en")).toContain("19");
    expect(formatRecordDate("2026-07-19", "es")).toContain("19");
  });
});

describe("validateRecordDraft", () => {
  it("passes an ordinary entry", () => {
    expect(validateRecordDraft(draft(), CATALOGUE)).toEqual([]);
  });

  it("reports every problem at once, not one save at a time", () => {
    const issues = validateRecordDraft(
      draft({ title: "", occurredOn: "2025-02-30", cost: "nope" }),
      CATALOGUE
    );
    expect(issues.map((issue) => issue.field).sort()).toEqual([
      "cost",
      "occurredOn",
      "title",
    ]);
  });

  it("asks for a line a timeline card can lead with", () => {
    expect(validateRecordDraft(draft({ title: "   " }))).toContainEqual({
      field: "title",
      code: "required",
    });
    expect(
      validateRecordDraft(
        draft({ title: "x".repeat(MAX_RECORD_TITLE_LENGTH + 1) })
      )
    ).toContainEqual({ field: "title", code: "too-long" });
  });

  it("lets a plan be dated in the future", () => {
    // A booked timing-belt job next March is the ordinary case for `plan`.
    expect(
      validateRecordDraft(draft({ kind: "plan", occurredOn: "2099-03-01" }))
    ).toEqual([]);
  });

  it("lets a record be dated before the owner bought the truck", () => {
    expect(validateRecordDraft(draft({ occurredOn: "1994-05-02" }))).toEqual(
      []
    );
  });

  it("catches a slipped keystroke in the year", () => {
    expect(
      validateRecordDraft(draft({ occurredOn: "2202-03-01" }))
    ).toContainEqual({ field: "occurredOn", code: "out-of-range" });
  });

  it("refuses an amount with no currency to read it in", () => {
    expect(
      validateRecordDraft(draft({ cost: "38500", currency: "" }))
    ).toContainEqual({ field: "currency", code: "unknown" });
  });

  it("refuses a reference the site does not ship", () => {
    expect(
      validateRecordDraft(draft({ partIds: ["invented-part"] }), CATALOGUE)
    ).toContainEqual({ field: "references", code: "unknown" });
  });

  it("accepts references the site does ship", () => {
    expect(
      validateRecordDraft(
        draft({
          problemIds: ["gen3-front-sway-bar-links"],
          partIds: ["gen3-sway-bar-link"],
          procedureIds: ["gen3-sway-bar-link-swap"],
        }),
        CATALOGUE
      )
    ).toEqual([]);
  });
});

describe("unknownReferenceIds", () => {
  it("names every id the catalogue cannot resolve", () => {
    expect(
      unknownReferenceIds(
        { problemIds: ["nope"], partIds: [], procedureIds: ["also-nope"] },
        CATALOGUE
      ).sort()
    ).toEqual(["also-nope", "nope"]);
  });

  it("resolves nothing when the reference side is still empty", () => {
    expect(
      unknownReferenceIds(
        { problemIds: ["anything"], partIds: [], procedureIds: [] },
        EMPTY_CATALOGUE
      )
    ).toEqual(["anything"]);
  });
});

describe("resolveReferences", () => {
  it("gives a card the entry's own title", () => {
    expect(
      resolveReferences(
        {
          problem_ids: ["gen3-front-sway-bar-links"],
          part_ids: [],
          procedure_ids: [],
        },
        CATALOGUE
      )
    ).toEqual([
      {
        kind: "problem",
        id: "gen3-front-sway-bar-links",
        title: "Sway-bar end links",
      },
    ]);
  });

  it("keeps an id the site can no longer resolve", () => {
    // A reference entry can be renamed or retired after a record was written.
    // Silently dropping the link would be deleting part of somebody's record.
    expect(
      resolveReferences(
        { problem_ids: [], part_ids: ["retired-part"], procedure_ids: [] },
        CATALOGUE
      )
    ).toEqual([{ kind: "part", id: "retired-part", title: null }]);
  });
});

describe("recordWriteFromDraft", () => {
  it("sends the columns a person filled in", () => {
    const write = recordWriteFromDraft(
      "v1",
      draft({
        title: "  Oil   change  ",
        body: " on the level ",
        cost: "38 500",
        currency: "CRC",
        time: "1.2",
        odometer: "247500",
      }),
      CATALOGUE
    );
    expect(write).toEqual({
      vehicle_id: "v1",
      occurred_on: "2026-07-19",
      kind: "work",
      title: "Oil change",
      body: "on the level",
      cost_amount: 38500,
      cost_currency: "CRC",
      time_minutes: 72,
      odometer_km: 247500,
      problem_ids: [],
      part_ids: [],
      procedure_ids: [],
    });
  });

  it("never transmits a visibility flag", () => {
    // SHR-01/SHR-03: both columns default to false in the schema, and a save
    // path that mentioned them is a save path where a typo publishes a cost.
    const write = recordWriteFromDraft("v1", draft(), CATALOGUE);
    expect(write).not.toHaveProperty("is_public");
    expect(write).not.toHaveProperty("is_cost_public");
  });

  it("drops the currency when there is no amount to read", () => {
    const write = recordWriteFromDraft("v1", draft({ cost: "" }), CATALOGUE);
    expect(write?.cost_amount).toBeNull();
    expect(write?.cost_currency).toBeNull();
  });

  it("refuses a draft with issues rather than sending half of it", () => {
    expect(
      recordWriteFromDraft("v1", draft({ title: "" }), CATALOGUE)
    ).toBeNull();
  });

  it("does not walk a time nobody touched", () => {
    // The odometer's trap, on the second figure that has two units, and the
    // one the first version of this suite missed: every fixture used 72 min,
    // which is 1.2 h and converts back to exactly 72. Most values do not.
    // 45 min renders as 0.8 h, which converts back to 48 — so an edit to the
    // *title* alone would have added three minutes to the job, every save.
    for (const minutes of [1, 45, 100, 359]) {
      const previous = row({ time_minutes: minutes });
      const asShown = recordDraftFromRow(previous, {
        odometerUnit: "km",
        timeUnit: "h",
      });
      const write = recordWriteFromDraft(
        "v1",
        { ...asShown, title: "Edited only the title" },
        CATALOGUE,
        previous
      );
      expect(write?.time_minutes).toBe(minutes);
    }
  });

  it("takes a time the reader did edit", () => {
    // The other half of the guard: "untouched" has to mean untouched, or the
    // stored figure would outlive every correction made to it.
    const previous = row({ time_minutes: 45 });
    const write = recordWriteFromDraft(
      "v1",
      {
        ...recordDraftFromRow(previous, {
          odometerUnit: "km",
          timeUnit: "h",
        }),
        title: "Took longer than that",
        time: "2",
      },
      CATALOGUE,
      previous
    );
    expect(write?.time_minutes).toBe(120);
  });

  it("does not walk an odometer nobody touched", () => {
    // 247 500 km renders as 153 789 mi, which converts back to 247 499. A
    // figure nobody edited must come back out as the figure that went in.
    const previous = row({ odometer_km: 247_500 });
    const asShown = recordDraftFromRow(previous, {
      odometerUnit: "mi",
      timeUnit: "h",
    });
    const write = recordWriteFromDraft(
      "v1",
      { ...asShown, title: previous.title ?? "" },
      CATALOGUE,
      previous
    );
    expect(write?.odometer_km).toBe(247_500);
  });
});

describe("recordDraftFromRow", () => {
  it("puts a stored row back in the form's shape", () => {
    const back = recordDraftFromRow(
      row({
        cost_amount: 38500,
        cost_currency: "CRC",
        time_minutes: 72,
        odometer_km: 247_500,
        part_ids: ["gen3-sway-bar-link"],
      }),
      { odometerUnit: "km", timeUnit: "h" }
    );
    expect(back.cost).toBe("38500");
    expect(back.currency).toBe("CRC");
    expect(back.time).toBe("1.2");
    expect(back.odometer).toBe("247500");
    expect(back.partIds).toEqual(["gen3-sway-bar-link"]);
  });

  it("leaves an unrecorded figure empty rather than zero", () => {
    const back = recordDraftFromRow(row(), {
      odometerUnit: "km",
      timeUnit: "h",
    });
    expect(back.cost).toBe("");
    expect(back.time).toBe("");
    expect(back.odometer).toBe("");
  });
});

describe("timelineOrder", () => {
  const done1 = row({ id: "a", occurred_on: "2026-07-19" });
  const done2 = row({ id: "b", occurred_on: "2026-06-02" });
  const plan1 = row({ id: "c", kind: "plan", occurred_on: "2026-09-01" });
  const plan2 = row({ id: "d", kind: "plan", occurred_on: "2027-01-01" });

  it("reads history newest first and plans soonest first", () => {
    expect(
      timelineOrder([plan2, done2, plan1, done1]).map((entry) => entry.id)
    ).toEqual(["a", "b", "c", "d"]);
  });

  it("puts the whole planned half after the whole done half", () => {
    // Even though a plan is dated later than everything done, the artboard
    // puts it at the foot of the rail: history is what the page is for.
    const order = timelineOrder([plan1, done1]).map((entry) => entry.id);
    expect(order).toEqual(["a", "c"]);
  });

  it("breaks a same-day tie by id, so nothing swaps between renders", () => {
    const first = row({ id: "x", occurred_on: "2026-07-19" });
    const second = row({ id: "y", occurred_on: "2026-07-19" });
    expect(timelineOrder([first, second]).map((entry) => entry.id)).toEqual(
      timelineOrder([second, first]).map((entry) => entry.id)
    );
  });

  it("gives the planned panel the plans, soonest first", () => {
    expect(
      plannedRecords([plan2, done1, plan1]).map((entry) => entry.id)
    ).toEqual(["c", "d"]);
  });
});

describe("recordCounts", () => {
  it("counts every entry, and how many of them are still ahead", () => {
    const counts = recordCounts([
      row({ id: "a" }),
      row({ id: "b" }),
      row({ id: "c", kind: "plan" }),
    ]);
    expect(counts).toEqual({ entries: 3, planned: 1 });
  });

  it("is honestly zero for a vehicle with nothing recorded", () => {
    expect(recordCounts([])).toEqual({ entries: 0, planned: 0 });
  });
});

describe("recordHeadline", () => {
  it("uses the user's own words when there are any", () => {
    expect(recordHeadline(row(), "Work done")).toBe(
      "Front sway-bar end links replaced"
    );
  });

  it("falls back to the kind so a card is never an empty heading", () => {
    // WCAG 2.1 AA: a heading with no content announces nothing. A row written
    // by an import or an accepted proposal may have no title.
    expect(recordHeadline(row({ title: null }), "Work done")).toBe("Work done");
    expect(recordHeadline(row({ title: "  " }), "Nota")).toBe("Nota");
  });
});
