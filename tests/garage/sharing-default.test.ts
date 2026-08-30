/**
 * Graders — CONTRACT 5: private by default, at the schema level.
 *
 * > **SHR-01** Everything a user stores SHALL default to private (owner
 * > decision 2026-08-28). Row-level security in the database enforces it; no
 * > client-trusted checks.
 * > **SHR-03** Costs and receipts SHALL stay private even on a public
 * > work-log unless opened per record.
 *
 * The distinction this file exists to keep sharp: **private-by-default is a
 * column default, not an application habit.** A form that leaves the "make
 * public" box unticked is a client-trusted check — SHR-01 rules it out by
 * name. The guarantee has to survive a row inserted by a script, by a future
 * import job, by a `curl` the user found on a forum. That means:
 *
 * - the column exists, so visibility is representable at all;
 * - it is `not null`, so there is no third state that is neither public nor
 *   private and that some later `coalesce` gets wrong;
 * - it defaults to `false`, so an insert that never mentions it is private;
 * - and the default actually round-trips through the real database.
 *
 * `contract.ts`'s `SHARE_FLAG_COLUMNS` is the table these iterate: every
 * column whose *default* is the privacy guarantee, one grader per column per
 * property, because each fails on its own.
 *
 * ## Expected-failure convention
 *
 * `it.fails` is the marker. T2-202 activates a grader by deleting exactly that
 * `.fails`.
 *
 * refs specs/002-montero-garage (SHR-01, SHR-02, SHR-03, GAR-05′)
 */
import { describe, expect, it } from "vitest";
import {
  SHARE_FLAG_COLUMNS,
  TEST_TAXONOMY_IDENTITY,
  testReceiptPath,
  testVehicleName,
} from "./contract.ts";
import {
  createOwnedFixture,
  detectLiveStack,
  insertRow,
  liveTitle,
  provisionScenario,
  stackOf,
  teardownScenario,
} from "./harness.ts";
import {
  columnDefinition,
  createTableBody,
  defaultExpression,
  migrationSql,
} from "./sql.ts";

const live = await detectLiveStack();

const FLAGS = SHARE_FLAG_COLUMNS.map(
  (flag) => [flag.table, flag.column, flag.requirement] as const
);

/* =========================================================================
 * Tier A — declaration
 * ====================================================================== */

describe("every visibility flag is declared private-by-default", () => {
  it.fails.each(FLAGS)("%s.%s exists (%s)", (table, column) => {
    const body = createTableBody(migrationSql(), table);

    expect(columnDefinition(body ?? "", column)).not.toBeNull();
  });

  it.fails.each(FLAGS)("%s.%s is boolean (%s)", (table, column) => {
    const body = createTableBody(migrationSql(), table);

    expect(columnDefinition(body ?? "", column)?.definition ?? "").toMatch(
      /\bbool/
    );
  });

  it.fails.each(FLAGS)("%s.%s is not null (%s)", (table, column) => {
    // A nullable visibility flag has three states, and only two of them are
    // answers. The third one is whatever the next `coalesce` decides.
    const body = createTableBody(migrationSql(), table);

    expect(columnDefinition(body ?? "", column)?.definition ?? "").toMatch(
      /\bnot null\b/
    );
  });

  it.fails.each(FLAGS)(
    "%s.%s DEFAULTS TO FALSE — the whole of SHR-01 (%s)",
    (table, column) => {
      const body = createTableBody(migrationSql(), table);
      const definition = columnDefinition(body ?? "", column);

      expect(defaultExpression(definition?.definition ?? "")).toBe("false");
    }
  );

  it.fails("declares no visibility flag defaulting to true, anywhere", () => {
    // The negative sweep: catches a *fifth* flag added later that this file's
    // table does not know about. A grader that only iterates a known list can
    // never see the column nobody told it about.
    const sql = migrationSql();
    const optimistic = [
      ...sql.matchAll(
        /(is_[a-z_]*(public|shared|visible)[a-z_]*)[^,)]*default true/g
      ),
    ].map((match) => match[1]);

    expect(optimistic).toEqual([]);
  });
});

/* =========================================================================
 * Tier B — behavioural
 * ====================================================================== */

describe.skipIf(!live.available)(
  liveTitle("the default survives a real insert", live),
  () => {
    it.fails(
      "a vehicle created without mentioning visibility is private",
      async () => {
        // The insert deliberately says nothing about sharing — exactly what a
        // script, an import job, or a hand-written request would do.
        const scenario = await provisionScenario(stackOf(live));
        try {
          const response = await insertRow(
            scenario,
            scenario.ownerA,
            "vehicles",
            {
              owner_id: scenario.ownerA.userId,
              display_name: testVehicleName("a"),
              ...TEST_TAXONOMY_IDENTITY,
            }
          );

          const rows = Array.isArray(response.body) ? response.body : [];
          const vehicle = rows[0] as Record<string, unknown> | undefined;

          expect(vehicle?.is_showcase_public).toBe(false);
          expect(vehicle?.is_worklog_public).toBe(false);
        } finally {
          await teardownScenario(scenario);
        }
      }
    );

    it.fails(
      "a record created without mentioning visibility is private",
      async () => {
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
              kind: "work",
            }
          );

          const rows = Array.isArray(response.body) ? response.body : [];
          const record = rows[0] as Record<string, unknown> | undefined;

          expect(record?.is_public).toBe(false);
          expect(record?.is_cost_public).toBe(false);
        } finally {
          await teardownScenario(scenario);
        }
      }
    );

    it.fails(
      "cost visibility is its own decision, not the record's",
      async () => {
        // SHR-03: publishing a work-log entry must not publish what it cost.
        // Two columns, two defaults, and opening one must leave the other shut.
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
              kind: "work",
              cost_amount: 45000,
              cost_currency: "CRC",
              is_public: true,
            }
          );

          const rows = Array.isArray(response.body) ? response.body : [];
          const record = rows[0] as Record<string, unknown> | undefined;

          expect(record?.is_public).toBe(true);
          expect(record?.is_cost_public).toBe(false);
        } finally {
          await teardownScenario(scenario);
        }
      }
    );

    it.fails(
      "POSITIVE CONTROL: the owner can still choose to publish",
      async () => {
        // Private-by-default is not private-by-force. SHR-02 is a feature, and
        // a schema that refused to flip the flag would satisfy every grader
        // above while shipping a garage nobody can share.
        const scenario = await provisionScenario(stackOf(live));
        try {
          const response = await insertRow(
            scenario,
            scenario.ownerA,
            "vehicles",
            {
              owner_id: scenario.ownerA.userId,
              display_name: testVehicleName("a"),
              ...TEST_TAXONOMY_IDENTITY,
              is_showcase_public: true,
            }
          );

          const rows = Array.isArray(response.body) ? response.body : [];
          expect(
            (rows[0] as Record<string, unknown> | undefined)?.is_showcase_public
          ).toBe(true);
        } finally {
          await teardownScenario(scenario);
        }
      }
    );
  }
);
