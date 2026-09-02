/**
 * A direct Postgres connection for the graders that cannot be written any
 * other way — declared by T2-401 [TEST].
 *
 * ## Why this exists at all, when `harness.ts` already talks to the stack
 *
 * Everything in `harness.ts` goes through PostgREST, GoTrue, or the storage
 * API. That is the right instrument for almost everything here: it asks the
 * questions a real client asks, over the same wire, with the same roles. But
 * two properties the T2-202 review found are **invisible from that side**, and
 * both of them are security properties:
 *
 * 1. **An ACL is not a string in a file, and not a row PostgREST will show
 *    you.** Tier A reads migration *text*, so it can only see privileges
 *    somebody wrote down — and the privilege that nearly shipped a hole was
 *    one **nobody granted**. Supabase's default privileges hand
 *    `authenticated` ALL on every new table in `public`; `grant select,
 *    insert, update, delete` *adds to* that ACL rather than replacing it; and
 *    **RLS does not filter `TRUNCATE`**. The reviewer emptied `profiles` as
 *    role `authenticated` against a schema whose 321 declaration graders were
 *    green. Answering "who actually holds what, right now" means reading
 *    `pg_class.relacl` / `has_table_privilege`, and PostgREST exposes neither.
 *
 * 2. **`TRUNCATE` has no PostgREST verb.** The exploit itself cannot be
 *    attempted through the API surface at all. A grader that cannot attempt
 *    the attack cannot prove it fails.
 *
 * ## The safety posture is the same as `harness.ts`, deliberately
 *
 * `assertLocalDatabase` is `assertLocalTarget` for a `postgresql://` URL and
 * shares its host allow-list, because this file can do considerably more
 * damage than a PostgREST client can: it connects as `postgres`, which is
 * superuser on a local stack. **It must never be able to address anything but
 * loopback**, and the guard is graded against real hosts in
 * `harness-contract.test.ts`'s style, in `live-acl.test.ts`.
 *
 * Every probe that mutates anything runs inside a transaction that is **always
 * rolled back** — `inRolledBackTransaction` owns the `begin`/`rollback` pair so
 * no caller can forget it, and it rolls back on the failure path too. DDL is
 * transactional in Postgres, which is what makes "create a table and look at
 * the privileges it was born with" a safe question to ask.
 *
 * refs specs/002-montero-garage (SHR-01, SHR-05..09, MIG-03)
 */
import { readdirSync } from "node:fs";
import pg from "pg";
import { ALLOWED_LIVE_HOSTS, NON_LOCAL_TARGET } from "./harness.ts";
import { MIGRATIONS_DIR } from "./sql.ts";

/** The Supabase CLI's default local Postgres port and superuser credentials. */
export const DEFAULT_LOCAL_DB_URL =
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

/**
 * Throw unless `url` is a loopback Postgres URL.
 *
 * The same guarantee `assertLocalTarget` gives the HTTP harness, for a
 * connection that arrives as superuser. AGENTS.md: never a production
 * credential.
 */
export function assertLocalDatabase(url: string): void {
  let hostname: string;
  let protocol: string;
  try {
    const parsed = new URL(url);
    hostname = parsed.hostname;
    protocol = parsed.protocol;
  } catch {
    throw new Error(`${NON_LOCAL_TARGET}: ${url} is not a URL`);
  }
  if (protocol !== "postgres:" && protocol !== "postgresql:") {
    throw new Error(
      `${NON_LOCAL_TARGET}: ${protocol} is not a Postgres URL. T2-401's ACL ` +
        `probe connects as a superuser; it addresses \`supabase start\` on ` +
        `loopback and nothing else (AGENTS.md: never a production credential)`
    );
  }
  if (!(ALLOWED_LIVE_HOSTS as readonly string[]).includes(hostname)) {
    throw new Error(
      `${NON_LOCAL_TARGET}: ${hostname}. T2-401's ACL probe connects as a ` +
        `superuser and creates, truncates, and drops objects inside rolled-back ` +
        `transactions; it addresses \`supabase start\` on loopback and nothing ` +
        `else (AGENTS.md: never a production credential)`
    );
  }
}

/** Why the direct-connection tier is not running, in words a reader can act on. */
export const DB_SKIP_REASONS = {
  notEnabled:
    "GARAGE_LIVE is unset — the ACL probe needs a local Supabase stack " +
    "(`supabase start`, then `GARAGE_LIVE=1 npm test`)",
  unreachable:
    "GARAGE_LIVE is set but no Postgres answered on the local database URL",
  nonLocal:
    "SUPABASE_DB_URL points somewhere that is not loopback — refusing to run",
  wrongProject:
    "the database on that port is NOT this project's — refusing to run",
} as const;

/**
 * Whether the applied migrations identify this database as *this* project's,
 * or a sentence saying why not.
 *
 * ## Why loopback is not enough
 *
 * `assertLocalDatabase` answers "is this my machine". It does not answer "is
 * this my project", and on a developer machine those are different questions:
 * the Supabase CLI hands every project the same default ports, so **the stack
 * answering on 54322 is whichever project started first**. Observed while
 * writing this file — an unrelated project held 54321/54322 and the
 * monterogarage stack came up on 56321/56322, so a run with the default URL
 * would have probed a stranger's schema. The ACL assertions would have failed
 * confusingly; the PostgREST tier, which creates and *deletes* accounts, would
 * have done considerably worse.
 *
 * So the identity check is the migration ledger: a database that has not
 * applied this repo's migrations is not this repo's database, whatever port it
 * answers on.
 *
 * Pure and exported so it is graded directly, without a stack — the failure it
 * prevents is the one that only happens on somebody else's machine, which is
 * precisely the one an integration test will never reproduce.
 */
export function migrationIdentityIssue(
  applied: readonly string[],
  expected: readonly string[]
): string | null {
  if (expected.length === 0) {
    return "no migrations in supabase/migrations/ — nothing identifies this project";
  }
  const have = new Set(applied);
  const missing = expected.filter((version) => !have.has(version));
  if (missing.length === 0) return null;
  return (
    `${DB_SKIP_REASONS.wrongProject} (it has not applied ` +
    `${missing.join(", ")}). The Supabase CLI gives every project the same ` +
    `default ports, so the stack on this one may belong to another checkout — ` +
    `set SUPABASE_DB_URL to the port \`supabase status\` reports here`
  );
}

/** The migration versions this repo expects, newest last. */
export function expectedMigrationVersions(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith(".sql"))
    .map((name) => name.split("_")[0])
    .sort();
}

export type DbDecision =
  | { readonly available: true; readonly url: string }
  | { readonly available: false; readonly reason: string };

/**
 * Decide whether the direct-connection tier can run, without touching the
 * network unless someone asked for it by setting `GARAGE_LIVE`.
 *
 * Deliberately gated on the same `GARAGE_LIVE` flag as the PostgREST tier:
 * these are the same stack, and a second opt-in switch would be a second thing
 * to forget to turn on in CI.
 */
export async function detectLiveDatabase(
  env: NodeJS.ProcessEnv = process.env
): Promise<DbDecision> {
  if (env.GARAGE_LIVE !== "1") {
    return { available: false, reason: DB_SKIP_REASONS.notEnabled };
  }
  const url = env.SUPABASE_DB_URL ?? DEFAULT_LOCAL_DB_URL;
  try {
    assertLocalDatabase(url);
  } catch (error) {
    return {
      available: false,
      reason: `${DB_SKIP_REASONS.nonLocal}: ${(error as Error).message}`,
    };
  }
  let applied: string[];
  try {
    const probe = await openDatabase(url);
    try {
      const rows = await probe.query<{ version: string }>(
        "select version from supabase_migrations.schema_migrations"
      );
      applied = rows.map((row) => row.version);
    } finally {
      await probe.close();
    }
  } catch (error) {
    return {
      available: false,
      reason: `${DB_SKIP_REASONS.unreachable} (${url}: ${(error as Error).message})`,
    };
  }
  const wrongProject = migrationIdentityIssue(
    applied,
    expectedMigrationVersions()
  );
  if (wrongProject !== null) {
    return { available: false, reason: `${wrongProject} — ${url}` };
  }
  return { available: true, url };
}

/** The URL, for suites that only run when the database is there. */
export function dbUrlOf(decision: DbDecision): string {
  if (!decision.available) {
    throw new Error(`live database unavailable: ${decision.reason}`);
  }
  return decision.url;
}

/** The describe-block title for a direct-connection suite, skip reason included. */
export function dbTitle(title: string, decision: DbDecision): string {
  return decision.available
    ? `${title} [live db]`
    : `${title} [skipped: ${decision.reason}]`;
}

/** One open superuser connection. */
export interface DbSession {
  /**
   * Run a statement and return its rows.
   *
   * Throws on error rather than returning `[]`. "Unknown is not zero": a
   * grader that cannot tell a refused query from an empty result is a grader
   * that reports a confident, wrong "nothing here".
   */
  query<Row extends Record<string, unknown>>(
    text: string,
    values?: readonly unknown[]
  ): Promise<Row[]>;
  close(): Promise<void>;
}

/** Open one connection to a loopback Postgres. */
export async function openDatabase(
  url: string = DEFAULT_LOCAL_DB_URL
): Promise<DbSession> {
  assertLocalDatabase(url);
  const client = new pg.Client({
    connectionString: url,
    connectionTimeoutMillis: 5000,
    query_timeout: 15_000,
  });
  await client.connect();
  return {
    async query<Row extends Record<string, unknown>>(
      text: string,
      values: readonly unknown[] = []
    ): Promise<Row[]> {
      const result = await client.query(text, [...values]);
      return result.rows as Row[];
    },
    async close(): Promise<void> {
      await client.end();
    },
  };
}

/**
 * Run `body` inside a transaction that is **always** rolled back.
 *
 * The rollback is this function's job and not the caller's, on both the success
 * and the failure path, because the probes it exists for deliberately break
 * things: they create tables, drop policies, and disable row-level security to
 * prove what the schema is actually resting on. A probe that leaked one of
 * those changes would poison every grader that ran after it, and the failure
 * would look like a different bug entirely.
 */
export async function inRolledBackTransaction<T>(
  session: DbSession,
  body: (session: DbSession) => Promise<T>
): Promise<T> {
  await session.query("begin");
  // Fail fast rather than hang. These probes run beside the PostgREST tier,
  // which is writing to the same tables, so a probe that takes a heavy lock can
  // queue behind it — and a grader that blocks for the full query timeout
  // reports a confusing "current transaction is aborted" instead of "something
  // else holds this lock". Five seconds is far longer than any correct probe
  // here needs and far shorter than a reader's patience.
  await session.query("set local lock_timeout = '5s'");
  try {
    return await body(session);
  } finally {
    // `rollback` first, and the order is load-bearing. Half these probes
    // deliberately provoke a `permission denied`, which leaves the transaction
    // in the aborted state where Postgres answers every statement with
    // "current transaction is aborted" — every statement except `rollback`.
    // Resetting the role first therefore threw, and the throw replaced the
    // grader's real verdict with a confusing one about transaction state.
    // Verified: the four TRUNCATE probes all failed this way before the swap.
    await session.query("rollback");
    // Then belt and braces at session scope: `set local role` is undone by the
    // rollback, but a probe that used a plain `set role` would otherwise leave
    // the connection as `authenticated` for whatever ran next.
    await session.query("reset role");
  }
}

/**
 * Become `role`, with `sub` as the request's authenticated subject, for the
 * remainder of the current transaction.
 *
 * `set local` scopes both to the transaction, so `inRolledBackTransaction`
 * undoes them. `request.jwt.claims` is where Supabase's `auth.uid()` reads
 * from, so this is what makes "as owner B" mean the same thing to a policy
 * here as it does over PostgREST.
 */
export async function becomeRole(
  session: DbSession,
  role: "anon" | "authenticated" | "service_role",
  sub: string | null = null
): Promise<void> {
  const claims = sub === null ? { role } : { role, sub };
  await session.query("select set_config($1, $2, true)", [
    "request.jwt.claims",
    JSON.stringify(claims),
  ]);
  await session.query(`set local role ${role}`);
}

/* -------------------------------------------------------------------------
 * The ACL, read from the running database
 * ---------------------------------------------------------------------- */

/** The privileges one grantee holds on one relation, at this moment. */
export interface TableAcl {
  readonly table: string;
  /**
   * Lower-cased privilege names per grantee — `anon`, `authenticated`,
   * `public`, `service_role`, the owner. A grantee absent from the map holds
   * nothing **that was granted**; the table's owner always holds everything
   * implicitly and is reported under its own role name.
   */
  readonly byGrantee: ReadonlyMap<string, readonly string[]>;
}

interface AclRow extends Record<string, unknown> {
  readonly table_name: string;
  readonly grantee: string;
  readonly privilege_type: string;
}

/**
 * Every privilege every grantee holds on every base table in `schema`.
 *
 * Read from `pg_class.relacl` via `aclexplode` rather than from
 * `information_schema.role_table_grants`, for one reason: the information
 * schema shows only privileges the *current user* has some visibility into and
 * silently omits grants to roles it cannot see, which is exactly the shape of
 * silence this probe exists to refuse.
 *
 * Returns a map keyed by table name. **A table absent from the map does not
 * exist**, which is a different answer from "exists and grants nothing" — the
 * callers assert on the distinction rather than coalescing it (AGENTS.md: a
 * failure is not a zero).
 */
export async function tableAcls(
  session: DbSession,
  schema = "public"
): Promise<ReadonlyMap<string, TableAcl>> {
  const tables = await session.query<{ relname: string }>(
    `select c.relname
       from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = $1 and c.relkind = 'r'`,
    [schema]
  );
  const acls = await session.query<AclRow>(
    `select c.relname as table_name,
            case when a.grantee = 0 then 'public'
                 else pg_get_userbyid(a.grantee) end as grantee,
            lower(a.privilege_type) as privilege_type
       from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
       cross join lateral aclexplode(c.relacl) a
      where n.nspname = $1 and c.relkind = 'r'`,
    [schema]
  );

  const built = new Map<string, Map<string, string[]>>();
  for (const { relname } of tables) built.set(relname, new Map());
  for (const row of acls) {
    const table = built.get(row.table_name);
    if (!table) continue;
    const held = table.get(row.grantee) ?? [];
    held.push(row.privilege_type);
    table.set(row.grantee, held);
  }

  const result = new Map<string, TableAcl>();
  for (const [table, byGrantee] of built) {
    const frozen = new Map<string, readonly string[]>();
    for (const [grantee, privileges] of byGrantee) {
      frozen.set(grantee, [...privileges].sort());
    }
    result.set(table, { table, byGrantee: frozen });
  }
  return result;
}

/**
 * What `role` holds on `table`, or `null` when the table does not exist.
 *
 * `null` and `[]` are different answers and the callers treat them as such.
 */
export function privilegesOf(
  acls: ReadonlyMap<string, TableAcl>,
  table: string,
  role: string
): readonly string[] | null {
  const acl = acls.get(table);
  if (!acl) return null;
  return acl.byGrantee.get(role) ?? [];
}
