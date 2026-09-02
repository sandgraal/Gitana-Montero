/**
 * Graders — **blind spot (b): correlation is not a join.** Verified against a
 * running database by T2-401 [TEST], and the belief it was asked to verify
 * turned out to be false.
 *
 * ## What the T2-202 review recorded
 *
 * > `isOwnerScoped` judges whether a subquery *correlates*, not whether the
 * > correlation is **true**: a policy whose `exists` joins `on true` (or on the
 * > wrong pair of columns) passes Tier A intact, because the outer table's name
 * > does appear inside the subquery. What saved the shipped
 * > `records`/`receipts` policies is that RLS on `vehicles` applies *inside*
 * > the subquery as well, so a nonsense join still cannot reach another owner's
 * > row — defence that was inherited, not designed. Record it as **a property
 * > to verify rather than a property to rely on**.
 *
 * ## What verifying it showed (2026-09-02, local stack, this file)
 *
 * **The inherited defence does not exist.** With a mis-joined policy in place,
 * owner B read owner A's row. RLS on the parent table does apply inside the
 * subquery — and that is precisely why it leaks: the subquery is filtered to
 * *B's own* parents, so `exists (…)` collapses to "does B own anything at all",
 * which is true, so **every** child row satisfies the predicate.
 *
 * Four shapes, all proved here:
 *
 * | shape | Tier A | behaviour |
 * |---|---|---|
 * | `child.fk is not null and v.owner_id = auth.uid()` | **passes** | **leaks** |
 * | `child.fk is not null` (owner left to the parent's RLS) | rejected | leaks |
 * | `v.id = child.id` (wrong pair) | rejected | denies *everything* |
 * | `v.id = child.fk and v.owner_id = auth.uid()` (shipped) | passes | correct |
 *
 * The first row is the dangerous one: nothing in the repo could see it before
 * T2-401. `rules.ts`'s `subqueryCorrelationIssues` is the Tier A half of the
 * fix and this file is the behavioural half. **Both, deliberately** — the
 * declaration rule is what runs on every PR, and this is what proves the
 * declaration rule is describing reality rather than a belief about it.
 *
 * ## Where each half runs, and why they run on different tables
 *
 * The **denial** proofs run against `public.records` itself: they only insert
 * and read, so they are a statement about the shipped policy and nothing else.
 * The **leak** proofs run against a two-table replica created inside the
 * transaction, because `create policy` takes an ACCESS EXCLUSIVE lock and the
 * PostgREST suites are writing to `records` at the same time — the first
 * version queued behind them and died on the query timeout in a full Tier B
 * run. The replica is tied back to reality by an assertion that the shipped
 * policy still has the shape the replica mirrors.
 *
 * ## Why the leak is asserted rather than fixed
 *
 * These graders write the mis-joined policy on purpose and assert that it
 * leaks. That reads backwards until you see what it protects: the day somebody
 * "simplifies" the `records` policy by dropping the `v.id = records.vehicle_id`
 * line — because "RLS on vehicles already handles it" — this file is what says,
 * in the diff, that it does not. A property recorded as false is worth as much
 * as one recorded as true, and considerably more than one assumed.
 *
 * Everything runs inside a transaction that is always rolled back. No policy,
 * no user, and no row created here survives the grader that created it.
 *
 * refs specs/002-montero-garage (SHR-01, GAR-02′), T2-202 review blind spot (b)
 */
import { describe, expect, it } from "vitest";
import { SHIPPED_USER_TABLES } from "./contract.ts";
import {
  becomeRole,
  dbTitle,
  dbUrlOf,
  detectLiveDatabase,
  inRolledBackTransaction,
  openDatabase,
  type DbSession,
} from "./db.ts";
import { subqueryCorrelationIssues } from "./rules.ts";
import { migrationSql, normalizeSql } from "./sql.ts";

const db = await detectLiveDatabase();

/**
 * Two synthetic owners.
 *
 * Fixed uuids rather than random ones, so a failure message names a party
 * rather than a fresh v4 nobody can match to a line in this file. They are
 * nonsense addresses in an all-zero namespace and cannot collide with a real
 * `auth.users` row; everything they touch is rolled back regardless.
 */
const OWNER_A = "00000000-0000-4000-8000-0000024010aa";
const OWNER_B = "00000000-0000-4000-8000-0000024010bb";

const VEHICLE_A = "00000000-0000-4000-8000-00000000a001";
const VEHICLE_B = "00000000-0000-4000-8000-00000000b001";
const RECORD_A = "00000000-0000-4000-8000-00000000a002";
const RECORD_B = "00000000-0000-4000-8000-00000000b002";

/** The probe policy's name, so the rollback is not the only thing removing it. */
const PROBE_POLICY = "t2_401_misjoin_probe";

/**
 * Two owners, a vehicle each, a record each — created as the superuser inside
 * the caller's transaction.
 *
 * Deliberately **not** created through PostgREST like the rest of Tier B: these
 * graders alter policies, which needs the owner connection anyway, and mixing
 * an HTTP fixture into a transaction that must roll back would leave the rows
 * behind. `auth.users` gets the minimum GoTrue requires; the `handle_new_user`
 * trigger makes the profiles.
 */
async function seedTwoOwners(tx: DbSession): Promise<void> {
  for (const [id, slot] of [
    [OWNER_A, "a"],
    [OWNER_B, "b"],
  ]) {
    await tx.query(
      `insert into auth.users (id, instance_id, aud, role, email)
       values ($1, '00000000-0000-0000-0000-000000000000',
               'authenticated', 'authenticated', $2)`,
      [id, `test-t2-401-${slot}@t2-401.invalid`]
    );
  }
  await tx.query(
    `insert into public.vehicles (id, owner_id, display_name, generation_id)
     values ($1, $2, 'TEST-T2-401-VEHICLE-A', 'gen3'),
            ($3, $4, 'TEST-T2-401-VEHICLE-B', 'gen3')`,
    [VEHICLE_A, OWNER_A, VEHICLE_B, OWNER_B]
  );
  await tx.query(
    `insert into public.records (id, vehicle_id, occurred_on, kind)
     values ($1, $2, '2026-08-30', 'work'),
            ($3, $4, '2026-08-30', 'work')`,
    [RECORD_A, VEHICLE_A, RECORD_B, VEHICLE_B]
  );
}

/** The vehicle ids owner B can reach through `public.records`, as owner B. */
async function recordsVisibleToB(tx: DbSession): Promise<string[]> {
  await becomeRole(tx, "authenticated", OWNER_B);
  const rows = await tx.query<{ vehicle_id: string }>(
    "select vehicle_id from public.records order by vehicle_id"
  );
  await tx.query("reset role");
  return rows.map((row) => row.vehicle_id);
}

async function withDatabase<T>(
  body: (session: DbSession) => Promise<T>
): Promise<T> {
  const session = await openDatabase(dbUrlOf(db));
  try {
    return await body(session);
  } finally {
    await session.close();
  }
}

/* =========================================================================
 * Tier A — the rule that closes the blind spot. **Unmarked.**
 * ====================================================================== */

describe("subqueryCorrelationIssues — the declaration half", () => {
  const TABLES = SHIPPED_USER_TABLES.map((table) => table.name);

  it("the shipped policies join on the declared ownership column", () => {
    // Today's schema passes: `records` has `v.id = records.vehicle_id`,
    // `receipts` has `r.id = receipts.record_id`. The rule is additive — it
    // does not touch `isOwnerScoped`, the most load-bearing function in the
    // harness — so this is a new question asked of a schema that already
    // answers it.
    expect(subqueryCorrelationIssues(migrationSql(), TABLES)).toEqual([]);
  });

  it.each<[string, string]>([
    [
      "mentions the outer row without joining to it",
      `exists (select 1 from public.vehicles v
                where records.vehicle_id is not null
                  and v.owner_id = (select auth.uid()))`,
    ],
    [
      "joins on the wrong pair of columns",
      `exists (select 1 from public.vehicles v
                where v.id = records.id
                  and v.owner_id = (select auth.uid()))`,
    ],
    [
      "joins on nothing at all",
      `exists (select 1 from public.vehicles v
                where records.id is not null
                  and v.owner_id = (select auth.uid()))`,
    ],
  ])("rejects a policy that %s", (_label, predicate) => {
    const fixture = normalizeSql(`
      create policy "records owner all" on public.records
        for all to authenticated
        using (${predicate})
        with check (${predicate});
    `);

    expect(
      subqueryCorrelationIssues(fixture, ["records"]).length
    ).toBeGreaterThan(0);
  });

  it("POSITIVE CONTROL: accepts the correct join, in either operand order", () => {
    // Without this, every rejection above is satisfied by a rule that rejects
    // everything — the direction that gets a security rule deleted.
    for (const predicate of [
      `exists (select 1 from public.vehicles v
                where v.id = records.vehicle_id
                  and v.owner_id = (select auth.uid()))`,
      `exists (select 1 from public.vehicles v
                where records.vehicle_id = v.id
                  and v.owner_id = (select auth.uid()))`,
    ]) {
      const fixture = normalizeSql(`
        create policy "records owner all" on public.records
          for all to authenticated
          using (${predicate})
          with check (${predicate});
      `);

      expect(subqueryCorrelationIssues(fixture, ["records"])).toEqual([]);
    }
  });

  it("says nothing about a policy that compares the row itself", () => {
    // `vehicles` and `profiles` need no join at all. A rule that demanded one
    // would report a finding on the two simplest correct policies in the
    // schema, which is how it would get switched off within a day.
    const fixture = normalizeSql(`
      create policy "vehicles owner all" on public.vehicles
        for all to authenticated
        using ((select auth.uid()) = owner_id)
        with check ((select auth.uid()) = owner_id);
    `);

    expect(subqueryCorrelationIssues(fixture, ["vehicles"])).toEqual([]);
  });
});

/* =========================================================================
 * The behavioural half. **Unmarked** — these are facts about the database as
 * it stands, and the leak ones are facts about what would happen if the
 * shipped policy were loosened.
 * ====================================================================== */

describe.skipIf(!db.available)(
  dbTitle("the shipped policy denies across owners", db),
  () => {
    it("owner B reads only owner B's records", async () => {
      await withDatabase((session) =>
        inRolledBackTransaction(session, async (tx) => {
          await seedTwoOwners(tx);

          expect(await recordsVisibleToB(tx)).toEqual([VEHICLE_B]);
        })
      );
    });

    it("POSITIVE CONTROL: owner B's own record IS reachable", async () => {
      // The half that makes the denial meaningful. "B sees nothing of A's" is
      // equally satisfied by a policy that shows B nothing at all, which would
      // be a broken application rather than a secure one.
      await withDatabase((session) =>
        inRolledBackTransaction(session, async (tx) => {
          await seedTwoOwners(tx);
          const seen = await recordsVisibleToB(tx);

          expect(seen).toHaveLength(1);
          expect(seen).toContain(VEHICLE_B);
        })
      );
    });

    it("the fixture really does put a record on owner A's vehicle", async () => {
      // Read as the owner connection, with RLS off the table's owner by
      // `force`… so read it the honest way: as owner A. If A's record did not
      // exist, "B cannot see A's record" would be true of an empty table.
      await withDatabase((session) =>
        inRolledBackTransaction(session, async (tx) => {
          await seedTwoOwners(tx);
          await becomeRole(tx, "authenticated", OWNER_A);

          const rows = await tx.query<{ vehicle_id: string }>(
            "select vehicle_id from public.records"
          );
          await tx.query("reset role");

          expect(rows.map((row) => row.vehicle_id)).toEqual([VEHICLE_A]);
        })
      );
    });
  }
);

/* =========================================================================
 * The leak proofs, on a replica of the shipped shape.
 *
 * ## Why a replica and not `public.records` (found by running it)
 *
 * The first version added the mis-joined policy to `public.records` itself.
 * That works in isolation and **fails intermittently in a full Tier B run**:
 * `create policy` takes an ACCESS EXCLUSIVE lock on the table, and the
 * PostgREST suites are inserting into `records` at the same time, so the probe
 * queued behind them and died on the query timeout. Observed, not theorised.
 *
 * Two tables created inside the transaction reproduce the shipped shape
 * exactly — an owner-scoped parent, a child whose policy reaches the caller
 * only through an `exists` over that parent — take no lock anything else wants,
 * and need no `auth.users` rows at all. The tie back to reality is asserted
 * rather than assumed: `the replica mirrors the shipped policy` below compares
 * the correlation the replica uses against the one the migration ships.
 * ====================================================================== */

/** The replica pair. Created and dropped inside one rolled-back transaction. */
const REPLICA_PARENT = "test_t2_401_vehicles";
const REPLICA_CHILD = "test_t2_401_records";

/**
 * Build the replica with `predicate` as the child's read policy, and return the
 * parent ids owner B can reach through the child.
 */
async function replicaVisibleToB(
  tx: DbSession,
  predicate: string
): Promise<string[]> {
  await tx.query(
    `create table public.${REPLICA_PARENT} (
       id uuid primary key,
       owner_id uuid not null
     )`
  );
  await tx.query(
    `create table public.${REPLICA_CHILD} (
       id uuid primary key,
       vehicle_id uuid not null references public.${REPLICA_PARENT} (id)
     )`
  );
  for (const table of [REPLICA_PARENT, REPLICA_CHILD]) {
    await tx.query(`alter table public.${table} enable row level security`);
    await tx.query(`alter table public.${table} force row level security`);
    await tx.query(`grant select on public.${table} to authenticated`);
  }
  // The parent is owner-scoped exactly as `public.vehicles` is.
  await tx.query(
    `create policy ${PROBE_POLICY}_parent on public.${REPLICA_PARENT}
       for select to authenticated
       using ((select auth.uid()) = owner_id)`
  );
  await tx.query(
    `create policy ${PROBE_POLICY} on public.${REPLICA_CHILD}
       for select to authenticated using (${predicate})`
  );

  await tx.query(
    `insert into public.${REPLICA_PARENT} (id, owner_id)
     values ($1, $2), ($3, $4)`,
    [VEHICLE_A, OWNER_A, VEHICLE_B, OWNER_B]
  );
  await tx.query(
    `insert into public.${REPLICA_CHILD} (id, vehicle_id)
     values ($1, $2), ($3, $4)`,
    [RECORD_A, VEHICLE_A, RECORD_B, VEHICLE_B]
  );

  await becomeRole(tx, "authenticated", OWNER_B);
  const rows = await tx.query<{ vehicle_id: string }>(
    `select vehicle_id from public.${REPLICA_CHILD} order by vehicle_id`
  );
  await tx.query("reset role");
  return rows.map((row) => row.vehicle_id);
}

/** The child predicate, with `<parent>` and `<child>` filled in. */
function predicate(template: string): string {
  return template
    .replaceAll("<parent>", `public.${REPLICA_PARENT}`)
    .replaceAll("<child>", REPLICA_CHILD);
}

describe.skipIf(!db.available)(
  dbTitle("a mis-joined policy LEAKS — the inherited defence is a myth", db),
  () => {
    it("the replica mirrors the shipped policy, so its verdicts transfer", () => {
      // The tie back to reality. If `public.records`' policy stopped being an
      // `exists` over an owner-scoped parent, every result below would be about
      // a shape the schema no longer uses — and would keep reporting green.
      const sql = migrationSql();

      expect(sql).toContain("v.id = records.vehicle_id");
      expect(sql).toContain("v.owner_id = (select auth.uid())");
      expect(subqueryCorrelationIssues(sql, ["records", "receipts"])).toEqual(
        []
      );
    });

    it("POSITIVE CONTROL: the CORRECT replica policy denies across owners", async () => {
      // Same construction, same fixtures, correct join. Without this, every
      // leak below could be an artefact of the replica rather than of the
      // predicate — a missing grant, a table with no rows, a role that cannot
      // read anything.
      await withDatabase((session) =>
        inRolledBackTransaction(session, async (tx) => {
          const seen = await replicaVisibleToB(
            tx,
            predicate(
              `exists (select 1 from <parent> v
                        where v.id = <child>.vehicle_id
                          and v.owner_id = (select auth.uid()))`
            )
          );

          expect(seen).toEqual([VEHICLE_B]);
        })
      );
    });

    it.each<[string, string]>([
      [
        "textual correlation with an owner comparison (Tier A passes this)",
        `exists (select 1 from <parent> v
                  where <child>.vehicle_id is not null
                    and v.owner_id = (select auth.uid()))`,
      ],
      [
        "the review's literal shape: owner left to the parent's own RLS",
        `exists (select 1 from <parent> v
                  where <child>.vehicle_id is not null)`,
      ],
    ])(
      "owner B reads owner A's row through a policy that %s",
      async (_label, template) => {
        // The verification the T2-202 review asked for, and the answer is not
        // the one it expected. RLS on the parent *does* filter the subquery to
        // B's own rows — which is exactly why it leaks: `exists` degenerates
        // into "does B own anything at all", true for every child row.
        //
        // Asserted as a leak on purpose. This is the grader that argues with
        // whoever next proposes dropping `v.id = records.vehicle_id` because
        // "RLS on vehicles already handles it".
        await withDatabase((session) =>
          inRolledBackTransaction(session, async (tx) => {
            const seen = await replicaVisibleToB(tx, predicate(template));

            expect(seen).toEqual([VEHICLE_A, VEHICLE_B]);
          })
        );
      }
    );

    it("a policy joined on the WRONG columns denies EVERYTHING, including your own", async () => {
      // `v.id = <child>.id` is a join, just not the right one, and the third
      // possible outcome: it does not leak, it breaks. No parent id equals a
      // child id, so `exists` is false for every row and owner B cannot read
      // **their own**.
      //
      // Worth its own grader because it is the shape that would be dismissed as
      // safe — "it denies, therefore it is fine". It denies the way an outage
      // denies. Tier A's `subqueryCorrelationIssues` rejects it on its own
      // merits, which is the only place either failure mode is caught before
      // somebody notices their garage is empty.
      await withDatabase((session) =>
        inRolledBackTransaction(session, async (tx) => {
          const seen = await replicaVisibleToB(
            tx,
            predicate(
              `exists (select 1 from <parent> v
                        where v.id = <child>.id
                          and v.owner_id = (select auth.uid()))`
            )
          );

          expect(seen).toEqual([]);
        })
      );
    });

    it("no probe object survives its transaction", async () => {
      // A leaked replica table would land in `createdRelations`' blind spot and
      // in `live-acl.test.ts`'s ACL sweep, and the failure would look like a
      // completely different bug.
      await withDatabase(async (session) => {
        await inRolledBackTransaction(session, (tx) =>
          replicaVisibleToB(
            tx,
            predicate(
              `exists (select 1 from <parent> v where v.id = <child>.vehicle_id)`
            )
          )
        );

        const rows = await session.query<{ relname: string }>(
          `select c.relname from pg_class c
             join pg_namespace n on n.oid = c.relnamespace
            where n.nspname = 'public' and c.relname like 'test\\_t2\\_401\\_%'`
        );
        expect(rows.map((row) => row.relname)).toEqual([]);
      });
    });
  }
);
