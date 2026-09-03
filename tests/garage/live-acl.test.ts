/**
 * Graders — **the ACL, asked of the running database.** Blind spot (a) from
 * the T2-202 review, closed by T2-401 [TEST].
 *
 * > every user table ships with row-level security proven by graders before
 * > content flows — AGENTS.md, Boundaries
 *
 * ## The hole this exists to close, in the order it happened
 *
 * T2-201 and T2-401a between them put 321 declaration graders on the schema.
 * They read migration **text**, so they can see every privilege somebody wrote
 * down — and the privilege that nearly shipped a hole was one **nobody
 * granted**:
 *
 * 1. Supabase's default privileges hand `authenticated` ALL on every new table
 *    in `public`. Nothing in the migration says so; it is the state a table is
 *    born in.
 * 2. `grant select, insert, update, delete on … to authenticated` **adds to**
 *    that ACL. It does not replace it. So the grant that looks like a
 *    narrowing is a no-op over a wider set.
 * 3. **RLS does not filter `TRUNCATE`.** `force row level security`, an
 *    owner-scoped policy in `using` and `with check`, every predicate rule in
 *    `rules.ts` — none of them is consulted.
 *
 * The reviewer emptied `public.profiles` as role `authenticated` against a
 * schema every declaration grader called clean. T2-202 fixed the schema
 * (revoke before grant, per table and in the default privileges). **Nothing
 * graded the fix**, which means a fifth table added later re-opens it in
 * silence — and `shares`, the table that holds bearer secrets, is the fifth
 * table.
 *
 * ## Why it cannot be written any other way
 *
 * Tier A cannot see a privilege nobody wrote down. Tier B's PostgREST client
 * has no `TRUNCATE` verb, so it cannot even attempt the attack. So this file
 * opens a direct connection (`db.ts`, loopback only, superuser) and asks two
 * questions the other tiers cannot:
 *
 * - **What does the ACL actually say**, read from `pg_class.relacl`?
 * - **What happens when `authenticated` actually tries it**, in a transaction
 *   that is always rolled back?
 *
 * Both, not either. The ACL read is the precise answer; the live attempt is the
 * one that cannot be fooled by a mistake in the ACL read.
 *
 * ## The forward-looking half
 *
 * The sweeps above answer for the tables that exist. The **birth probe** —
 * create a table inside a rolled-back transaction and look at the privileges it
 * was born with — answers for the table written a year from now by somebody who
 * has not read this file. That is the actual defect class: not "is `profiles`
 * safe today" but "does a new table inherit a hole".
 *
 * ## Tier
 *
 * Direct connection, gated on the same `GARAGE_LIVE` flag as Tier B, so
 * `npm test` and `npm run verify` skip it with a named reason and
 * `npm run test:garage` (and CI's informational `tier-b` job) run it.
 *
 * refs specs/002-montero-garage (SHR-01, SHR-05, MIG-03), AGENTS.md Boundaries
 */
import { describe, expect, it } from "vitest";
import {
  UNSHIPPED_USER_TABLES,
  SHIPPED_USER_TABLES,
  USER_TABLE_NAMES,
} from "./contract.ts";
import {
  DEFAULT_LOCAL_DB_URL,
  assertLocalDatabase,
  becomeRole,
  dbTitle,
  dbUrlOf,
  detectLiveDatabase,
  expectedMigrationVersions,
  inRolledBackTransaction,
  migrationIdentityIssue,
  openDatabase,
  privilegesOf,
  tableAcls,
  type DbSession,
} from "./db.ts";
import { NON_LOCAL_TARGET } from "./harness.ts";

const db = await detectLiveDatabase();

/** Exactly the four verbs the schema means `authenticated` to hold. */
const EXPECTED_AUTHENTICATED = ["delete", "insert", "select", "update"];

/** The roles that must hold nothing at all on a user table. */
const MUST_HOLD_NOTHING = ["anon", "public"] as const;

const SHIPPED = SHIPPED_USER_TABLES.map((table) => [table.name] as const);
const PENDING = UNSHIPPED_USER_TABLES.map(
  (table) => [table.name, table.pending ?? ""] as const
);

/** A table name no migration will ever create, for the "absent" case. */
const NO_SUCH_TABLE = "test_t2_401_no_such_table";

/**
 * A synthetic `auth.uid()` for the role probes.
 *
 * Never a real account: these graders need `authenticated` to *be* somebody,
 * not to own anything, and a fixture naming a plausible subject would be a
 * fixture that could one day match a real row.
 */
const TEST_SUBJECT = "00000000-0000-4000-8000-000000002401";

/** The throwaway table the birth and truncate probes create. Always rolled back. */
const PROBE_TABLE = "test_t2_401_acl_probe";

/** Open, run, close. One connection per grader; there are not many. */
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
 * The local-only guard. **Unmarked, and it needs no database.**
 *
 * This file connects as superuser. The guard is the only thing between that
 * and a real project, so it is graded against real hostnames the same way
 * `harness-contract.test.ts` grades `assertLocalTarget`.
 * ====================================================================== */

describe("assertLocalDatabase — a superuser connection cannot leave loopback", () => {
  it.each<[string, string]>([
    ["the CLI default", DEFAULT_LOCAL_DB_URL],
    [
      "localhost by name",
      "postgresql://postgres:postgres@localhost:54322/postgres",
    ],
    [
      "the postgres: scheme",
      "postgres://postgres:postgres@127.0.0.1:54322/postgres",
    ],
  ])("accepts %s", (_label, url) => {
    expect(() => assertLocalDatabase(url)).not.toThrow();
  });

  it.each<[string, string]>([
    [
      "a hosted Supabase database",
      "postgresql://u:p@db.abcdefghijklm.supabase.co:5432/postgres",
    ],
    [
      "the pooler",
      "postgresql://u:p@aws-0-us-east-1.pooler.supabase.com:5432/postgres",
    ],
    [
      "this site in production",
      "postgresql://u:p@monterogarage.com:5432/postgres",
    ],
    ["a private-range host", "postgresql://u:p@10.0.0.5:5432/postgres"],
    [
      "a host that merely starts local",
      "postgresql://u:p@localhost.evil.example:5432/x",
    ],
    [
      "an IP that merely starts 127",
      "postgresql://u:p@127.0.0.1.evil.example:5432/x",
    ],
    ["an http URL that is not Postgres at all", "http://127.0.0.1:54321"],
  ])("refuses %s", (_label, url) => {
    expect(() => assertLocalDatabase(url)).toThrow(NON_LOCAL_TARGET);
  });

  it("refuses something that is not a URL at all", () => {
    expect(() => assertLocalDatabase("not a url")).toThrow(NON_LOCAL_TARGET);
  });

  it("names the constitutional reason, not just a code", () => {
    // A guard that fails with "invalid host" teaches the next reader to add
    // their host to the list.
    expect(() =>
      assertLocalDatabase("postgresql://u:p@db.x.supabase.co:5432/postgres")
    ).toThrow(/never a production credential/);
  });
});

/* =========================================================================
 * The second guard: loopback is not the same question as "this project".
 * **Unmarked, and it needs no database.**
 * ====================================================================== */

describe("migrationIdentityIssue — the port is not the project", () => {
  // Found while writing this file, on this machine, and it is not a
  // hypothetical: an unrelated checkout held 54321/54322, so `supabase start`
  // brought monterogarage up on 56321/56322 — and a run against the *default*
  // URL read a stranger's schema. The ACL sweeps would have failed
  // confusingly. The PostgREST tier, which creates and deletes accounts, would
  // have done considerably worse than fail.
  const EXPECTED = ["20260830120000", "20260830120100"];

  it("accepts a database that has applied every migration", () => {
    expect(
      migrationIdentityIssue([...EXPECTED, "20270101000000"], EXPECTED)
    ).toBeNull();
  });

  it("refuses a database missing any of them", () => {
    const issue = migrationIdentityIssue(["20260830120000"], EXPECTED);

    expect(issue).toContain("NOT this project's");
    expect(issue).toContain("20260830120100");
  });

  it("refuses an empty ledger — a fresh stack is not this project either", () => {
    expect(migrationIdentityIssue([], EXPECTED)).toContain(
      "NOT this project's"
    );
  });

  it("refuses to identify anything when there are no migrations to match", () => {
    // The vacuity guard. With an empty expectation every database matches, so
    // the check would pass on the stranger's stack it exists to refuse.
    expect(migrationIdentityIssue(["anything"], [])).toContain(
      "nothing identifies this project"
    );
  });

  it("tells the reader what to do about it", () => {
    // A refusal that says only "wrong project" gets worked around by deleting
    // the check. This one names the fix.
    expect(migrationIdentityIssue([], EXPECTED)).toContain("SUPABASE_DB_URL");
  });

  it("reads real migration versions off the repo, not a hard-coded list", () => {
    const versions = expectedMigrationVersions();

    expect(versions.length).toBeGreaterThanOrEqual(5);
    for (const version of versions) expect(version).toMatch(/^\d{14}$/);
    expect([...versions]).toEqual([...versions].sort());
  });
});

/* =========================================================================
 * The ACL, read from the database. Unmarked — these are assertions about the
 * schema as it stands today, and they go red the day it loosens.
 * ====================================================================== */

describe.skipIf(!db.available)(
  dbTitle("the end-state ACL is what the migrations claim", db),
  () => {
    it.each(SHIPPED)(
      "public.%s: anon and public hold NOTHING",
      async (table) => {
        await withDatabase(async (session) => {
          const acls = await tableAcls(session);

          for (const role of MUST_HOLD_NOTHING) {
            const held = privilegesOf(acls, table, role);
            // `null` means the table is missing, which is a different failure
            // from "holds nothing" and must not read as a pass.
            expect(held, `public.${table} does not exist`).not.toBeNull();
            expect(held, `public.${table} / ${role}`).toEqual([]);
          }
        });
      }
    );

    it.each(SHIPPED)(
      "public.%s: authenticated holds EXACTLY select, insert, update, delete",
      async (table) => {
        // The whole finding, stated positively. `TRUNCATE` is the privilege
        // that matters — RLS does not filter it — but the assertion is an
        // equality rather than a `not.toContain("truncate")`, because
        // `REFERENCES`, `TRIGGER` and `MAINTAIN` are each a way to reach the
        // data or its shape and none of them is on the list either.
        await withDatabase(async (session) => {
          const acls = await tableAcls(session);
          const held = privilegesOf(acls, table, "authenticated");

          expect(held, `public.${table} does not exist`).not.toBeNull();
          expect(held, `public.${table} / authenticated`).toEqual(
            EXPECTED_AUTHENTICATED
          );
        });
      }
    );

    it("POSITIVE CONTROL: the probe can see privileges that ARE held", async () => {
      // Without this, every assertion above is satisfied by a query that
      // returns nothing — a typo in the schema name, a `relkind` filter that
      // excludes everything, a connection to the wrong database. "Nobody holds
      // it" is only a finding if the instrument can see somebody holding it.
      await withDatabase(async (session) => {
        const acls = await tableAcls(session);

        expect([...acls.keys()]).toEqual(
          expect.arrayContaining(SHIPPED_USER_TABLES.map((t) => t.name))
        );
        expect(privilegesOf(acls, "profiles", "authenticated")).toContain(
          "select"
        );
        expect(privilegesOf(acls, "profiles", "service_role")).toContain(
          "select"
        );
      });
    });

    it("UNKNOWN IS NOT ZERO: a missing table reads as null, not as []", async () => {
      // The distinction the whole file rests on. If `privilegesOf` coalesced a
      // missing table to "holds nothing", every sweep above would report a
      // confident green for a table that had been renamed out from under it.
      await withDatabase(async (session) => {
        const acls = await tableAcls(session);

        expect(privilegesOf(acls, NO_SUCH_TABLE, "anon")).toBeNull();
        expect(privilegesOf(acls, "profiles", "anon")).toEqual([]);
      });
    });

    it.fails.each(PENDING)(
      "public.%s: anon holds nothing and authenticated holds exactly four — pending %s",
      async (table) => {
        // The grants table joins this sweep the day it exists. Marked because
        // it does not exist yet, and the marker is what stops the sweep from
        // reading "clean" about a table that is simply absent.
        await withDatabase(async (session) => {
          const acls = await tableAcls(session);

          expect(privilegesOf(acls, table, "anon")).toEqual([]);
          expect(privilegesOf(acls, table, "public")).toEqual([]);
          expect(privilegesOf(acls, table, "authenticated")).toEqual(
            EXPECTED_AUTHENTICATED
          );
        });
      }
    );

    it("sweeps every enumerated user table, so the list is not decorative", () => {
      // A guard on the guard: if `SHIPPED` emptied, every `it.each` above
      // would register zero graders and this file would report green while
      // asking nothing at all.
      expect(SHIPPED.length).toBe(4);
      expect(SHIPPED.length + PENDING.length).toBe(USER_TABLE_NAMES.length);
    });
  }
);

/* =========================================================================
 * The attack itself, attempted. Unmarked.
 * ====================================================================== */

describe.skipIf(!db.available)(
  dbTitle("RLS does not filter TRUNCATE, so the GRANT has to", db),
  () => {
    it.each(SHIPPED)(
      "role authenticated cannot TRUNCATE public.%s",
      async (table) => {
        // The reviewer's exploit, run. Everything about this table is correct
        // by every declaration grader in the directory: RLS enabled, RLS
        // forced, an owner-scoped policy on all four commands. None of that is
        // consulted for a truncate — only the ACL is.
        await withDatabase((session) =>
          inRolledBackTransaction(session, async (tx) => {
            await becomeRole(tx, "authenticated", TEST_SUBJECT);

            await expect(
              tx.query(`truncate table public.${table}`)
            ).rejects.toThrow(/permission denied/i);
          })
        );
      }
    );

    it("POSITIVE CONTROL: role authenticated CAN still select", async () => {
      // Without this, "authenticated is refused" is equally satisfied by a
      // role that cannot reach the schema at all — which would mean the whole
      // application was broken and this file would call it a success.
      await withDatabase((session) =>
        inRolledBackTransaction(session, async (tx) => {
          await becomeRole(tx, "authenticated", TEST_SUBJECT);

          const rows = await tx.query("select id from public.profiles");
          expect(Array.isArray(rows)).toBe(true);
        })
      );
    });

    it("POSITIVE CONTROL: the truncate SUCCEEDS when the privilege is held", async () => {
      // The control that makes the refusals mean something. Same role, same
      // statement, same transaction machinery — the only difference is a
      // grant. If this failed, "permission denied" above would be evidence of
      // a broken harness rather than a correct ACL.
      await withDatabase((session) =>
        inRolledBackTransaction(session, async (tx) => {
          await tx.query(
            `create table public.${PROBE_TABLE} (id int primary key)`
          );
          await tx.query(
            `grant truncate on public.${PROBE_TABLE} to authenticated`
          );
          await becomeRole(tx, "authenticated", TEST_SUBJECT);

          await expect(
            tx.query(`truncate table public.${PROBE_TABLE}`)
          ).resolves.toBeDefined();
        })
      );
    });
  }
);

/* =========================================================================
 * The forward-looking half: what a NEW table is born holding. Unmarked.
 * ====================================================================== */

describe.skipIf(!db.available)(
  dbTitle("a table created tomorrow inherits no privilege", db),
  () => {
    it("a brand-new public table grants anon, public, and authenticated nothing", async () => {
      // The actual defect class. Not "is `profiles` safe" — T2-202 fixed that
      // by name, four times — but "does the *next* table inherit the hole".
      // Supabase's default privileges are what made the answer yes; T2-202's
      // `alter default privileges … revoke all on tables from anon, public,
      // authenticated` is what makes it no. Nothing graded that until here,
      // and it is the line most likely to be dropped by a future migration
      // that "cleans up unused statements".
      await withDatabase((session) =>
        inRolledBackTransaction(session, async (tx) => {
          await tx.query(
            `create table public.${PROBE_TABLE} (id int primary key)`
          );
          const acls = await tableAcls(tx);
          const born = acls.get(PROBE_TABLE);

          expect(born, "the probe table was not created").toBeDefined();
          for (const role of ["anon", "public", "authenticated"]) {
            expect(born?.byGrantee.get(role) ?? [], role).toEqual([]);
          }
        })
      );
    });

    it("POSITIVE CONTROL: the birth probe SEES a privilege when one is granted", async () => {
      // Same shape as the truncate control, and for the same reason: an
      // "inherits nothing" assertion is worthless if `tableAcls` cannot see a
      // privilege on a table created in this transaction at all.
      await withDatabase((session) =>
        inRolledBackTransaction(session, async (tx) => {
          await tx.query(
            `create table public.${PROBE_TABLE} (id int primary key)`
          );
          await tx.query(`grant select on public.${PROBE_TABLE} to anon`);
          const acls = await tableAcls(tx);

          expect(acls.get(PROBE_TABLE)?.byGrantee.get("anon")).toEqual([
            "select",
          ]);
        })
      );
    });

    it("the probe table does not survive the transaction", async () => {
      // The safety property of `inRolledBackTransaction`, asserted rather than
      // trusted. A probe that leaked its table would poison `ungradedTableIssues`
      // and every ACL sweep that ran after it, and the failure would look like
      // a completely different bug.
      await withDatabase(async (session) => {
        await inRolledBackTransaction(session, (tx) =>
          tx.query(`create table public.${PROBE_TABLE} (id int primary key)`)
        );

        const acls = await tableAcls(session);
        expect(acls.has(PROBE_TABLE)).toBe(false);
      });
    });
  }
);
