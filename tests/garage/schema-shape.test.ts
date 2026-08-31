/**
 * Graders — CONTRACT 2: the user/vehicle/record/receipt table shapes.
 *
 * > **GAR-01′** A user SHALL create vehicle profiles with a display name,
 * > taxonomy identity resolved by the 001 fitment engine, photos, and
 * > odometer.
 * > **GAR-02′** A user SHALL add records to their vehicle: dated, typed
 * > (work / receipt / note / plan), with optional cost, time, odometer,
 * > attachments, and typed references to reference entries.
 * > **GAR-05′** Receipts SHALL be first-class: uploadable (image/PDF) into
 * > user-private storage, with vendor/date/amount fields.
 *
 * Every column asserted here is in `contract.ts` with the requirement that
 * puts it there; nothing is graded that no requirement asks for. The names are
 * this task's design decision on the spec's behalf — see `contract.ts` for why
 * they live in one file and how to change one.
 *
 * ## What "shape" means here, and what it deliberately does not
 *
 * These graders pin **presence, nullability, and the defaults that carry a
 * guarantee**. They do not pin storage widths, index strategy, or whether an
 * id is `uuid v4` or `v7` — decisions T2-202 owns. The line is: if getting it
 * wrong loses data, leaks data, or makes a requirement unimplementable, it is
 * graded. Otherwise it is the implementer's.
 *
 * The one boundary the spec draws sharply is **`kind`** (GAR-02′ names four
 * values and only four), so that is an enumerated table, the same way 001's
 * locale enum and confidence tiers are.
 *
 * ## Expected-failure convention
 *
 * `it.fails` is the marker. T2-202 activates a grader by deleting exactly that
 * `.fails`.
 *
 * refs specs/002-montero-garage (GAR-01′, GAR-02′, GAR-05′, ACC-01, ACC-03)
 */
import { describe, expect, it } from "vitest";
import {
  TEST_TAXONOMY_IDENTITY,
  USER_TABLES,
  testReceiptPath,
  testVehicleName,
} from "./contract.ts";
import {
  createOwnedFixture,
  detectLiveStack,
  insertRow,
  liveTitle,
  provisionScenario,
  rowCount,
  selectRows,
  stackOf,
  teardownScenario,
} from "./harness.ts";
import { isOptionalColumn } from "./rules.ts";
import {
  columnDefinition,
  createTableBody,
  defaultExpression,
  isNotNullFor,
  migrationSql,
} from "./sql.ts";

const live = await detectLiveStack();

/** The four record kinds GAR-02′ names, and nothing else. */
const RECORD_KINDS = ["work", "receipt", "note", "plan"] as const;

/* =========================================================================
 * Tier A — declaration
 * ====================================================================== */

describe("every user-data table exists", () => {
  it.fails.each(USER_TABLES.map((table) => [table.name, table.requirement]))(
    "public.%s is created (%s)",
    (table) => {
      expect(createTableBody(migrationSql(), table)).not.toBeNull();
    }
  );
});

describe("every column a requirement asks for is declared", () => {
  const rows = USER_TABLES.flatMap((table) =>
    table.columns.map(
      (column) => [table.name, column.name, column.requirement, column] as const
    )
  );

  it.fails.each(rows)("%s.%s exists (%s)", (table, column) => {
    const body = createTableBody(migrationSql(), table);
    expect(body).not.toBeNull();
    expect(columnDefinition(body ?? "", column)).not.toBeNull();
  });

  it.fails.each(rows.filter(([, , , column]) => column.type !== undefined))(
    "%s.%s has the type the requirement implies (%s)",
    (table, column, _requirement, contract) => {
      const body = createTableBody(migrationSql(), table);
      const definition = columnDefinition(body ?? "", column);

      expect(definition).not.toBeNull();
      expect(definition?.definition ?? "").toMatch(contract.type as RegExp);
    }
  );

  it.fails.each(rows.filter(([, , , column]) => column.notNull === true))(
    "%s.%s cannot be null (%s)",
    (table, column) => {
      // `primary key` implies NOT NULL — in Postgres that is not an extra
      // constraint you might also want, it is part of what a primary key is.
      // Demanding the literal `not null` rejected `id uuid primary key`,
      // which is the spelling this harness's own sample DDL uses (T2-201
      // review, F6).
      expect(isNotNullFor(migrationSql(), table, column)).toBe(true);
    }
  );
});

describe("optional columns stay optional — a record is allowed to be sparse", () => {
  // GAR-02′ says cost, time, odometer and the reference arrays are
  // *optional*. A `not null` on any of them turns "I changed the oil" into a
  // form the user cannot submit without inventing numbers — and inventing
  // numbers is the one thing this project refuses to do anywhere else.
  //
  // But optionality has two correct spellings, and the first version of this
  // grader knew only one (T2-201 review, F8): `problem_ids text[] not null
  // default '{}'` says "no references" at least as well as a nullable array,
  // and arguably better, since it removes the null-versus-empty ambiguity
  // every consumer would otherwise have to handle. Columns that may spell
  // absence that way are flagged in contract.ts; a scalar like `cost_amount`
  // is not one of them, because `not null default 0` is not an empty value,
  // it is a claim that the job was free.
  const optional = USER_TABLES.flatMap((table) =>
    table.columns
      .filter((column) => !column.notNull && column.defaultsTo === undefined)
      .map(
        (column) =>
          [
            table.name,
            column.name,
            column.absenceDefaultAllowed === true,
          ] as const
      )
  );

  it.fails.each(optional)(
    "%s.%s is optional",
    (table, column, absenceDefaultAllowed) => {
      expect(
        isOptionalColumn(migrationSql(), table, column, absenceDefaultAllowed)
      ).toBe(true);
    }
  );
});

describe("a record's kind is a closed set (GAR-02′)", () => {
  it.fails("constrains records.kind to exactly the four named kinds", () => {
    // Free-text `kind` means the derived views of GAR-03′ — the current-state
    // sheet and the planned queue — are computed off strings nobody
    // validates, and "plan" vs "planned" silently empties a page.
    const sql = migrationSql();
    const constrained = RECORD_KINDS.every((kind) =>
      new RegExp(`'${kind}'`).test(sql)
    );

    expect(constrained).toBe(true);
    // `create type public.record_kind` is a schema-qualified enum and just as
    // correct as an unqualified one; the first version of this pattern could
    // not see the dot (T2-201 review, F6).
    expect(sql).toMatch(
      /check \([^)]*kind[^)]*\)|create (?:type|domain) (?:[a-z_]+\.)?[a-z_]*kind\b/
    );
  });
});

describe("taxonomy identity points at 001's vehicle collection (GAR-01′)", () => {
  it.fails(
    "stores generation, market, year, and engine as separate columns",
    () => {
      // Not one denormalised "spec" string: the 001 fitment engine answers
      // "does entry E apply to vehicle V" against these four ids, and a joined
      // string cannot be asked that question.
      const body = createTableBody(migrationSql(), "vehicles");

      for (const column of Object.keys(TEST_TAXONOMY_IDENTITY)) {
        expect(columnDefinition(body ?? "", column), column).not.toBeNull();
      }
    }
  );

  it.fails("requires a generation — GAR-01′'s identity is not optional", () => {
    expect(isNotNullFor(migrationSql(), "vehicles", "generation_id")).toBe(
      true
    );
  });

  it.fails("gives a vehicle somewhere to keep photos", () => {
    // GAR-01′ names photos in the same breath as the display name. Whether
    // they are an array column or their own table is T2-202's call; that
    // there is nowhere to put them is not.
    const sql = migrationSql();

    expect(sql).toMatch(/photo/);
  });
});

/* =========================================================================
 * Tier B — behavioural
 * ====================================================================== */

describe.skipIf(!live.available)(
  liveTitle("the shapes behave as declared", live),
  () => {
    it.fails(
      "POSITIVE CONTROL: an owner can create vehicle → record → receipt",
      async () => {
        // The whole GAR′ chain, through the API, as the owner, with policies
        // on. Every denial grader in this directory is worthless without it.
        const scenario = await provisionScenario(stackOf(live));
        try {
          const owned = await createOwnedFixture(
            scenario,
            scenario.ownerA,
            testReceiptPath(scenario.ownerA.userId ?? "", "1")
          );

          expect(owned.vehicleId).toBeTruthy();
          expect(owned.recordId).toBeTruthy();
          expect(owned.receiptId).toBeTruthy();
        } finally {
          await teardownScenario(scenario);
        }
      }
    );

    it.fails.each(RECORD_KINDS.map((kind) => [kind]))(
      "a record of kind %s is accepted",
      async (kind) => {
        const scenario = await provisionScenario(stackOf(live));
        try {
          const owned = await createOwnedFixture(
            scenario,
            scenario.ownerA,
            testReceiptPath(scenario.ownerA.userId ?? "", "1")
          );

          const response = await insertRow(
            scenario,
            scenario.ownerA,
            "records",
            {
              vehicle_id: owned.vehicleId,
              occurred_on: "2026-08-30",
              kind,
            }
          );

          expect(response.ok).toBe(true);
        } finally {
          await teardownScenario(scenario);
        }
      }
    );

    it.fails("a record of an unnamed kind is rejected", async () => {
      // The negative half of the enumeration. Without it, the four graders
      // above are satisfied by a plain `text` column.
      const scenario = await provisionScenario(stackOf(live));
      try {
        const owned = await createOwnedFixture(
          scenario,
          scenario.ownerA,
          testReceiptPath(scenario.ownerA.userId ?? "", "1")
        );

        const response = await insertRow(scenario, scenario.ownerA, "records", {
          vehicle_id: owned.vehicleId,
          occurred_on: "2026-08-30",
          kind: "TEST-NOT-A-KIND",
        });

        expect(response.ok).toBe(false);
      } finally {
        await teardownScenario(scenario);
      }
    });

    it.fails("a record must be dated (GAR-02′)", async () => {
      // "Dated" is what makes GAR-03′'s chronology and the work-log page
      // possible at all. An undated record is a note nobody can place.
      const scenario = await provisionScenario(stackOf(live));
      try {
        const owned = await createOwnedFixture(
          scenario,
          scenario.ownerA,
          testReceiptPath(scenario.ownerA.userId ?? "", "1")
        );

        const response = await insertRow(scenario, scenario.ownerA, "records", {
          vehicle_id: owned.vehicleId,
          kind: "note",
        });

        expect(response.ok).toBe(false);
      } finally {
        await teardownScenario(scenario);
      }
    });

    it.fails(
      "a record with no cost, time, or odometer is accepted",
      async () => {
        // The positive control for the sparse-record rule above.
        const scenario = await provisionScenario(stackOf(live));
        try {
          const owned = await createOwnedFixture(
            scenario,
            scenario.ownerA,
            testReceiptPath(scenario.ownerA.userId ?? "", "1")
          );

          const response = await insertRow(
            scenario,
            scenario.ownerA,
            "records",
            {
              vehicle_id: owned.vehicleId,
              occurred_on: "2026-08-30",
              kind: "note",
            }
          );

          expect(response.ok).toBe(true);
        } finally {
          await teardownScenario(scenario);
        }
      }
    );

    it.fails("a vehicle must carry a display name (GAR-01′)", async () => {
      const scenario = await provisionScenario(stackOf(live));
      try {
        const response = await insertRow(
          scenario,
          scenario.ownerA,
          "vehicles",
          {
            owner_id: scenario.ownerA.userId,
            ...TEST_TAXONOMY_IDENTITY,
          }
        );

        expect(response.ok).toBe(false);
      } finally {
        await teardownScenario(scenario);
      }
    });

    it.fails(
      "a record cannot be attached to a vehicle the writer does not own",
      async () => {
        // The FK exists to keep records on vehicles; the policy exists to keep
        // them on *your* vehicles. This grader is the seam between them, and
        // it is the one a correct FK plus a lazy policy fails.
        const scenario = await provisionScenario(stackOf(live));
        try {
          const ownedByA = await createOwnedFixture(
            scenario,
            scenario.ownerA,
            testReceiptPath(scenario.ownerA.userId ?? "", "1")
          );

          const response = await insertRow(
            scenario,
            scenario.ownerB,
            "records",
            {
              vehicle_id: ownedByA.vehicleId,
              occurred_on: "2026-08-30",
              kind: "work",
            }
          );

          expect(response.ok).toBe(false);

          const asOwnerA = await selectRows(
            scenario,
            scenario.ownerA,
            "records",
            `vehicle_id=eq.${ownedByA.vehicleId}`
          );
          expect(rowCount(asOwnerA)).toBe(1);
        } finally {
          await teardownScenario(scenario);
        }
      }
    );

    it.fails("a vehicle's display name round-trips unchanged", async () => {
      // Cheap, and it catches the encoding class of bug that would mangle
      // "Gitana Blanca" the moment a name carries an accent.
      const scenario = await provisionScenario(stackOf(live));
      try {
        const response = await insertRow(
          scenario,
          scenario.ownerA,
          "vehicles",
          {
            owner_id: scenario.ownerA.userId,
            display_name: `${testVehicleName("a")} ñ á`,
            ...TEST_TAXONOMY_IDENTITY,
          }
        );

        const rows = Array.isArray(response.body) ? response.body : [];
        expect(
          (rows[0] as { display_name?: string } | undefined)?.display_name
        ).toBe(`${testVehicleName("a")} ñ á`);
      } finally {
        await teardownScenario(scenario);
      }
    });
  }
);

/* =========================================================================
 * Guard on the contract table itself
 * ====================================================================== */

describe("the declaration graders above are reading a real contract", () => {
  // Unmarked: if `contract.ts` ever loses its column list, every `it.each`
  // above silently becomes zero graders and the suite still reports green.
  it("grades at least thirty columns across the four tables", () => {
    const columns = USER_TABLES.flatMap((table) => table.columns);

    expect(columns.length).toBeGreaterThanOrEqual(30);
  });

  it("grades at least one default-bearing column", () => {
    const defaults = USER_TABLES.flatMap((table) =>
      table.columns.filter((column) => column.defaultsTo !== undefined)
    );

    expect(defaults.length).toBeGreaterThan(0);
    expect(defaultExpression("boolean not null default false")).toBe("false");
  });
});
