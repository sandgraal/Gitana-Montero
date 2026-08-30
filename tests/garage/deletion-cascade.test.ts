/**
 * Graders — CONTRACT 4: deleting an account really deletes everything.
 *
 * > **ACC-03** A user SHALL be able to delete their account; after a 30-day
 * > recovery window, all vehicles, records, and stored files SHALL be
 * > hard-deleted.
 *
 * "and stored files" is the clause this file exists for. A cascade of foreign
 * keys deletes *rows*, and it is very easy to ship a schema where every row is
 * gone and every receipt PDF is still sitting in the bucket — because a
 * `storage.objects` row and the bytes it points at are not the same thing, and
 * `on delete cascade` reaches neither of them from `public.receipts`.
 *
 * So the cascade is graded in three places that fail independently:
 *
 * 1. **Declared.** Every hop of every ownership path is `on delete cascade`,
 *    read out of the DDL.
 * 2. **Rows.** After the purge, no vehicle, record, or receipt row survives.
 * 3. **Files.** After the purge, the object is not listable, not readable by
 *    its owner, not signable, and not there.
 *
 * ## The recovery window
 *
 * ACC-03 has two events, not one: the user asks, and thirty days later the
 * data goes. A grader cannot wait thirty days, so the purge is invoked
 * directly — `contract.ts`'s `HARD_DELETE_FUNCTION`, the one piece of
 * T2-202's internals these graders name. The window itself is graded from the
 * DDL.
 *
 * ## Expected-failure convention
 *
 * `it.fails` is the marker. T2-202 activates a grader by deleting exactly that
 * `.fails`.
 *
 * refs specs/002-montero-garage (ACC-03, GAR-05′, MIG-03)
 */
import { describe, expect, it } from "vitest";
import {
  HARD_DELETE_FUNCTION,
  RECOVERY_WINDOW_DAYS,
  USER_TABLES,
  testReceiptPath,
} from "./contract.ts";
import {
  deleteAuthUser,
  detectLiveStack,
  downloadObject,
  listObjects,
  liveTitle,
  createOwnedFixture,
  provisionScenario,
  rowCount,
  rpc,
  selectRows,
  signObject,
  stackOf,
  teardownScenario,
  uploadObject,
} from "./harness.ts";
import {
  columnDefinition,
  createTableBody,
  foreignKey,
  migrationSql,
} from "./sql.ts";

const live = await detectLiveStack();

/* =========================================================================
 * Tier A — declaration
 * ====================================================================== */

/** Every foreign-key hop that must cascade, one row per grader. */
const CASCADE_HOPS = [
  ["profiles", "id", "auth.users"],
  ["vehicles", "owner_id", "auth.users"],
  ["records", "vehicle_id", "vehicles"],
  ["receipts", "record_id", "records"],
] as const;

describe("the ownership chain is declared to cascade", () => {
  it.fails.each(CASCADE_HOPS)(
    "%s.%s references %s on delete cascade",
    (table, column, target) => {
      // One missing `on delete cascade` anywhere on this chain and ACC-03's
      // hard delete either fails on a constraint or leaves an orphan behind —
      // an orphaned receipt row still names a vendor, a date, and an amount.
      const body = createTableBody(migrationSql(), table);
      const definition = columnDefinition(body ?? "", column);

      expect(definition, `${table}.${column}`).not.toBeNull();
      const fk = foreignKey(definition?.definition ?? "");
      expect(fk?.target).toContain(target.replace("auth.users", "users"));
      expect(fk?.cascades).toBe(true);
    }
  );

  // Unmarked, and passing today: this one grades `contract.ts` against
  // `CASCADE_HOPS`, both of which exist. It is the guard that stops the table
  // above from silently missing a table — a fifth one joining the schema
  // without joining the delete path would otherwise never be noticed here.
  it("covers every table in the contract, so the table above is complete", () => {
    const onChain = new Set<string>(CASCADE_HOPS.map(([table]) => table));

    expect(
      USER_TABLES.map((table) => table.name).filter(
        (name) => !onChain.has(name)
      )
    ).toEqual([]);
  });
});

describe("the 30-day recovery window is real (ACC-03)", () => {
  it.fails(
    "marks an account deleted rather than dropping it immediately",
    () => {
      // The window needs somewhere to live. Without it, "delete" is
      // irreversible on the first click and the requirement is unimplementable.
      const body = createTableBody(migrationSql(), "profiles");

      expect(columnDefinition(body ?? "", "deleted_at")).not.toBeNull();
    }
  );

  it.fails(`purges only after ${RECOVERY_WINDOW_DAYS} days`, () => {
    const sql = migrationSql();

    expect(sql).toMatch(
      new RegExp(
        `${RECOVERY_WINDOW_DAYS}\\s*day|'${RECOVERY_WINDOW_DAYS} days'`
      )
    );
  });

  it.fails(`ships a callable ${HARD_DELETE_FUNCTION} routine`, () => {
    expect(migrationSql()).toMatch(
      new RegExp(
        `create (or replace )?function [a-z_.]*${HARD_DELETE_FUNCTION}`
      )
    );
  });

  it.fails("does not let a user purge somebody else's account", () => {
    // A purge routine is the most dangerous callable surface in the schema.
    // `security definer` without an `auth.uid()` check inside it is a
    // one-request account deletion for any authenticated stranger.
    const sql = migrationSql();
    const start = sql.indexOf(HARD_DELETE_FUNCTION);
    const body = start === -1 ? "" : sql.slice(start, start + 4000);

    expect(body).toContain("auth.uid()");
  });
});

/* =========================================================================
 * Tier B — behavioural
 * ====================================================================== */

describe.skipIf(!live.available)(
  liveTitle("the purge reaches rows AND files", live),
  () => {
    it.fails("leaves no vehicle, record, or receipt row behind", async () => {
      const scenario = await provisionScenario(stackOf(live));
      try {
        const path = testReceiptPath(scenario.ownerA.userId ?? "", "1");
        await createOwnedFixture(scenario, scenario.ownerA, path);

        await rpc(
          scenario,
          { token: scenario.serviceToken },
          HARD_DELETE_FUNCTION,
          { p_user_id: scenario.ownerA.userId }
        );

        for (const table of ["vehicles", "records", "receipts"]) {
          const remaining = await selectRows(
            scenario,
            { ...scenario.ownerA },
            table
          );
          expect(rowCount(remaining), table).toBe(0);
        }
      } finally {
        await teardownScenario(scenario);
      }
    });

    it.fails("leaves no readable receipt file behind", async () => {
      // The clause the row cascade cannot satisfy on its own. If this is the
      // only grader in the file that stays red, the implementation deleted the
      // database and kept the PDFs.
      const scenario = await provisionScenario(stackOf(live));
      try {
        const path = testReceiptPath(scenario.ownerA.userId ?? "", "1");
        await uploadObject(scenario, scenario.ownerA, path);
        await createOwnedFixture(scenario, scenario.ownerA, path);

        await rpc(
          scenario,
          { token: scenario.serviceToken },
          HARD_DELETE_FUNCTION,
          { p_user_id: scenario.ownerA.userId }
        );

        const read = await downloadObject(scenario, scenario.ownerA, path);
        expect(read.ok).toBe(false);
        expect(read.text).not.toContain("TEST-T2-201 synthetic receipt");
      } finally {
        await teardownScenario(scenario);
      }
    });

    it.fails("leaves no listable receipt file behind", async () => {
      // Separate from "not readable": an object can 403 on read and still
      // appear in a listing, and a listing of a deleted account's filenames is
      // itself data that should be gone.
      const scenario = await provisionScenario(stackOf(live));
      try {
        const path = testReceiptPath(scenario.ownerA.userId ?? "", "1");
        await uploadObject(scenario, scenario.ownerA, path);
        await createOwnedFixture(scenario, scenario.ownerA, path);

        await rpc(
          scenario,
          { token: scenario.serviceToken },
          HARD_DELETE_FUNCTION,
          { p_user_id: scenario.ownerA.userId }
        );

        const listing = await listObjects(
          scenario,
          { ...scenario.ownerA },
          scenario.ownerA.userId ?? ""
        );
        expect(listing.text).not.toContain("TEST-T2-201-RECEIPT-1.pdf");
      } finally {
        await teardownScenario(scenario);
      }
    });

    it.fails("leaves no signable receipt file behind", async () => {
      const scenario = await provisionScenario(stackOf(live));
      try {
        const path = testReceiptPath(scenario.ownerA.userId ?? "", "1");
        await uploadObject(scenario, scenario.ownerA, path);
        await createOwnedFixture(scenario, scenario.ownerA, path);

        await rpc(
          scenario,
          { token: scenario.serviceToken },
          HARD_DELETE_FUNCTION,
          { p_user_id: scenario.ownerA.userId }
        );

        const signed = await signObject(scenario, scenario.ownerA, path);
        expect(signed.ok).toBe(false);
      } finally {
        await teardownScenario(scenario);
      }
    });

    it.fails("does not touch the other owner's data", async () => {
      // A purge that over-reaches is the same defect wearing the opposite
      // coat, and it is much harder to notice in production.
      const scenario = await provisionScenario(stackOf(live));
      try {
        await createOwnedFixture(
          scenario,
          scenario.ownerA,
          testReceiptPath(scenario.ownerA.userId ?? "", "1")
        );
        const pathB = testReceiptPath(scenario.ownerB.userId ?? "", "1");
        await uploadObject(scenario, scenario.ownerB, pathB);
        await createOwnedFixture(scenario, scenario.ownerB, pathB);

        await rpc(
          scenario,
          { token: scenario.serviceToken },
          HARD_DELETE_FUNCTION,
          { p_user_id: scenario.ownerA.userId }
        );

        const remaining = await selectRows(
          scenario,
          scenario.ownerB,
          "vehicles"
        );
        expect(rowCount(remaining)).toBe(1);

        const readB = await downloadObject(scenario, scenario.ownerB, pathB);
        expect(readB.ok).toBe(true);
      } finally {
        await teardownScenario(scenario);
      }
    });
  }
);

describe.skipIf(!live.available)(
  liveTitle("deleting the auth user is terminal, whatever the route", live),
  () => {
    it.fails(
      "removing the auth.users row removes every dependent row",
      async () => {
        // The purge function is one route. This is the other: whatever deletes
        // the account — an admin action, a GDPR request, a Supabase dashboard
        // click — must not be able to leave a garage behind with no owner.
        // This grader names no function, so it survives any rename.
        const scenario = await provisionScenario(stackOf(live));
        try {
          await createOwnedFixture(
            scenario,
            scenario.ownerA,
            testReceiptPath(scenario.ownerA.userId ?? "", "1")
          );

          const deleted = await deleteAuthUser(
            scenario,
            scenario.ownerA.userId ?? ""
          );
          expect(deleted.ok).toBe(true);

          // Read back as the service role: an owner-scoped read after the
          // owner is gone returns nothing whether the rows survived or not,
          // so it could never tell these two cases apart.
          const remaining = await selectRows(
            scenario,
            { ...scenario.ownerA, token: scenario.serviceToken },
            "vehicles",
            `owner_id=eq.${scenario.ownerA.userId}`
          );

          expect(rowCount(remaining)).toBe(0);
        } finally {
          await teardownScenario(scenario);
        }
      }
    );

    it.fails(
      "POSITIVE CONTROL: the rows are there until the account goes",
      async () => {
        // Without this, the grader above passes against a schema where the
        // insert never worked in the first place.
        const scenario = await provisionScenario(stackOf(live));
        try {
          await createOwnedFixture(
            scenario,
            scenario.ownerA,
            testReceiptPath(scenario.ownerA.userId ?? "", "1")
          );

          const before = await selectRows(
            scenario,
            { ...scenario.ownerA, token: scenario.serviceToken },
            "vehicles",
            `owner_id=eq.${scenario.ownerA.userId}`
          );

          expect(rowCount(before)).toBe(1);
        } finally {
          await teardownScenario(scenario);
        }
      }
    );
  }
);
