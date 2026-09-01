/**
 * Graders — CONTRACT 5: the sharing surface is a **function** surface, and it
 * is graded like one.
 *
 * > **SHR-01** … Enforcement has exactly **three** modes and no fourth:
 * > row-level security scoped to `auth.uid()`; the public visibility columns of
 * > SHR-02; and the typed grants of SHR-05, whose checks live in
 * > `security definer` functions inside the database.
 * > — specs/002-montero-garage §5, as amended 2026-08-31
 *
 * ## Why this file exists, and why it lands before the feature does
 *
 * Everything else in `tests/garage/` grades tables and policies, which was the
 * whole attack surface while every route to user data went through PostgREST
 * and RLS. SHR-07 puts a reader on the far side of the database with no
 * `auth.uid()` at all, and the architecture that serves it — recorded for
 * T2-404, and the only one that keeps `output: "static"` and keeps the service
 * key out of the repo — is a `security definer` function granted to `anon`.
 *
 * A definer function runs as its **owner**. RLS on the tables it reads is not
 * consulted. `force row level security`, `revoke all … from anon`, every
 * owner-scoped predicate `rules.ts` exists to enforce: none of it applies
 * inside that function body. Whatever the body checks is the entire access
 * control, and before this file the repo had no grader that could see inside
 * one. `grep -rn "security definer" tests/` returned a single hit and it was a
 * comment; a definer function granted to `anon` doing
 * `select * from public.records` produced **zero findings**, verified by
 * running the real graders against exactly that.
 *
 * That is the situation T2-201 was written to end. Landing the graders first is
 * the only way it does not get re-entered, so this file describes a surface
 * that does not exist yet.
 *
 * ## What each half of the file is doing
 *
 * **The unmarked half is live today and protects the repo now.** The deny
 * direction of the allow-list — *nothing* is reachable by an anonymous caller
 * — is true of today's migrations and must stay true through T2-404. So are
 * the `search_path` sweep, the end-state ACL, and the created-table sweep.
 * These are not expectations about the future; they are assertions about the
 * present, and they go red the day someone loosens them.
 *
 * **The marked half is the expected failure.** Nine `it.fails` markers, one
 * per line, each describing one property of the grant readers T2-404 ships.
 * They fail today with `not implemented: T2-404` — deliberately, so the marker
 * is honest about what it is waiting for rather than green because a regex
 * matched nothing.
 *
 * ## Where the rules themselves are proved
 *
 * Not here. A test that fails because a function is missing proves nothing
 * about the rule it would have applied, so every rule in this file is graded
 * against DDL with a known answer in `reviewer-probes.test.ts` — the wide-open
 * variant must be rejected and the correct variant accepted, and that corpus
 * has been mutation-tested by breaking each rule on purpose and confirming it
 * goes red. This file points the instrument at the repo; that file proves the
 * instrument works.
 *
 * ## Tier A only
 *
 * Everything here parses migration text. No Docker, no network, runs on the
 * merge path forever. The behavioural half — that a real anonymous PostgREST
 * client gets nothing, and that an expired token and a revoked token and an
 * unknown token are indistinguishable (SHR-08) — is T2-401's, and it needs a
 * running stack to be worth anything.
 *
 * refs specs/002-montero-garage (SHR-01, SHR-05, SHR-06, SHR-07, SHR-08)
 */
import { describe, expect, it } from "vitest";
import {
  ANONYMOUS_ROLES,
  EXEMPT_PUBLIC_TABLES,
  PRIVILEGED_FUNCTIONS,
  SHARE_READER_FUNCTIONS,
  SHARE_READER_NAMES,
  USER_TABLE_NAMES,
} from "./contract.ts";
import {
  anonFunctionAllowListIssues,
  anonSurfaceIssues,
  anonWriteIssues,
  definerSearchPathIssues,
  expiryCheckIssues,
  plaintextTokenColumnIssues,
  projectionIssues,
  revocationCheckIssues,
  tableGrantIssues,
  tokenHashIssues,
  ungradedTableIssues,
  viewGrantIssues,
} from "./rules.ts";
import {
  createdTables,
  functions,
  grants,
  migrationSql,
  privilegeVerdict,
  shareSeam,
  type FunctionDefinition,
} from "./sql.ts";

/**
 * The share readers, or the seam error naming the task that ships them.
 *
 * Every marked grader below goes through this, so each one fails with
 * `not implemented: T2-404` rather than with `undefined is not an object` —
 * the T2-201 discipline that makes an `it.fails` marker mean something.
 */
function requireShareReaders(): FunctionDefinition[] {
  const declared = functions(migrationSql());
  const found = SHARE_READER_NAMES.map((name) => ({
    name,
    routine: declared.find((routine) => routine.name === name) ?? null,
  }));
  const missing = found
    .filter((entry) => entry.routine === null)
    .map((entry) => entry.name);
  if (missing.length > 0) {
    throw shareSeam(
      `no function named ${missing.join(", ")} exists in supabase/migrations/`
    );
  }
  return found.map((entry) => entry.routine as FunctionDefinition);
}

/* =========================================================================
 * The instrument, pointed at the repo as it stands
 *
 * Unmarked. These are assertions about today's migrations, and they are the
 * positive control for every parser the marked half depends on: if
 * `functions()` silently stopped finding anything, the marked graders would
 * still report "expected failure" in exactly the same words.
 * ====================================================================== */

describe("the function parser reads the migrations that exist", () => {
  it("finds the account-lifecycle and auth routines by name", () => {
    const found = functions(migrationSql()).map((routine) => routine.name);

    // Named rather than counted: T2-404 adds routines, and a grader that
    // asserted "exactly five" would have to be edited by the task it exists
    // to constrain.
    for (const { name } of PRIVILEGED_FUNCTIONS) {
      expect(found, `missing ${name}`).toContain(name);
    }
  });

  it("reads the argument signature the way a GRANT spells it", () => {
    // `create function purge_expired_accounts(p_now timestamptz default now())`
    // is granted by `grant execute on function … (timestamptz)`. If those two
    // did not resolve to one identity, every ACL finding would be about a
    // routine that does not exist.
    const purge = functions(migrationSql()).find(
      (routine) => routine.name === "purge_expired_accounts"
    );

    expect(purge?.identity).toBe("public.purge_expired_accounts(timestamptz)");
  });

  it("distinguishes `security definer` from `security invoker`", () => {
    // If this collapsed, the search_path sweep below would be vacuous and
    // report green forever.
    const found = functions(migrationSql());
    const definers = found.filter((routine) => routine.securityDefiner);

    expect(definers.length).toBeGreaterThan(0);
    expect(found.length).toBeGreaterThan(definers.length);
    expect(definers.map((routine) => routine.name)).toContain(
      "request_account_deletion"
    );
    // ACC-01's password hook is `stable`, not `definer` — the invoker side.
    expect(definers.map((routine) => routine.name)).not.toContain(
      "deny_password_login"
    );
  });

  it("reads a body, not an empty string", () => {
    // A body-reading rule against an empty body is a rule that always passes.
    for (const routine of functions(migrationSql())) {
      expect(routine.body.length, routine.identity).toBeGreaterThan(0);
    }
  });
});

describe("every `security definer` routine pins its search path", () => {
  it("carries `set search_path = ''`", () => {
    // Codifies what T2-202 already does in all four of its functions. A
    // definer routine resolves unqualified names through the *caller's*
    // search path, so a caller who can create a schema can put their own
    // `records` ahead of `public.records` and have privileged code read it.
    expect(definerSearchPathIssues(migrationSql())).toEqual([]);
  });
});

/* =========================================================================
 * The closed allow-list
 * ====================================================================== */

describe("nothing an anonymous caller can execute is unaccounted for", () => {
  it("no routine outside the declared share readers is anon-executable", () => {
    // The deny half, and the half that is load-bearing *today*: it is true of
    // the current migrations and it is what T2-404 must not break. An
    // allow-list is only a guarantee when the complement is computed rather
    // than assumed — the standard `KNOWN_EXTERNAL_PROVIDERS` sets for auth
    // providers, applied to the function surface.
    //
    // "Executable" includes the case where the migration text simply does not
    // say: Postgres grants EXECUTE on a new function to PUBLIC by default, so
    // a routine nobody revoked is reachable by `anon` in the running database
    // while being silent in the file.
    expect(
      anonFunctionAllowListIssues(migrationSql(), SHARE_READER_NAMES).unexpected
    ).toEqual([]);
  });

  it.each(PRIVILEGED_FUNCTIONS.map((entry) => [entry.name, entry.why]))(
    "%s stays unreachable by an anonymous caller — %s",
    (name) => {
      // The enumerated deny half. The sweep above already catches these by
      // computing the complement; this names them, so the finding a reviewer
      // reads says which dangerous routine opened rather than "an unexpected
      // function". A name absent from the migrations is not a finding: this
      // asks what is true of the routines that exist.
      const state = grants(migrationSql());
      const matching = functions(migrationSql()).filter(
        (routine) => routine.name === name
      );

      for (const routine of matching) {
        for (const role of ANONYMOUS_ROLES) {
          expect(
            privilegeVerdict(state, routine.identity, role, "execute"),
            `${routine.identity} / ${role}`
          ).toBe("none");
        }
      }
    }
  );

  it("every anon-reachable routine satisfies the whole grant contract", () => {
    // The sweep that makes the rules apply to whatever T2-404 actually ships
    // rather than to the three names `contract.ts` currently guesses at.
    //
    // **Vacuous today**, because nothing is anon-reachable — and that vacuity
    // is not hidden: the `missing` half of the allow-list, marked below, is
    // red precisely until this sweep has something to say.
    expect(anonSurfaceIssues(migrationSql())).toEqual([]);
  });
});

/* =========================================================================
 * DEFECT FIX (1) — the end-state ACL
 * ====================================================================== */

describe("privileges are graded at the END of the directory", () => {
  it("leaves no anonymous privilege on any table that exists", () => {
    // Replaces a grader that counted `revoke … from anon` statements and
    // asserted the count was above zero (recorded defect, 2026-08-31). A
    // directory containing `revoke all on public.records from anon;` followed
    // by `grant select on public.records to anon;` scored 1 and passed.
    //
    // The table list is the union of what is *enumerated* and what is
    // *created*, so a fifth table cannot dodge the ACL question by not being
    // in the contract — which is the same hole defect (2) is about, reached
    // from the privilege side.
    const sql = migrationSql();
    const tables = [
      ...new Set([
        ...USER_TABLE_NAMES,
        ...createdTables(sql).map((table) => table.name),
      ]),
    ];

    expect(tableGrantIssues(sql, tables)).toEqual([]);
  });

  it("revokes future default privileges too", () => {
    // The revoke above covers the tables that exist. This covers the one
    // written a year from now by someone who has not read this file. Read
    // structurally from the replayed `alter default privileges` records
    // rather than by regex over the whole file, so a matching phrase in a
    // comment or an unrelated statement cannot satisfy it.
    const records = grants(migrationSql()).defaultPrivileges;
    const revoked = records.filter(
      (record) =>
        record.action === "revoke" &&
        record.roles.some((role) => ANONYMOUS_ROLES.includes(role as never))
    );

    expect(revoked.map((record) => record.objectType)).toEqual(
      expect.arrayContaining(["tables"])
    );
    expect(revoked.map((record) => record.objectType)).toEqual(
      expect.arrayContaining(["functions"])
    );
  });

  it("grants no view to an anonymous caller", () => {
    // A view is not a table and `createdTables` will not find it, but a view
    // over user data reachable by `anon` leaks exactly as hard. Vacuous until
    // the derived views land; free until then.
    expect(viewGrantIssues(migrationSql())).toEqual([]);
  });
});

/* =========================================================================
 * DEFECT FIX (2) — what exists, versus what is enumerated
 * ====================================================================== */

describe("every table that exists is a table some grader knows about", () => {
  it("creates no public table that is neither enumerated nor exempt", () => {
    // Recorded defect, 2026-08-31: nothing enumerated the tables that
    // actually exist. Every table-level grader is driven from `contract.ts`
    // and `userTablePolicyIssues` filters to `USER_TABLE_NAMES`, so a fifth
    // user table was invisible — a `shares` table with
    // `for all to anon using (true)` and no `force` produced zero findings.
    //
    // > every user table ships with row-level security proven by graders
    // > before content flows — AGENTS.md, Boundaries
    //
    // A guarantee about *every* user table cannot be driven off a hand-written
    // list of user tables.
    expect(ungradedTableIssues(migrationSql())).toEqual([]);
  });

  it("keeps the exemption map honest: every exemption carries a reason", () => {
    // The `EXEMPT_PAGES` standard from `check-hreflang.mjs`. Empty today and
    // deliberately so — in particular `shares` is *not* exempt, so when
    // T2-404 creates it this sweep goes red until T2-401 adds it to
    // `USER_TABLES`, which is the ordering the task list already encodes.
    for (const [table, reason] of EXEMPT_PUBLIC_TABLES) {
      expect(reason.trim(), `exemption for ${table}`).not.toBe("");
      expect(
        USER_TABLE_NAMES,
        `${table} is both exempt and enumerated`
      ).not.toContain(table);
    }
  });

  it("stores no share token in the clear, in any table", () => {
    // Swept over every created table rather than over a `shares` table this
    // file has not declared: the claim is that nothing anywhere holds a
    // bearer secret in plaintext. Vacuous today, and it starts paying the day
    // the grants table lands.
    expect(plaintextTokenColumnIssues(migrationSql())).toEqual([]);
  });
});

/* =========================================================================
 * The grant readers T2-404 ships — marked, one line each
 *
 * `it.fails` is the marker. T2-404 activates a grader by deleting exactly
 * that `.fails` and nothing else.
 * ====================================================================== */

describe("typed share grants (SHR-05..08)", () => {
  it.fails("every declared share reader exists in the migrations", () => {
    const declared = functions(migrationSql()).map((routine) => routine.name);
    const missing = SHARE_READER_FUNCTIONS.filter(
      (reader) => !declared.includes(reader.name)
    ).map(
      (reader) => `${reader.name} (${reader.requirement}): ${reader.purpose}`
    );

    expect(missing).toEqual([]);
  });

  it.fails("the anon-executable set EQUALS the declared share readers", () => {
    // The closed allow-list, completeness half. The deny half is unmarked
    // above and green; this is the direction that cannot be satisfied until a
    // reader exists and is granted. Both halves together are the equality.
    expect(
      anonFunctionAllowListIssues(migrationSql(), SHARE_READER_NAMES).missing
    ).toEqual([]);
  });

  it.fails("every share reader is `security definer`", () => {
    // Not a style preference: the caller has no `auth.uid()`, so an invoker
    // function would run as `anon` and be filtered by RLS to nothing. Definer
    // is what makes the surface work — and what makes everything below
    // mandatory rather than advisory.
    const invokers = requireShareReaders()
      .filter((routine) => !routine.securityDefiner)
      .map((routine) => routine.identity);

    expect(invokers).toEqual([]);
  });

  it.fails("every share reader carries `set search_path = ''`", () => {
    const issues = requireShareReaders()
      .filter(
        (routine) =>
          routine.searchPath === null ||
          !["''", "pg_catalog"].includes(routine.searchPath)
      )
      .map(
        (routine) => `${routine.identity}: search_path=${routine.searchPath}`
      );

    expect(issues).toEqual([]);
  });

  it.fails("TOKEN 1/3: compares a hash, never a plaintext token column", () => {
    // Three graders, not one, because they fail independently and for
    // different reasons. This one is about what a database leak costs: if the
    // row holds the token, reading the table is holding every live grant.
    expect(requireShareReaders().flatMap(tokenHashIssues)).toEqual([]);
  });

  it.fails("TOKEN 2/3: tests `expires_at`", () => {
    // SHR-08: "Every grant … SHALL carry an expiry." A column nobody reads is
    // not an expiry, it is a comment.
    expect(requireShareReaders().flatMap(expiryCheckIssues)).toEqual([]);
  });

  it.fails("TOKEN 3/3: tests `revoked_at`", () => {
    // The likeliest defect in the whole feature, and the reason the triple is
    // three findings. A reader that validates the hash and checks the expiry
    // and skips this is a grant that **cannot be revoked** — and it passes
    // every hand-test, because a grant you have not revoked behaves
    // identically either way. SHR-08 makes revocation unconditional:
    // "SHALL take effect on the next request and SHALL never be gated by
    // payment, by plan, or by any other condition."
    expect(requireShareReaders().flatMap(revocationCheckIssues)).toEqual([]);
  });

  it.fails("names its columns — no `select *`, no `setof` a user table", () => {
    // SHR-06: where a grant does not open costs, the data returned "SHALL
    // omit the cost fields entirely rather than blanking them at render
    // time". `select *` and `returns setof public.records` both make that
    // impossible: the shape is the table's shape, so every column the table
    // gains later is served to every grant holder with no diff in the
    // function at all. Column projection, not row projection.
    expect(requireShareReaders().flatMap(projectionIssues)).toEqual([]);
  });

  it.fails("the accountless path is read-only (SHR-07)", () => {
    // "WHILE a request carries no authenticated session, no grant SHALL admit
    // any write." Graded on the path rather than on the three names above —
    // see the unmarked sweep, which applies this to whatever is actually
    // reachable.
    expect(requireShareReaders().flatMap(anonWriteIssues)).toEqual([]);
  });
});
