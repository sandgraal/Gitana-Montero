/**
 * Graders — CONTRACT 1: row-level security denies by default.
 *
 * > User data never leaves Supabase; every user table ships with row-level
 * > security proven by graders before content flows.
 * > — AGENTS.md, Boundaries
 *
 * > **SHR-01** Everything a user stores SHALL default to private. Row-level
 * > security in the database enforces it; **no client-trusted checks**.
 * > — specs/002-montero-garage
 *
 * Three claims, which fail separately and are therefore graded separately:
 *
 * 1. **An anonymous client reads nothing private.** Not "reads a filtered
 *    view" — nothing.
 * 2. **Owner A cannot read, write, or enumerate owner B's data.** Read is the
 *    obvious one; write and enumerate are the ones that get forgotten. A
 *    policy that blocks `select` but not `update` lets a stranger publish
 *    your work-log. A policy with a correct `using` and no `with check` lets
 *    a stranger write rows *into* your garage — rows that every downstream
 *    view then renders as your own testimony (AGENTS.md, Facts).
 * 3. **A table with no policy grants no access.** Deny-by-default is a
 *    Postgres property, and the repo should hold a proof rather than an
 *    assumption — because the day someone adds a fifth table and forgets its
 *    policies, this decides whether that is a leak or an outage.
 *
 * ## Two tiers, and what each is allowed to claim
 *
 * The declaration suite reads T2-202's DDL and runs everywhere, forever. The
 * behavioural suite asks a real Postgres, as three real actors, and runs only
 * against a local `supabase start`. Neither substitutes for the other; the
 * full argument is in `harness.ts`.
 *
 * **Claim 3 is graded at the declaration tier only, and that is a known gap.**
 * Proving it behaviourally means creating a throwaway table at test time,
 * which needs a direct SQL connection rather than PostgREST — i.e. a Postgres
 * driver this repo does not carry. Named here rather than faked: a grader
 * that re-read the same SQL and called itself behavioural would be worse than
 * no grader.
 *
 * ## Expected-failure convention
 *
 * `it.fails` is the marker. T2-202 activates a grader by deleting exactly that
 * `.fails` — one marker line per test, nothing else to edit.
 *
 * refs specs/002-montero-garage (SHR-01, MIG-03, GAR-01′, GAR-02′, GAR-05′)
 */
import { describe, expect, it } from "vitest";
import {
  USER_TABLE_NAMES,
  testReceiptPath,
  testVehicleName,
} from "./contract.ts";
import {
  createOwnedFixture,
  deleteRows,
  detectLiveStack,
  insertRow,
  liveTitle,
  provisionScenario,
  rowCount,
  selectRows,
  stackOf,
  teardownScenario,
  updateRows,
} from "./harness.ts";
import { coveredCommands, userTablePolicyIssues } from "./rules.ts";
import { enablesRls, forcesRls, migrationSql, statements } from "./sql.ts";

const live = await detectLiveStack();

/* =========================================================================
 * Tier A — declaration
 * ====================================================================== */

describe("RLS is declared on every user table", () => {
  it.fails.each(USER_TABLE_NAMES.map((table) => [table]))(
    "public.%s has row level security enabled",
    (table) => {
      expect(enablesRls(migrationSql(), table)).toBe(true);
    }
  );

  it.fails.each(USER_TABLE_NAMES.map((table) => [table]))(
    "public.%s has row level security FORCED, not merely enabled",
    (table) => {
      // `enable` exempts the table's owner role, and Supabase migrations run
      // as that role. Without `force`, anything holding the owner connection
      // reads every user's data with no policy consulted at all. This is the
      // single most commonly missed line in a Supabase schema.
      expect(forcesRls(migrationSql(), table)).toBe(true);
    }
  );

  it.fails.each(USER_TABLE_NAMES.map((table) => [table]))(
    "every %s policy is owner-scoped in BOTH `using` and `with check`",
    (table) => {
      // The finding that rebuilt this file (T2-201 review, F1). The previous
      // version asked whether the policy *statement* contained the characters
      // `auth.uid()`, which a policy reading
      //   using (auth.uid() is not null) with check (owner_id = auth.uid())
      // satisfies while handing every logged-in user everybody's rows.
      //
      // `using` decides what you can see; `with check` decides what you can
      // write. They are graded separately, each must tie the row to the
      // caller by equality (not by mention), and every top-level `or` branch
      // must do so — because `or` is how a scoped predicate gets widened.
      //
      // The rule lives in rules.ts and is itself graded, against the review's
      // own leaking schemas, in reviewer-probes.test.ts.
      expect(userTablePolicyIssues(migrationSql(), [table])).toEqual([]);
    }
  );

  it.fails("grants no policy to anon or public on any user table", () => {
    // `roles.length === 0` counts as a leak on purpose: a `create policy`
    // with no `to` clause defaults to `public`, which includes `anon`.
    const leaks = userTablePolicyIssues(migrationSql(), [
      ...USER_TABLE_NAMES,
    ]).filter((issue) => issue.includes("granted to"));

    expect(leaks).toEqual([]);
  });

  it.fails(
    "covers select, insert, update, and delete on every user table",
    () => {
      // A table with only a `for select` policy is not readable by strangers —
      // and not writable by its owner either. More to the point, one with
      // select and update but no delete makes ACC-03's "a user SHALL be able
      // to delete their account" impossible to perform as the user.
      const missing: string[] = [];
      for (const table of USER_TABLE_NAMES) {
        const covered = coveredCommands(migrationSql(), table);
        for (const command of ["select", "insert", "update", "delete"]) {
          if (!covered.has(command)) missing.push(`${table}.${command}`);
        }
      }

      expect(missing).toEqual([]);
    }
  );
});

describe("deny-by-default is declared, not assumed", () => {
  it.fails("revokes anon's grants on the user tables", () => {
    // RLS filters rows; GRANT decides whether a role may reach the table at
    // all. Supabase's `anon` role ships with broad grants on `public`, so
    // "we wrote policies" is not the whole story — the revoke is what makes a
    // table that ships before its policies do an outage rather than a leak.
    const sql = migrationSql();
    const revokes = statements(sql).filter((statement) =>
      /^revoke\b[\s\S]*\bfrom\b[\s\S]*\banon\b/.test(statement)
    );

    expect(revokes.length).toBeGreaterThan(0);
  });

  it.fails("revokes future default privileges too", () => {
    // The revoke above covers the four tables that exist. This covers the
    // fifth one, written a year from now by someone who has not read this
    // file.
    expect(migrationSql()).toMatch(
      /alter default privileges[\s\S]*revoke[\s\S]*from [\s\S]*\b(anon|public)\b/
    );
  });
});

/* =========================================================================
 * Tier B — behavioural
 * ====================================================================== */

describe.skipIf(!live.available)(
  liveTitle("anonymous clients read nothing private", live),
  () => {
    it.fails.each(USER_TABLE_NAMES.map((table) => [table]))(
      "anon selects zero rows from %s even when rows exist",
      async (table) => {
        const scenario = await provisionScenario(stackOf(live));
        try {
          await createOwnedFixture(
            scenario,
            scenario.ownerA,
            testReceiptPath(scenario.ownerA.userId ?? "", "1")
          );

          const response = await selectRows(scenario, scenario.anon, table);

          // Either a refusal or an empty set is correct. A row is not.
          expect(rowCount(response)).toBe(0);
          expect(response.text).not.toContain(testVehicleName("a"));
        } finally {
          await teardownScenario(scenario);
        }
      }
    );

    it.fails("anon cannot insert a row it would then own", async () => {
      const scenario = await provisionScenario(stackOf(live));
      try {
        const response = await insertRow(scenario, scenario.anon, "vehicles", {
          owner_id: scenario.ownerA.userId,
          display_name: testVehicleName("anon"),
        });

        expect(response.ok).toBe(false);
        expect(response.status).toBeGreaterThanOrEqual(400);
      } finally {
        await teardownScenario(scenario);
      }
    });

    it.fails(
      "POSITIVE CONTROL: the same read succeeds for the owner",
      async () => {
        // Without this, every assertion above is satisfied by a database that
        // is simply broken, a bucket that does not exist, or a PostgREST that
        // 404s everything. "Nobody can read it" is only a security property
        // if somebody can.
        const scenario = await provisionScenario(stackOf(live));
        try {
          await createOwnedFixture(
            scenario,
            scenario.ownerA,
            testReceiptPath(scenario.ownerA.userId ?? "", "1")
          );

          const response = await selectRows(
            scenario,
            scenario.ownerA,
            "vehicles"
          );

          expect(response.ok).toBe(true);
          expect(rowCount(response)).toBe(1);
          expect(response.text).toContain(testVehicleName("a"));
        } finally {
          await teardownScenario(scenario);
        }
      }
    );
  }
);

describe.skipIf(!live.available)(
  liveTitle("owner A cannot reach owner B", live),
  () => {
    /**
     * The cross-user access matrix. Every cell is one grader, because every
     * cell is one policy clause that can be wrong on its own: `using` governs
     * read, update-visibility and delete; `with check` governs insert and the
     * post-image of update. A schema can get four of these right and the
     * fifth wrong, and only a table finds that.
     */
    const CROSS_USER_OPERATIONS = [
      ["read", "vehicles"],
      ["read", "records"],
      ["read", "receipts"],
      ["read", "profiles"],
      ["update", "vehicles"],
      ["update", "records"],
      ["update", "receipts"],
      ["delete", "vehicles"],
      ["delete", "records"],
      ["delete", "receipts"],
    ] as const;

    it.fails.each(CROSS_USER_OPERATIONS)(
      "owner B cannot %s owner A's %s",
      async (operation, table) => {
        const scenario = await provisionScenario(stackOf(live));
        try {
          const owned = await createOwnedFixture(
            scenario,
            scenario.ownerA,
            testReceiptPath(scenario.ownerA.userId ?? "", "1")
          );
          const id =
            table === "vehicles"
              ? owned.vehicleId
              : table === "records"
                ? owned.recordId
                : table === "receipts"
                  ? owned.receiptId
                  : (scenario.ownerA.userId ?? "");
          const query = `id=eq.${id}`;

          const response =
            operation === "read"
              ? await selectRows(scenario, scenario.ownerB, table, query)
              : operation === "update"
                ? await updateRows(scenario, scenario.ownerB, table, query, {
                    // Nothing schema-specific: the point is that the row does
                    // not move, not which column was aimed at.
                    id,
                  })
                : await deleteRows(scenario, scenario.ownerB, table, query);

          // Denied or invisible, never effective.
          expect(rowCount(response)).toBe(0);

          // And the row is still exactly as owner A left it.
          const asOwner = await selectRows(
            scenario,
            scenario.ownerA,
            table,
            query
          );
          expect(rowCount(asOwner)).toBe(1);
        } finally {
          await teardownScenario(scenario);
        }
      }
    );

    it.fails(
      "owner B cannot enumerate owner A's rows without naming them",
      async () => {
        // The graders above name a row id. Enumeration is the other shape of
        // the same leak: an unfiltered list.
        const scenario = await provisionScenario(stackOf(live));
        try {
          await createOwnedFixture(
            scenario,
            scenario.ownerA,
            testReceiptPath(scenario.ownerA.userId ?? "", "1")
          );

          const response = await selectRows(
            scenario,
            scenario.ownerB,
            "vehicles"
          );

          expect(rowCount(response)).toBe(0);
          expect(response.text).not.toContain(testVehicleName("a"));
        } finally {
          await teardownScenario(scenario);
        }
      }
    );

    it.fails("owner B cannot create a row belonging to owner A", async () => {
      // `with check`, specifically.
      const scenario = await provisionScenario(stackOf(live));
      try {
        const response = await insertRow(
          scenario,
          scenario.ownerB,
          "vehicles",
          {
            owner_id: scenario.ownerA.userId,
            display_name: testVehicleName("forged"),
          }
        );

        expect(response.ok).toBe(false);

        const asOwnerA = await selectRows(
          scenario,
          scenario.ownerA,
          "vehicles"
        );
        expect(asOwnerA.text).not.toContain(testVehicleName("forged"));
      } finally {
        await teardownScenario(scenario);
      }
    });

    it.fails("owner B cannot reassign their own row to owner A", async () => {
      // The other half of `with check`: an insert that is legal at write time,
      // followed by an update that walks it across the ownership boundary.
      const scenario = await provisionScenario(stackOf(live));
      try {
        const owned = await createOwnedFixture(
          scenario,
          scenario.ownerB,
          testReceiptPath(scenario.ownerB.userId ?? "", "1")
        );

        const response = await updateRows(
          scenario,
          scenario.ownerB,
          "vehicles",
          `id=eq.${owned.vehicleId}`,
          { owner_id: scenario.ownerA.userId }
        );

        expect(rowCount(response)).toBe(0);
      } finally {
        await teardownScenario(scenario);
      }
    });

    it.fails(
      "POSITIVE CONTROL: each owner reads their own row and only their own",
      async () => {
        const scenario = await provisionScenario(stackOf(live));
        try {
          await createOwnedFixture(
            scenario,
            scenario.ownerA,
            testReceiptPath(scenario.ownerA.userId ?? "", "1")
          );
          await createOwnedFixture(
            scenario,
            scenario.ownerB,
            testReceiptPath(scenario.ownerB.userId ?? "", "1")
          );

          const a = await selectRows(scenario, scenario.ownerA, "vehicles");
          const b = await selectRows(scenario, scenario.ownerB, "vehicles");

          expect(rowCount(a)).toBe(1);
          expect(rowCount(b)).toBe(1);
          expect(a.text).toContain(testVehicleName("a"));
          expect(b.text).toContain(testVehicleName("b"));
          expect(a.text).not.toContain(testVehicleName("b"));
        } finally {
          await teardownScenario(scenario);
        }
      }
    );
  }
);
