/**
 * Reviewer-derived regression fixtures. **Nothing here is marked.**
 *
 * The T2-201 review defeated the first version of the declaration tier by
 * writing DDL rather than by reading the graders: three wide-open schemas
 * passed the entire merge-blocking proof, and five correctly-spelled schemas
 * were rejected. The graders were measuring string similarity to an imagined
 * implementation and calling it row-level security.
 *
 * Those schemas live here now, as a corpus with a known answer:
 *
 * - **WIDE-OPEN variants must be rejected.** Each one leaks, and each one is
 *   written the way somebody would actually write it while believing it was
 *   safe. Every one of them passed before.
 * - **CORRECT variants must be accepted.** Each is valid Postgres that a
 *   reasonable schema would use, and every one of them failed before.
 *
 * This suite grades `rules.ts` and `sql.ts` — the instrument — against DDL
 * whose verdict is known, so it runs and passes today with no Supabase
 * anywhere. It is what stops this finding class from coming back: the next
 * person to loosen a predicate rule has to make a leak pass here first.
 *
 * The fixtures are deliberately minimal. Each isolates the one property under
 * test rather than being a whole schema, because a probe that fails for six
 * reasons proves nothing about any of them.
 *
 * ## The corpus was itself found wanting, and mutation-tested since
 *
 * The confirm review mutation-tested this file and found the load-bearing
 * rule — that a comparand must be *found*, not merely a mention — was pinned
 * by nothing here (R5). Reintroducing that bug failed only the unit tests of
 * `authUidComparands`; every end-to-end DDL probe stayed green, because P1 and
 * P4 are both caught by *other* rules (the tautology list, the path-extraction
 * requirement) before the equality rule is ever reached. A corpus that only
 * exercises the rules it happens to reach first is a corpus with holes in it.
 *
 * N11 and N12 exist to close that: neither is tautological, neither is a
 * storage policy, so **nothing but the equality rule can reject them**.
 * Re-running the mutation now fails 4 end-to-end probes instead of 0.
 *
 * Same treatment for the two rules added in that round — N4 is the only thing
 * standing between `isCorrelated` and silence (D1), and N3 the only thing
 * watching `alter policy` (D2). Each was verified by breaking its rule on
 * purpose and confirming this file goes red.
 *
 * refs specs/002-montero-garage (SHR-01, SHR-03, GAR-02′, GAR-05′, ACC-03)
 */
import { describe, expect, it } from "vitest";
import { RECEIPTS_BUCKET, USER_TABLE_NAMES } from "./contract.ts";
import {
  anonExecutableFunctions,
  anonFunctionAllowListIssues,
  anonSurfaceIssues,
  anonWriteIssues,
  authUidComparands,
  bucketPolicyIssues,
  bucketPrivacyIssues,
  definerSearchPathIssues,
  effectiveCheck,
  expiryCheckIssues,
  isCorrelated,
  isOptionalColumn,
  isOwnerScoped,
  isTautological,
  plaintextTokenColumnIssues,
  projectionIssues,
  revocationCheckIssues,
  rowAliases,
  splitTopLevel,
  storagePolicyIssues,
  stripSubqueries,
  subqueryTables,
  tableGrantIssues,
  tokenHashIssues,
  ungradedTableIssues,
  userTablePolicyIssues,
  viewSecurityInvokerIssues,
} from "./rules.ts";
import {
  canonicalArgumentTypes,
  columnDefinition,
  createTableBody,
  createdTables,
  dollarTagAt,
  enablesRls,
  foreignKeyFor,
  forcesRls,
  functions,
  grants,
  isNotNullFor,
  normalizeSql,
  policies,
  privilegeVerdict,
  representsAbsence,
  rolePrivileges,
  statements,
  type FunctionDefinition,
} from "./sql.ts";

const sql = (text: string) => normalizeSql(text);

/* =========================================================================
 * A. Wide-open schemas that MUST be rejected
 * ====================================================================== */

/**
 * P1 — the finding that started it. A correct `with check` covering for a
 * `using` that hands every logged-in user everybody's rows. 164 graders
 * passed on this.
 */
const P1_USING_ANY_LOGGED_IN = sql(`
  create policy "records are owner-only" on public.records
    for all to authenticated
    using (auth.uid() is not null)
    with check (vehicle_id in (select id from vehicles where owner_id = auth.uid()));
`);

/** P2 — a tautology that is not spelled `true`. */
const P2_ONE_EQUALS_ONE = sql(`
  create policy "vehicles are owner-only" on public.vehicles
    for all to authenticated
    using (1 = 1);
`);

/** P3 — a scoped predicate widened by an `or` branch nobody reads to the end of. */
const P3_OR_WIDENED = sql(`
  create policy "vehicles are owner-only" on public.vehicles
    for all to authenticated
    using (owner_id = auth.uid() or auth.role() = 'authenticated');
`);

/** P4 — F2: storage scoped by bucket and session, never by path. */
const P4_STORAGE_NO_PATH = sql(`
  create policy "receipts are owner-only" on storage.objects
    for select to authenticated
    using (bucket_id = 'receipts' and auth.uid() is not null);
`);

/** P5 — F5: the bucket created private, then quietly flipped later. */
const P5_BUCKET_FLIPPED_LATER = sql(`
  insert into storage.buckets (id, name, public) values ('receipts', 'receipts', false);
  update storage.buckets set public = true where id = 'receipts';
`);

/** P6 — F5: the value before the name, which the old regex could not see. */
const P6_BUCKET_PUBLIC_REVERSED = sql(`
  insert into storage.buckets (public, id, name) values (true, 'receipts', 'receipts');
`);

/** P7 — a write policy with no ownership check at all on the new row. */
const P7_INSERT_UNCHECKED = sql(`
  create policy "anyone may write" on public.vehicles
    for insert to authenticated
    with check (true);
`);

/**
 * N3 — a follow-up migration reopens F1 with `alter policy`.
 *
 * The `create` is impeccable. The database at the end of the directory is
 * wide open. A grader that reads only `create policy` reports green
 * (confirm review, D2).
 */
const N3_ALTER_POLICY_REOPENS = sql(`
  create policy "records are owner-only" on public.records
    for all to authenticated
    using (exists (
      select 1 from public.vehicles v
      where v.id = records.vehicle_id and v.owner_id = auth.uid()
    ));

  alter policy "records are owner-only" on public.records
    using (true);
`);

/**
 * N4 — an UNCORRELATED exists: own any vehicle, read everyone's records.
 *
 * Contains a real `owner_id = auth.uid()` equality and is not a tautology, so
 * every rule except correlation is satisfied. What is missing is the join back
 * to the outer row (confirm review, D1).
 */
const N4_UNCORRELATED_EXISTS = sql(`
  create policy "records are owner-only" on public.records
    for all to authenticated
    using (exists (
      select 1 from public.vehicles v where v.owner_id = auth.uid()
    ));
`);

/**
 * N11 — mentions `auth.uid()` without ever comparing it, in a conjunction the
 * tautology list cannot reach.
 *
 * **This probe exists to pin the equality rule itself** (confirm review, R5).
 * Mutation-testing the corpus showed the load-bearing rule — that a comparand
 * must be found, not merely a mention — was graded only by unit tests of the
 * helper: reintroducing the bug there left every end-to-end probe green.
 * `deleted_at is null` is not tautological, so `isTautological` returns false
 * for the conjunction, and the path-extraction rule does not apply to a table.
 * Nothing but the equality rule can reject this.
 */
const N11_MENTION_NOT_EQUALITY = sql(`
  create policy "vehicles are owner-only" on public.vehicles
    for all to authenticated
    using (display_name is not null and auth.uid() is not null);
`);

/** N12 — the same, hidden inside a function call rather than a comparison. */
const N12_MENTION_IN_FUNCTION = sql(`
  create policy "vehicles are owner-only" on public.vehicles
    for all to authenticated
    using (coalesce(auth.uid(), owner_id) is not null and model_year > 1982);
`);

/**
 * N13 — the reviewer's **P1**: an uncorrelated `exists` wearing a self-join.
 *
 * The shared-name hole T2-201 recorded and T2-202 closed. `isCorrelated`
 * accepts the unqualified back-reference spelling by matching the outer
 * table's column *names*; `records` and `vehicles` share `{id, odometer_km}`,
 * so a bare `id` inside a subquery over `vehicles` used to read as a
 * back-reference to `records.id` when Postgres resolves it inward to
 * `v.id` — `id = id` is a self-join on the inner table and correlates with
 * nothing.
 *
 * Everything else about this policy is impeccable: real equality, real
 * `auth.uid()`, no tautology, not storage. Only the correlation rule can
 * reject it, and only the *tightened* one can.
 */
const N13_SHARED_NAME_SELF_JOIN = sql(`
  create policy "records are owner-only" on public.records
    for all to authenticated
    using (exists (
      select 1 from public.vehicles v where id = id and v.owner_id = auth.uid()
    ));
`);

/**
 * N14 — the reviewer's **P2**: the same hole through an ordinary predicate.
 *
 * `odometer_km` is the other name the two tables share. Bare, inside a
 * subquery over `vehicles`, it resolves to `v.odometer_km` and never to the
 * record's — so "own any truck with an odometer reading, read everyone's
 * records". Kept separate from N13 because it is a *plausible* predicate
 * rather than an obvious tell: nobody writes `id = id` by accident, and
 * plenty of people write a range filter.
 */
const N14_SHARED_NAME_PREDICATE = sql(`
  create policy "records are owner-only" on public.records
    for all to authenticated
    using (exists (
      select 1 from public.vehicles v
      where odometer_km > 0 and v.owner_id = auth.uid()
    ));
`);

/**
 * N16 — a second bucket policed for reads only.
 *
 * Hoisted to module scope so the sweep below can reach it: the per-bucket rule
 * was the newest in the file and the only one with no sweep coverage at all
 * (T2-301a review, F4).
 */
const N16_BUCKET_READ_ONLY = sql(`
  create policy "photos owner select" on storage.objects
    for select to authenticated
    using (
      bucket_id = 'vehicle-photos'
      and (storage.foldername(name))[1] = (select auth.uid())::text
    );
`);

/** N17 — a second bucket scoped by bucket id and session, never by path. */
const N17_BUCKET_NO_PATH = sql(`
  create policy "photos any user" on storage.objects
    for all to authenticated
    using (bucket_id = 'vehicle-photos' and auth.uid() is not null)
    with check (bucket_id = 'vehicle-photos' and auth.uid() is not null);
`);

describe("WIDE-OPEN: schemas that leak must be rejected", () => {
  it("P1 rejects a wide-open `using` behind a correct `with check`", () => {
    const issues = userTablePolicyIssues(P1_USING_ANY_LOGGED_IN, ["records"]);

    expect(issues.join(" | ")).toContain("`using` is not owner-scoped");
  });

  it("P1: the `with check` half is correctly recognised as fine", () => {
    // The point is that the two clauses are judged separately. If this also
    // reported an issue, the grader would be right by accident.
    const [policy] = policies(P1_USING_ANY_LOGGED_IN);

    expect(isOwnerScoped(policy.withCheckExpr)).toBe(true);
    expect(isOwnerScoped(policy.usingExpr)).toBe(false);
  });

  it("P2 rejects `1 = 1`", () => {
    expect(
      userTablePolicyIssues(P2_ONE_EQUALS_ONE, ["vehicles"]).join(" | ")
    ).toContain("not owner-scoped");
  });

  it("P3 rejects a scoped predicate widened by `or`", () => {
    expect(
      userTablePolicyIssues(P3_OR_WIDENED, ["vehicles"]).join(" | ")
    ).toContain("not owner-scoped");
  });

  it("P4 rejects a storage policy that never reads the object path", () => {
    expect(storagePolicyIssues(P4_STORAGE_NO_PATH).join(" | ")).toContain(
      "not owner-scoped"
    );
  });

  it("P5 rejects a bucket flipped public by a later migration", () => {
    expect(
      bucketPrivacyIssues(P5_BUCKET_FLIPPED_LATER, RECEIPTS_BUCKET).join(" | ")
    ).toContain("public");
  });

  it("P6 rejects a public bucket whose columns are in an unexpected order", () => {
    expect(
      bucketPrivacyIssues(P6_BUCKET_PUBLIC_REVERSED, RECEIPTS_BUCKET).length
    ).toBeGreaterThan(0);
  });

  it("P7 rejects an unconditional `with check`", () => {
    expect(
      userTablePolicyIssues(P7_INSERT_UNCHECKED, ["vehicles"]).join(" | ")
    ).toContain("`with check` is not owner-scoped");
  });

  it("N3 rejects a policy reopened by a later `alter policy`", () => {
    expect(
      userTablePolicyIssues(N3_ALTER_POLICY_REOPENS, ["records"]).join(" | ")
    ).toContain("not owner-scoped");
  });

  it("N3: the CREATE on its own would have been fine", () => {
    // Proving the finding is about the ALTER and not about a parser that
    // stopped understanding the original policy.
    const createOnly = N3_ALTER_POLICY_REOPENS.slice(
      0,
      N3_ALTER_POLICY_REOPENS.indexOf("alter policy")
    );

    expect(userTablePolicyIssues(createOnly, ["records"])).toEqual([]);
  });

  it("N3: a dropped policy leaves the table uncovered, not silently passing", () => {
    const dropped = sql(`
      create policy "records are owner-only" on public.records
        for all to authenticated using (owner_id = auth.uid());
      drop policy "records are owner-only" on public.records;
    `);

    expect(userTablePolicyIssues(dropped, ["records"])).toEqual([
      "records: no policy at all",
    ]);
  });

  it("N4 rejects an UNCORRELATED exists — own any, read all", () => {
    expect(
      userTablePolicyIssues(N4_UNCORRELATED_EXISTS, ["records"]).join(" | ")
    ).toContain("not owner-scoped");
  });

  it("N4 vs C8: correlation is the ONLY difference between them", () => {
    // Both subqueries contain `v.owner_id = auth.uid()`. Only one joins back
    // to the outer row. If this pair ever agrees, the D1 rule has stopped
    // doing anything.
    expect(
      userTablePolicyIssues(N4_UNCORRELATED_EXISTS, ["records"]).length
    ).toBeGreaterThan(0);
    expect(userTablePolicyIssues(C8_NESTED_OWNERSHIP, ["records"])).toEqual([]);
  });

  it("N11 rejects a MENTION of auth.uid() that is never an equality", () => {
    // The probe that pins the equality rule end-to-end (R5). Not a tautology,
    // not a storage policy: nothing else in the ruleset can reject it.
    expect(
      userTablePolicyIssues(N11_MENTION_NOT_EQUALITY, ["vehicles"]).join(" | ")
    ).toContain("not owner-scoped");
  });

  it("N12 rejects auth.uid() buried in a function call", () => {
    expect(
      userTablePolicyIssues(N12_MENTION_IN_FUNCTION, ["vehicles"]).join(" | ")
    ).toContain("not owner-scoped");
  });

  it("N13 rejects a self-join on a column name both tables declare", () => {
    expect(
      userTablePolicyIssues(N13_SHARED_NAME_SELF_JOIN, ["records"]).join(" | ")
    ).toContain("not owner-scoped");
  });

  it("N14 rejects a shared-name predicate that resolves inward", () => {
    expect(
      userTablePolicyIssues(N14_SHARED_NAME_PREDICATE, ["records"]).join(" | ")
    ).toContain("not owner-scoped");
  });

  it("N13/N14 are rejected for CORRELATION, not for something else", () => {
    // Each fixture has to fail for the reason it was written. If one of them
    // ever starts failing on the equality rule or the tautology list instead,
    // the corpus would still be green while the correlation fix rotted.
    for (const [name, fixture] of [
      ["N13", N13_SHARED_NAME_SELF_JOIN],
      ["N14", N14_SHARED_NAME_PREDICATE],
    ] as const) {
      const [policy] = policies(fixture);
      const { subqueries } = stripSubqueries(policy.usingExpr ?? "");

      expect(subqueries, name).toHaveLength(1);
      // A real equality against a row term is present…
      expect(authUidComparands(subqueries[0]), name).toContain("v.owner_id");
      // …and the predicate is not a tautology…
      expect(isTautological(policy.usingExpr ?? ""), name).toBe(false);
      // …so correlation is the only thing left to reject it.
      expect(
        isCorrelated(subqueries[0], {
          outerTable: "records",
          outerColumns: ["id", "vehicle_id", "odometer_km", "kind"],
        }),
        name
      ).toBe(false);
    }
  });

  it("the tightened rule still accepts the unqualified spelling it exists for", () => {
    // The whole reason `isCorrelated` looks at bare names is that
    // `where v.id = vehicle_id` is legal, correct Postgres. Subtracting the
    // inner table's columns must not have taken that with it — `vehicle_id`
    // is a `records` column and `vehicles` has no such column, so it survives
    // the subtraction and still counts as the back-reference it is.
    expect(
      isCorrelated("select 1 from public.vehicles v where v.id = vehicle_id", {
        outerTable: "records",
        outerColumns: ["id", "vehicle_id", "odometer_km"],
      })
    ).toBe(true);
  });

  it("subqueryTables reads the from/join list the subtraction needs", () => {
    expect(
      subqueryTables(
        "select 1 from public.records r join public.vehicles v on v.id = r.vehicle_id"
      )
    ).toEqual(["records", "vehicles"]);
  });

  it("N15 rejects a SECOND bucket left with no policy of its own", () => {
    // T2-301a. `storagePolicyIssues` grades every storage.objects policy
    // together, which was the whole truth while receipts were the only
    // bucket. Here every policy that exists is flawless and the photos bucket
    // has none — so the whole-table rule says nothing, and only the
    // per-bucket rule catches it.
    expect(storagePolicyIssues(C9_STORAGE_PATH_SCOPED)).toEqual([]);
    expect(
      bucketPolicyIssues(C9_STORAGE_PATH_SCOPED, "vehicle-photos").join(" | ")
    ).toContain("no policy names the vehicle-photos bucket");
  });

  it("N16 rejects a bucket whose policies miss a command", () => {
    // Select-only means the owner cannot upload; delete-less means the
    // cascade cannot reach the objects. Both are findings, and neither is
    // visible to a rule that only asks whether the policies present are sound.
    const issues = bucketPolicyIssues(
      N16_BUCKET_READ_ONLY,
      "vehicle-photos"
    ).join(" | ");

    expect(issues).toContain("no policy covers insert");
    expect(issues).toContain("no policy covers delete");
    expect(issues).not.toContain("no policy covers select");
  });

  it("N17 rejects a second bucket scoped by bucket id but not by path", () => {
    // The F2 shape again, one bucket over: every authenticated user reads
    // every user's photos.
    expect(
      bucketPolicyIssues(N17_BUCKET_NO_PATH, "vehicle-photos").join(" | ")
    ).toContain("not owner-scoped");
  });

  it("every wide-open probe produces at least one finding", () => {
    // The sweep. A rule refactor that quietly stopped detecting one of these
    // would otherwise only show up as one silent green test.
    const verdicts: [string, string[]][] = [
      [
        "P1 using-any-logged-in",
        userTablePolicyIssues(P1_USING_ANY_LOGGED_IN, ["records"]),
      ],
      ["P2 1=1", userTablePolicyIssues(P2_ONE_EQUALS_ONE, ["vehicles"])],
      ["P3 or-widened", userTablePolicyIssues(P3_OR_WIDENED, ["vehicles"])],
      ["P4 storage-no-path", storagePolicyIssues(P4_STORAGE_NO_PATH)],
      [
        "P5 bucket-flipped",
        bucketPrivacyIssues(P5_BUCKET_FLIPPED_LATER, RECEIPTS_BUCKET),
      ],
      [
        "P6 bucket-reversed",
        bucketPrivacyIssues(P6_BUCKET_PUBLIC_REVERSED, RECEIPTS_BUCKET),
      ],
      [
        "P7 insert-unchecked",
        userTablePolicyIssues(P7_INSERT_UNCHECKED, ["vehicles"]),
      ],
      [
        "N3 alter-policy",
        userTablePolicyIssues(N3_ALTER_POLICY_REOPENS, ["records"]),
      ],
      [
        "N4 uncorrelated-exists",
        userTablePolicyIssues(N4_UNCORRELATED_EXISTS, ["records"]),
      ],
      [
        "N11 mention-not-equality",
        userTablePolicyIssues(N11_MENTION_NOT_EQUALITY, ["vehicles"]),
      ],
      [
        "N12 mention-in-function",
        userTablePolicyIssues(N12_MENTION_IN_FUNCTION, ["vehicles"]),
      ],
      [
        "N13 shared-name self-join",
        userTablePolicyIssues(N13_SHARED_NAME_SELF_JOIN, ["records"]),
      ],
      [
        "N14 shared-name predicate",
        userTablePolicyIssues(N14_SHARED_NAME_PREDICATE, ["records"]),
      ],
      // The per-bucket rule (T2-301a). It was the newest rule in the file and
      // the only one with no sweep coverage at all, which is the position a
      // rule is least likely to be noticed going quiet from.
      [
        "N15 second bucket unpoliced",
        bucketPolicyIssues(C9_STORAGE_PATH_SCOPED, "vehicle-photos"),
      ],
      [
        "N16 bucket missing a command",
        bucketPolicyIssues(N16_BUCKET_READ_ONLY, "vehicle-photos"),
      ],
      [
        "N17 bucket without path scoping",
        bucketPolicyIssues(N17_BUCKET_NO_PATH, "vehicle-photos"),
      ],
    ];

    expect(
      verdicts.filter(([, issues]) => issues.length === 0).map(([name]) => name)
    ).toEqual([]);
  });
});

/* =========================================================================
 * B. Correct schemas that MUST be accepted
 * ====================================================================== */

/** C1 — `primary key` implies NOT NULL; demanding the literal was wrong. */
const C1_PRIMARY_KEY_IMPLIES_NOT_NULL = sql(`
  create table public.vehicles (
    id uuid primary key default gen_random_uuid(),
    owner_id uuid not null
  );
`);

/** C2 — a reference to a table's primary key needs no column list. */
const C2_REFERENCES_NO_COLUMN_LIST = sql(`
  create table public.vehicles (
    id uuid primary key,
    owner_id uuid not null references auth.users on delete cascade
  );
`);

/** C3 — the same key declared as a table-level constraint. */
const C3_TABLE_LEVEL_FK = sql(`
  create table public.records (
    id uuid primary key,
    vehicle_id uuid not null,
    constraint records_vehicle_fk foreign key (vehicle_id)
      references public.vehicles (id) on delete cascade
  );
`);

/** C4 — pg_dump's spelling: `ALTER TABLE ONLY`, constraint added afterwards. */
const C4_ALTER_TABLE_ONLY = sql(`
  create table public.receipts (
    id uuid primary key,
    record_id uuid not null
  );
  alter table only public.receipts enable row level security;
  alter table only public.receipts force row level security;
  alter table only public.receipts
    add constraint receipts_record_fk foreign key (record_id)
    references public.records (id) on delete cascade;
`);

/** C5 — a schema-qualified enum type for the record kind. */
const C5_QUALIFIED_ENUM = sql(`
  create type public.record_kind as enum ('work', 'receipt', 'note', 'plan');
  create table public.records (
    id uuid primary key,
    kind public.record_kind not null
  );
`);

/** C6 — an empty array is how "no references" is spelled. */
const C6_EMPTY_ARRAY_DEFAULT = sql(`
  create table public.records (
    id uuid primary key,
    problem_ids text[] not null default '{}',
    part_ids text[] not null default array[]::text[]
  );
`);

/** C7 — `for all` with only a `using` clause: Postgres reuses it for writes. */
const C7_FOR_ALL_USING_ONLY = sql(`
  create policy "vehicles are owner-only" on public.vehicles
    for all to authenticated
    using (owner_id = auth.uid());
`);

/** C8 — the nested-ownership spelling, via an exists subquery. */
const C8_NESTED_OWNERSHIP = sql(`
  create policy "records are owner-only" on public.records
    for all to authenticated
    using (exists (
      select 1 from public.vehicles v
      where v.id = records.vehicle_id and v.owner_id = auth.uid()
    ));
`);

/** C9 — a correct storage policy: bucket plus the object's owning folder. */
const C9_STORAGE_PATH_SCOPED = sql(`
  create policy "receipts are owner-only" on storage.objects
    for select to authenticated
    using (
      bucket_id = 'receipts'
      and (storage.foldername(name))[1] = auth.uid()::text
    );
`);

/** C10 — a restrictive policy that narrows; it need not grant on its own. */
const C10_RESTRICTIVE_NARROWS = sql(`
  create policy "vehicles are owner-only" on public.vehicles
    for all to authenticated
    using (owner_id = auth.uid());
  create policy "no deleted accounts" on public.vehicles
    as restrictive for all to authenticated
    using (auth.uid() is not null);
`);

/**
 * N9 — `(select auth.uid()) = owner_id`, straight out of Supabase's own RLS
 * performance guide: the scalar subquery lets Postgres hoist the call out of
 * the per-row loop. This is what T2-202 will write at scale, and it was
 * failing closed (confirm review, R4).
 */
const N9_SELECT_WRAPPED_UID = sql(`
  create policy "vehicles are owner-only" on public.vehicles
    for all to authenticated
    using ((select auth.uid()) = owner_id)
    with check ((select auth.uid()) = owner_id);
`);

/** N10 — the `in (select auth.uid())` spelling of the same idiom. */
const N10_IN_SELECT_UID = sql(`
  create policy "vehicles are owner-only" on public.vehicles
    for all to authenticated
    using (owner_id in (select auth.uid()));
`);

/** C11 — the bucket created private, explicitly. */
const C11_BUCKET_PRIVATE = sql(`
  insert into storage.buckets (id, name, public)
  values ('receipts', 'receipts', false)
  on conflict (id) do nothing;
`);

describe("CORRECT: valid schemas must be accepted", () => {
  it("C1 accepts `primary key` as satisfying not-null", () => {
    expect(
      isNotNullFor(C1_PRIMARY_KEY_IMPLIES_NOT_NULL, "vehicles", "id")
    ).toBe(true);
  });

  it("C1 still reports a genuinely nullable column as nullable", () => {
    // The negative half: if `isNotNullFor` returned true for everything, the
    // grader above would pass and mean nothing.
    const nullable = sql(`create table public.vehicles (note text);`);

    expect(isNotNullFor(nullable, "vehicles", "note")).toBe(false);
  });

  it("C2 accepts a reference with no column list", () => {
    const fk = foreignKeyFor(
      C2_REFERENCES_NO_COLUMN_LIST,
      "vehicles",
      "owner_id"
    );

    expect(fk).toEqual({ target: "auth.users", cascades: true });
  });

  it("C3 accepts a table-level foreign key constraint", () => {
    const fk = foreignKeyFor(C3_TABLE_LEVEL_FK, "records", "vehicle_id");

    expect(fk).toEqual({ target: "public.vehicles", cascades: true });
  });

  it("C4 accepts ALTER TABLE ONLY for RLS and for constraints", () => {
    const fk = foreignKeyFor(C4_ALTER_TABLE_ONLY, "receipts", "record_id");

    expect(fk).toEqual({ target: "public.records", cascades: true });
  });

  it("C4 sees RLS enabled and forced through ALTER TABLE ONLY", () => {
    expect(enablesRls(C4_ALTER_TABLE_ONLY, "receipts")).toBe(true);
    expect(forcesRls(C4_ALTER_TABLE_ONLY, "receipts")).toBe(true);
  });

  it("C4 still reports enabled-but-not-forced through ALTER TABLE ONLY", () => {
    // The invariant the whole harness exists for must not have been loosened
    // in the course of accepting `ONLY`.
    const enabledOnly = sql(`
      alter table only public.receipts enable row level security;
    `);

    expect(enablesRls(enabledOnly, "receipts")).toBe(true);
    expect(forcesRls(enabledOnly, "receipts")).toBe(false);
  });

  it("C5 accepts a schema-qualified enum type", () => {
    expect(C5_QUALIFIED_ENUM).toMatch(
      /create (?:type|domain) (?:[a-z_]+\.)?[a-z_]*kind\b/
    );
  });

  it("C6 accepts `not null default '{}'` as optional", () => {
    expect(
      isOptionalColumn(C6_EMPTY_ARRAY_DEFAULT, "records", "problem_ids", true)
    ).toBe(true);
    expect(
      isOptionalColumn(C6_EMPTY_ARRAY_DEFAULT, "records", "part_ids", true)
    ).toBe(true);
  });

  it("C6 still rejects a required column pretending to be optional", () => {
    // `not null default 0` on a cost is not optionality — it is inventing a
    // number, which is the one thing this project refuses to do.
    const forced = sql(`
      create table public.records (
        id uuid primary key,
        cost_amount numeric not null default 0
      );
    `);

    expect(isOptionalColumn(forced, "records", "cost_amount", true)).toBe(
      false
    );
  });

  it("C7 accepts `for all` with only a using clause", () => {
    expect(userTablePolicyIssues(C7_FOR_ALL_USING_ONLY, ["vehicles"])).toEqual(
      []
    );
  });

  it("C7: the write side falls back to `using`, as Postgres does", () => {
    const [policy] = policies(C7_FOR_ALL_USING_ONLY);

    expect(effectiveCheck(policy)).toBe("owner_id = auth.uid()");
  });

  it("C8 accepts nested ownership through an exists subquery", () => {
    expect(userTablePolicyIssues(C8_NESTED_OWNERSHIP, ["records"])).toEqual([]);
  });

  it("C9 accepts a path-scoped storage policy", () => {
    expect(storagePolicyIssues(C9_STORAGE_PATH_SCOPED)).toEqual([]);
  });

  it("N18 accepts a correctly policed second bucket", () => {
    // The positive control: the rule must not simply dislike photos.
    const correct = sql(`
      create policy "photos owner all" on storage.objects
        for all to authenticated
        using (
          bucket_id = 'vehicle-photos'
          and (storage.foldername(name))[1] = (select auth.uid())::text
        )
        with check (
          bucket_id = 'vehicle-photos'
          and (storage.foldername(name))[1] = (select auth.uid())::text
        );
    `);

    expect(bucketPolicyIssues(correct, "vehicle-photos")).toEqual([]);
  });

  it("C10 accepts a restrictive policy that only narrows", () => {
    expect(
      userTablePolicyIssues(C10_RESTRICTIVE_NARROWS, ["vehicles"])
    ).toEqual([]);
  });

  it("C11 accepts an explicitly private bucket", () => {
    expect(bucketPrivacyIssues(C11_BUCKET_PRIVATE, RECEIPTS_BUCKET)).toEqual(
      []
    );
  });

  it("N9 accepts `(select auth.uid()) = owner_id` — Supabase's own idiom", () => {
    expect(userTablePolicyIssues(N9_SELECT_WRAPPED_UID, ["vehicles"])).toEqual(
      []
    );
  });

  it("N10 accepts `owner_id in (select auth.uid())`", () => {
    expect(userTablePolicyIssues(N10_IN_SELECT_UID, ["vehicles"])).toEqual([]);
  });

  it("N9/N10: the subquery wrapper does not smuggle past the equality rule", () => {
    // Accepting the idiom must not decay into "any (select …) counts". A
    // wrapped call that is still only a mention has to stay rejected.
    const wrappedMention = sql(`
      create policy "vehicles are owner-only" on public.vehicles
        for all to authenticated
        using ((select auth.uid()) is not null and display_name is not null);
    `);

    expect(
      userTablePolicyIssues(wrappedMention, ["vehicles"]).join(" | ")
    ).toContain("not owner-scoped");
  });

  it("every correct probe produces no findings", () => {
    const verdicts = [
      userTablePolicyIssues(C7_FOR_ALL_USING_ONLY, ["vehicles"]),
      userTablePolicyIssues(C8_NESTED_OWNERSHIP, ["records"]),
      storagePolicyIssues(C9_STORAGE_PATH_SCOPED),
      userTablePolicyIssues(C10_RESTRICTIVE_NARROWS, ["vehicles"]),
      bucketPrivacyIssues(C11_BUCKET_PRIVATE, RECEIPTS_BUCKET),
      userTablePolicyIssues(N9_SELECT_WRAPPED_UID, ["vehicles"]),
      userTablePolicyIssues(N10_IN_SELECT_UID, ["vehicles"]),
    ];

    expect(verdicts.flat()).toEqual([]);
  });
});

/* =========================================================================
 * C. The expression analysis underneath, graded directly
 * ====================================================================== */

describe("splitTopLevel", () => {
  it("splits on a top-level or", () => {
    expect(splitTopLevel("a = 1 or b = 2", "or")).toEqual(["a = 1", "b = 2"]);
  });

  it("does NOT split inside parentheses", () => {
    // The `or` inside a subquery belongs to the subquery. Splitting there
    // would report a correct policy as widened.
    expect(
      splitTopLevel("exists (select 1 where a = 1 or b = 2)", "or")
    ).toHaveLength(1);
  });

  it("does not split a word that merely starts with or", () => {
    expect(splitTopLevel("order_id = auth.uid()", "or")).toEqual([
      "order_id = auth.uid()",
    ]);
  });

  it("splits on and, too", () => {
    expect(splitTopLevel("a = 1 and b = 2", "and")).toEqual(["a = 1", "b = 2"]);
  });
});

describe("isTautological", () => {
  it.each([
    ["true", true],
    ["1 = 1", true],
    ["(1 = 1)", true],
    ["42 = 42", true],
    ["'x' = 'x'", true],
    ["auth.uid() is not null", true],
    ["auth.role() = 'authenticated'", true],
    ["true and true", true],
    ["owner_id = auth.uid()", false],
    ["1 = 2", false],
    ["'x' = 'y'", false],
    ["bucket_id = 'receipts'", false],
    ["owner_id = auth.uid() and auth.uid() is not null", false],
  ])("%s → %s", (expr, expected) => {
    expect(isTautological(expr)).toBe(expected);
  });
});

describe("authUidComparands — equality, not mention", () => {
  it("finds the column on the left", () => {
    expect(authUidComparands("owner_id = auth.uid()")).toContain("owner_id");
  });

  it("finds the column on the right", () => {
    expect(authUidComparands("auth.uid() = owner_id")).toContain("owner_id");
  });

  it("sees through a cast", () => {
    expect(
      authUidComparands("(storage.foldername(name))[1] = auth.uid()::text")
    ).toHaveLength(1);
  });

  it("finds NOTHING in a mere mention — the whole of F1", () => {
    expect(authUidComparands("auth.uid() is not null")).toEqual([]);
  });

  it("does not count auth.uid() compared with itself", () => {
    expect(authUidComparands("auth.uid() = auth.uid()")).toEqual([]);
  });

  it("does not count a comparison with a literal", () => {
    expect(authUidComparands("auth.uid() = 'some-uuid'")).toEqual([]);
  });

  it("does not count the caller compared with themselves (R3)", () => {
    // `auth.uid()` IS `current_setting('request.jwt.claims')…->>'sub'`
    // underneath, so this is always true while reading like a careful check.
    expect(
      authUidComparands(
        "current_setting('request.jwt.claim.sub') = auth.uid()::text"
      )
    ).toEqual([]);
  });

  it("sees through Supabase's `(select auth.uid())` idiom (R4)", () => {
    expect(authUidComparands("(select auth.uid()) = owner_id")).toEqual([
      "owner_id",
    ]);
  });

  it("sees through the `in (select auth.uid())` idiom (R4)", () => {
    expect(authUidComparands("owner_id in (select auth.uid())")).toEqual([
      "owner_id",
    ]);
  });
});

describe("stripSubqueries / isCorrelated — the D1 rule, directly", () => {
  it("separates a subquery from the predicate around it", () => {
    const { outer, subqueries } = stripSubqueries(
      "exists (select 1 from vehicles v where v.owner_id = auth.uid())"
    );

    expect(subqueries).toHaveLength(1);
    expect(outer).not.toContain("auth.uid()");
  });

  it("calls a subquery that names the outer table correlated", () => {
    expect(
      isCorrelated("select 1 from vehicles v where v.id = records.vehicle_id", {
        outerTable: "records",
        outerColumns: ["id", "vehicle_id"],
      })
    ).toBe(true);
  });

  it("calls a subquery referencing an outer column UNqualified correlated", () => {
    // Legal Postgres — resolved outward when the inner table has no such
    // column. Rejecting it would fail a correct policy.
    expect(
      isCorrelated("select 1 from vehicles v where v.id = vehicle_id", {
        outerTable: "records",
        outerColumns: ["id", "vehicle_id"],
      })
    ).toBe(true);
  });

  it("calls a subquery that never mentions the outer row UNcorrelated", () => {
    expect(
      isCorrelated("select 1 from vehicles v where v.owner_id = auth.uid()", {
        outerTable: "records",
        outerColumns: ["id", "vehicle_id", "occurred_on", "kind"],
      })
    ).toBe(false);
  });

  it("is not fooled by `id` appearing inside `owner_id`", () => {
    // The word-boundary case: a substring match would call this correlated
    // and D1 would quietly stop working.
    expect(
      isCorrelated("select 1 from vehicles v where v.owner_id = auth.uid()", {
        outerTable: "records",
        outerColumns: ["id"],
      })
    ).toBe(false);
  });

  it("declines to judge when there is no outer table, rather than inventing a finding", () => {
    expect(isCorrelated("select 1 from vehicles v", {})).toBe(true);
  });
});

describe("representsAbsence", () => {
  it.each([
    ["'{}'", true],
    ["array[]", true],
    ["'{}'::text[]", true],
    ["array[]::text[]", true],
    ["0", false],
    ["'{unset}'", false],
    ["null", false],
  ])("%s → %s", (expr, expected) => {
    expect(representsAbsence(expr)).toBe(expected);
  });
});

describe("the probe fixtures are real DDL, not empty strings", () => {
  // Belt and braces: every fixture above must actually parse into the thing
  // it claims to be, or the verdicts are about nothing.
  it("the policy probes each contain exactly one or two policies", () => {
    for (const [name, fixture] of [
      ["P1", P1_USING_ANY_LOGGED_IN],
      ["P2", P2_ONE_EQUALS_ONE],
      ["P3", P3_OR_WIDENED],
      ["P4", P4_STORAGE_NO_PATH],
      ["P7", P7_INSERT_UNCHECKED],
      ["C7", C7_FOR_ALL_USING_ONLY],
      ["C8", C8_NESTED_OWNERSHIP],
      ["C9", C9_STORAGE_PATH_SCOPED],
      ["C10", C10_RESTRICTIVE_NARROWS],
    ] as const) {
      expect(policies(fixture).length, name).toBeGreaterThan(0);
    }
  });

  it("the table probes each parse into a create-table body", () => {
    expect(
      createTableBody(C1_PRIMARY_KEY_IMPLIES_NOT_NULL, "vehicles")
    ).not.toBeNull();
    expect(
      columnDefinition(
        createTableBody(C6_EMPTY_ARRAY_DEFAULT, "records") ?? "",
        "problem_ids"
      )
    ).not.toBeNull();
  });
});

/* =========================================================================
 * D. T2-401a — the FUNCTION and GRANT surface
 *
 * Same contract as the sections above, applied to the rules that grade
 * `security definer` functions and end-state ACLs: a leaking variant that must
 * be rejected, a correct variant that must be accepted, and each fixture
 * minimal enough that only the rule under test can decide it.
 *
 * ## Mutation-verified, to this file's own standard
 *
 * Thirty-nine mutations were applied to `rules.ts` and `sql.ts` — each rule
 * disabled or inverted in turn, each clause of the compound rules separately —
 * and this suite went red for every one. That matters more here than anywhere
 * else in the file, because these fixtures describe a surface that does not
 * exist yet: a rule that quietly matched nothing would look exactly like a
 * rule that is waiting, and `share-instrument.test.ts`'s `it.fails` markers
 * would go on reporting "expected failure" either way.
 *
 * Seven mutations survived a first pass and the probes were strengthened until
 * they did not, which is the only reason to run the exercise at all. Each
 * survivor was a rule the corpus *appeared* to cover:
 *
 * - **`dollarTagAt` matching `$1`.** Relaxing the first character of a tag
 *   name turns every plpgsql positional parameter into a dollar quote and
 *   swallows the rest of the file. Pinned now as a direct table.
 * - **`statements()` closing a body on any tag rather than its own.** The
 *   entire reason named tags exist is a body containing `$$`; without one in
 *   the corpus the rule was unreachable. Pinned by a `$function$` body with a
 *   `$$` inside it.
 * - **The `public` half of the ACL knowledge test** (round-2 F1). Flipping the
 *   `&&` to `||` left all 516 tests green: every fixture revoked from `anon`
 *   *and* `public`, so the forgot-`public` case had no probe at all. Pinned by
 *   G12/G12b — and the test itself de-duplicated into one `aclKnownFor`, since
 *   two copies meant neither mutant moved the other's callers.
 * - **Expiry and revocation pinned only against ABSENCE** (round-2 F2). Every
 *   fixture removed the column outright, so relaxing either comparison to a
 *   bare-mention test stayed green — and `expiryCheckIssues`' own
 *   "mentioned but never compared" branch was dead code no probe produced.
 *   Pinned by G13, a reader returning both columns and testing neither.
 * - **Whole-row projection** (round-2 F3). The rule caught a literal `*` and
 *   nothing else, so `to_jsonb(r)`, `row_to_json(r)`, `jsonb_agg(r)`, bare
 *   `select r`, and `r.*` inside a builder each returned **zero** findings
 *   from the full sweep — a bypass easier to write than the thing the rule
 *   caught. Pinned by G14, one probe per spelling, each clause of the widened
 *   rule separately mutation-verified.
 * - **`security_invoker` present but `false`.** Testing for the option's
 *   presence accepts the value that turns it off — the F1 lesson on a view
 *   option. Pinned by G15c.
 *
 * refs specs/002-montero-garage (SHR-01, SHR-05, SHR-06, SHR-07, SHR-08)
 * ====================================================================== */

/**
 * The reference share reader: everything the spec asks for, spelled the way
 * T2-404's architecture record says it will be spelled.
 *
 * The positive control for all five function rules at once. Without it, every
 * rejection below is satisfied by a rule that dislikes functions.
 */
const CORRECT_SHARE_READER = sql(`
  create function public.share_read_records(p_token text)
  returns table (id uuid, occurred_on date, kind text)
  language sql
  stable
  security definer
  set search_path = ''
  as $share$
    select r.id, r.occurred_on, r.kind
    from public.records r
    join public.shares s on s.vehicle_id = r.vehicle_id
    where s.token_hash = extensions.digest(p_token, 'sha256')
      and s.revoked_at is null
      and s.expires_at > now();
  $share$;

  revoke all on function public.share_read_records(text) from public;
  revoke all on function public.share_read_records(text) from authenticated;
  grant execute on function public.share_read_records(text) to anon;
`);

/** The one routine in the correct fixture, for the per-rule probes. */
function readerOf(fixture: string): FunctionDefinition {
  const [routine] = functions(fixture);
  if (!routine) throw new Error("fixture declares no function");
  return routine;
}

/** Rewrite one line of the reference reader — one property broken at a time. */
function brokenReader(from: string, to: string): string {
  const broken = CORRECT_SHARE_READER.replace(from, to);
  if (broken === CORRECT_SHARE_READER) {
    throw new Error(`probe fixture did not change: "${from}" not found`);
  }
  return broken;
}

/** G1 — a definer routine that leaves the search path to its caller. */
const G1_DEFINER_NO_SEARCH_PATH = brokenReader("set search_path = '' ", "");

/** G2 — a reader that never asks whether the grant has expired (SHR-08). */
const G2_NO_EXPIRY_CHECK = brokenReader("and s.expires_at > now()", "");

/** G3 — a reader that cannot be revoked. The likeliest defect (SHR-08). */
const G3_NO_REVOCATION_CHECK = brokenReader("and s.revoked_at is null", "");

/** G4 — row projection where SHR-06 requires column projection. */
const G4_SELECT_STAR = brokenReader(
  "select r.id, r.occurred_on, r.kind",
  "select r.*"
);

/** G5 — the token compared against a column that holds it in the clear. */
const G5_RAW_TOKEN = brokenReader(
  "s.token_hash = extensions.digest(p_token, 'sha256')",
  "s.token = p_token"
);

/** G6 — the return shape *is* the user table, so no column can be omitted. */
const G6_SETOF_USER_TABLE = sql(`
  create function public.share_read_records(p_token text)
  returns setof public.records
  language sql
  stable
  security definer
  set search_path = ''
  as $share$
    select r.id, r.occurred_on
    from public.records r
    join public.shares s on s.vehicle_id = r.vehicle_id
    where s.token_hash = extensions.digest(p_token, 'sha256')
      and s.revoked_at is null
      and s.expires_at > now();
  $share$;

  revoke all on function public.share_read_records(text) from public;
  grant execute on function public.share_read_records(text) to anon;
`);

/** G7 — the accountless path admitting a write (SHR-07). */
const G7_ANON_WRITE = sql(`
  create function public.share_note(p_token text, p_body text)
  returns void
  language plpgsql
  security definer
  set search_path = ''
  as $share$
  begin
    insert into public.records (vehicle_id, kind)
    select s.vehicle_id, 'note'
    from public.shares s
    where s.token_hash = extensions.digest(p_token, 'sha256')
      and s.revoked_at is null
      and s.expires_at > now();
  end;
  $share$;

  revoke all on function public.share_note(text, text) from public;
  grant execute on function public.share_note(text, text) to anon;
`);

/**
 * G8 — a definer routine nobody revoked.
 *
 * The quiet one. Postgres grants EXECUTE on a new function to `PUBLIC` by
 * default, so this is reachable by `anon` in the running database while the
 * migration text says nothing at all. A replay that read silence as "not
 * granted" would report it clean, which is the shape of the near-miss T2-202's
 * review found on the table side — the privilege that nearly shipped a hole
 * was one **nobody granted**.
 */
const G8_NEVER_REVOKED = sql(`
  create function public.share_read_everything(p_token text)
  returns table (id uuid)
  language sql
  security definer
  set search_path = ''
  as $share$ select r.id from public.records r; $share$;
`);

/**
 * G9 — **the recorded defect (1)**: a revoke, then a grant that undoes it.
 *
 * The grader this replaced counted statements matching
 * `^revoke … from … anon` and asserted the count was above zero. This
 * directory scores 1 and passed — verified 2026-08-31.
 */
const G9_REVOKE_THEN_GRANT = sql(`
  revoke all on public.records from anon;
  revoke all on public.records from public;
  revoke all on public.records from authenticated;
  grant select, insert, update, delete on public.records to authenticated;
  grant select on public.records to anon;
`);

/** G9b — the same directory without the undo. The control. */
const G9B_REVOKE_ONLY = sql(`
  revoke all on public.records from anon;
  revoke all on public.records from public;
  revoke all on public.records from authenticated;
  grant select, insert, update, delete on public.records to authenticated;
`);

/**
 * G10 — **the recorded defect (2)**: a fifth user table nothing enumerates.
 *
 * `for all to anon using (true)` and no `force`. Every table-level grader is
 * driven from `contract.ts`, so this produced zero findings — verified
 * 2026-08-31.
 */
const G10_FIFTH_TABLE = sql(`
  create table public.shares (
    id uuid primary key,
    vehicle_id uuid not null,
    token_hash bytea not null
  );
  alter table public.shares enable row level security;
  create policy "shares readable" on public.shares
    for all to anon using (true);
`);

/**
 * G12 — **round-2 F1**: a directory that revokes from `anon` and forgets
 * `public`.
 *
 * The half of the tri-state that had no probe at all. `public` is not a role
 * beside `anon` — it is every role — so a privilege `public` inherited from
 * Supabase's role setup still reaches `anon`, and `revoke … from anon` does
 * not touch it. The end-state ACL here is genuinely **unknown**, and the
 * review proved the gap by flipping the `&&` in the knowledge test to `||` in
 * either copy and watching all 516 garage tests stay green.
 */
const G12_REVOKE_ANON_ONLY = sql(`
  revoke all on public.records from anon;
  grant select, insert, update, delete on public.records to authenticated;
`);

/** G12b — a definer routine with the same omission. */
const G12B_FUNCTION_REVOKE_ANON_ONLY = sql(`
  create function public.share_read_records(p_token text)
  returns table (id uuid)
  language sql
  stable
  security definer
  set search_path = ''
  as $share$
    select r.id from public.records r
    join public.shares s on s.vehicle_id = r.vehicle_id
    where s.token_hash = extensions.digest(p_token, 'sha256')
      and s.revoked_at is null
      and s.expires_at > now();
  $share$;

  revoke all on function public.share_read_records(text) from anon;
`);

/**
 * G13 — **round-2 F2**: the columns are *returned* and never *tested*.
 *
 * The realistic defect shape, and the one the rules were not pinned against:
 * every earlier probe removed the column entirely, so relaxing either
 * comparison regex to a bare-mention test left the suite green. A reader that
 * selects `expires_at` and `revoked_at` into its output — so a caller can see
 * them — while filtering on neither is a grant that never expires and cannot
 * be revoked, and it reads as careful.
 */
const G13_MENTIONED_NEVER_COMPARED = sql(`
  create function public.share_read_records(p_token text)
  returns table (id uuid, expires_at timestamptz, revoked_at timestamptz)
  language sql
  stable
  security definer
  set search_path = ''
  as $share$
    select r.id, s.expires_at, s.revoked_at
    from public.records r
    join public.shares s on s.vehicle_id = r.vehicle_id
    where s.token_hash = extensions.digest(p_token, 'sha256');
  $share$;

  revoke all on function public.share_read_records(text) from public;
  grant execute on function public.share_read_records(text) to anon;
`);

/**
 * G14 — **round-2 F3**: whole-row projection, in every spelling that is not a
 * literal `*`.
 *
 * Each of these returns every column of `records`, and every one of them
 * produced **zero** findings from the full `anonSurfaceIssues` sweep. That is
 * a bypass easier to write than the thing the rule caught.
 */
const G14_WHOLE_ROW_SPELLINGS = [
  ["to_jsonb", "select to_jsonb(r)"],
  ["to_jsonb(r.*)", "select to_jsonb(r.*)"],
  ["row_to_json", "select row_to_json(r)"],
  ["jsonb_agg", "select jsonb_agg(r)"],
  ["bare alias", "select r"],
  ["alias.*", "select r.*"],
  // `r.*` buried in a builder that is NOT a whole-row serialiser. Its own
  // entry because it is the only spelling the literal-`*` check and the
  // serialiser check both miss — mutation-verified: dropping the `alias.*`
  // rule while every other probe stayed green (round-2 self-check).
  ["alias.* inside a builder", "select jsonb_build_object('all', r.*)"],
] as const;

function wholeRowReader(projection: string): string {
  return sql(`
    create function public.share_read_records(p_token text)
    returns jsonb
    language sql
    stable
    security definer
    set search_path = ''
    as $share$
      ${projection}
      from public.records r
      join public.shares s on s.vehicle_id = r.vehicle_id
      where s.token_hash = extensions.digest(p_token, 'sha256')
        and s.revoked_at is null
        and s.expires_at > now();
    $share$;

    revoke all on function public.share_read_records(text) from public;
    grant execute on function public.share_read_records(text) to anon;
  `);
}

/** G15 — a view that runs as its owner, so RLS is evaluated against the owner. */
const G15_VIEW_WITHOUT_INVOKER = sql(`
  create view public.vehicle_state as
    select v.id, v.display_name from public.vehicles v;
`);

/** G15b — the same view, declared to run as its caller. */
const G15B_VIEW_WITH_INVOKER = sql(`
  create view public.vehicle_state with (security_invoker = true) as
    select v.id, v.display_name from public.vehicles v;
`);

/**
 * G15c — the option present and switched **off**.
 *
 * Its own fixture because "mentions security_invoker" and "runs as the
 * caller" are different claims, and only the second one is the guarantee.
 * Mutation-verified: relaxing the rule to a bare mention of the option
 * survived G15 and G15b together (round-2 self-check).
 */
const G15C_VIEW_INVOKER_FALSE = sql(`
  create view public.vehicle_state with (security_invoker = false) as
    select v.id, v.display_name from public.vehicles v;
`);

/** G11 — the bearer secret stored in the clear. */
const G11_PLAINTEXT_TOKEN_COLUMN = sql(`
  create table public.shares (
    id uuid primary key,
    token text not null unique,
    expires_at timestamptz not null
  );
  alter table public.shares enable row level security;
  alter table public.shares force row level security;
`);

describe("WIDE-OPEN: the function surface", () => {
  it("G1 rejects a `security definer` routine with no `set search_path`", () => {
    expect(
      definerSearchPathIssues(G1_DEFINER_NO_SEARCH_PATH).join(" | ")
    ).toContain("no `set search_path`");
  });

  it("G1 rejects `set search_path = public` too — it is not empty", () => {
    // `public` is a schema a caller may be able to create objects in. The
    // rule accepts `''` and `pg_catalog` and nothing else.
    const toPublic = brokenReader(
      "set search_path = ''",
      "set search_path = public"
    );

    expect(definerSearchPathIssues(toPublic).join(" | ")).toContain(
      "must be ''"
    );
  });

  it("G1: the reference reader passes the same rule", () => {
    // Positive control. A rule that rejected every definer routine would
    // satisfy both assertions above and mean nothing.
    expect(definerSearchPathIssues(CORRECT_SHARE_READER)).toEqual([]);
  });

  it("G2 rejects a reader that never tests expires_at", () => {
    expect(
      expiryCheckIssues(readerOf(G2_NO_EXPIRY_CHECK)).join(" | ")
    ).toContain("does not test expires_at");
  });

  it("G2 fails ONLY the expiry rule — the triple is three findings", () => {
    // The whole reason the token triple is three graders. Dropping the expiry
    // check must not disturb the hash rule or the revocation rule, or a
    // reviewer reading one red test cannot tell which property is missing.
    const routine = readerOf(G2_NO_EXPIRY_CHECK);

    expect(tokenHashIssues(routine)).toEqual([]);
    expect(revocationCheckIssues(routine)).toEqual([]);
    expect(expiryCheckIssues(routine)).not.toEqual([]);
  });

  it("G3 rejects a grant that cannot be revoked", () => {
    expect(
      revocationCheckIssues(readerOf(G3_NO_REVOCATION_CHECK)).join(" | ")
    ).toContain("does not test revoked_at");
  });

  it("G3 fails ONLY the revocation rule", () => {
    // The likeliest real defect, and the one that hand-testing cannot find: a
    // grant you have not revoked behaves identically whether or not the
    // reader reads `revoked_at`.
    const routine = readerOf(G3_NO_REVOCATION_CHECK);

    expect(tokenHashIssues(routine)).toEqual([]);
    expect(expiryCheckIssues(routine)).toEqual([]);
    expect(revocationCheckIssues(routine)).not.toEqual([]);
  });

  it("G4 rejects `select *` in an anon-reachable routine", () => {
    expect(projectionIssues(readerOf(G4_SELECT_STAR)).join(" | ")).toContain(
      "selects `*`"
    );
  });

  it("G5 rejects a raw-token comparison", () => {
    const issues = tokenHashIssues(readerOf(G5_RAW_TOKEN)).join(" | ");

    expect(issues).toContain("plaintext token column");
    expect(issues).toContain("never hashes the token");
  });

  it("G5: `token_hash` is not read as the plaintext column `token`", () => {
    // The word-boundary case, and it decides the whole rule: if `\btoken\b`
    // matched inside `token_hash`, the correct reader would be rejected and
    // the rule would be turned off within a day.
    expect(tokenHashIssues(readerOf(CORRECT_SHARE_READER))).toEqual([]);
  });

  it("G6 rejects `returns setof` a user table", () => {
    expect(
      projectionIssues(readerOf(G6_SETOF_USER_TABLE)).join(" | ")
    ).toContain("returns `setof records`");
  });

  it("G6: the finding is about the RETURN shape, not the body", () => {
    // The body names its columns. Only the return type is wrong — so if this
    // ever starts passing, it is the `returns` parser that broke, not the
    // select-star rule covering for it.
    const routine = readerOf(G6_SETOF_USER_TABLE);

    expect(routine.body).not.toMatch(/select\s+[a-z]*\.?\*/);
    expect(projectionIssues(routine)).toHaveLength(1);
  });

  it("G7 rejects a write on the accountless path (SHR-07)", () => {
    expect(anonWriteIssues(readerOf(G7_ANON_WRITE)).join(" | ")).toContain(
      "performs a insert"
    );
  });

  it("G7: a read-only reader is not accused of writing", () => {
    expect(anonWriteIssues(readerOf(CORRECT_SHARE_READER))).toEqual([]);
  });

  it("G8 counts a NEVER-REVOKED routine as anon-reachable", () => {
    // Postgres grants EXECUTE to PUBLIC by default. Silence in the migration
    // text is not evidence of absence, and a security rule that treats it as
    // such is decorative.
    expect(
      anonExecutableFunctions(G8_NEVER_REVOKED).map((routine) => routine.name)
    ).toEqual(["share_read_everything"]);
  });

  it("G8 is caught by the closed allow-list, by name", () => {
    const { unexpected } = anonFunctionAllowListIssues(G8_NEVER_REVOKED, [
      "share_read_records",
    ]);

    expect(unexpected.join(" | ")).toContain("share_read_everything");
    expect(unexpected.join(" | ")).toContain("security definer");
  });

  it("G8: adding the revokes takes it back off the anon surface", () => {
    // The control for the tri-state. If `unknown` and `none` were the same
    // answer, this pair would agree and the rule would be reporting on
    // nothing.
    const revoked = `${G8_NEVER_REVOKED} revoke all on function public.share_read_everything(text) from public; revoke all on function public.share_read_everything(text) from anon;`;

    expect(anonExecutableFunctions(revoked)).toEqual([]);
  });
});

describe("WIDE-OPEN: the two recorded grader defects", () => {
  it("G9 rejects revoke-then-grant — the END-STATE ACL, not a count", () => {
    expect(
      tableGrantIssues(G9_REVOKE_THEN_GRANT, ["records"]).join(" | ")
    ).toContain("anon holds select");
  });

  it("G9: the grader this replaced scores it 1 and passes — the false pass", () => {
    // Recorded verbatim so the regression cannot come back as a "simplification".
    // The old rule was: count statements matching this pattern, assert > 0.
    const revokes = statements(G9_REVOKE_THEN_GRANT).filter((statement) =>
      /^revoke\b[\s\S]*\bfrom\b[\s\S]*\banon\b/.test(statement)
    );

    expect(revokes.length).toBeGreaterThan(0); // the old grader's verdict: PASS
    expect(tableGrantIssues(G9_REVOKE_THEN_GRANT, ["records"])).not.toEqual([]); // the new one: FAIL
  });

  it("G9b: the same directory without the undo is accepted", () => {
    expect(tableGrantIssues(G9B_REVOKE_ONLY, ["records"])).toEqual([]);
  });

  it("G9: order is what distinguishes them", () => {
    // Both directories contain the same two statements. Only the order
    // differs, and the whole point of a replay is that the order decides.
    const grantThenRevoke = sql(`
      grant select on public.records to anon;
      revoke all on public.records from anon;
      revoke all on public.records from public;
    `);
    const state = grants(grantThenRevoke);

    expect(privilegeVerdict(state, "public.records", "anon", "select")).toBe(
      "none"
    );
    expect(
      privilegeVerdict(
        grants(G9_REVOKE_THEN_GRANT),
        "public.records",
        "anon",
        "select"
      )
    ).toBe("granted");
  });

  it("G9: a grant to `public` reaches anon, and a revoke from anon does not undo it", () => {
    // `public` is not a role beside `anon` — it is every role. This is the
    // spelling of the same hole that looks most like a fix.
    const state = grants(
      sql(`
        revoke all on public.records from anon;
        grant select on public.records to public;
      `)
    );

    expect(privilegeVerdict(state, "public.records", "anon", "select")).toBe(
      "granted"
    );
  });

  it("G9: authenticated holding TRUNCATE is a finding — RLS does not filter it", () => {
    // T2-202's review emptied `profiles` as `authenticated` against a schema
    // whose declaration graders were all green.
    const truncatable = sql(`
      revoke all on public.records from anon;
      revoke all on public.records from public;
      revoke all on public.records from authenticated;
      grant select, insert, update, delete, truncate on public.records to authenticated;
    `);

    expect(tableGrantIssues(truncatable, ["records"]).join(" | ")).toContain(
      "truncate"
    );
  });

  it("G9: an ACL nothing ever emptied is reported UNKNOWN, not clean", () => {
    // The T2-202 lesson in one assertion: `grant select, … to authenticated`
    // *adds to* whatever Supabase already granted. A directory that grants
    // without revoking first has an ACL this module cannot see, and saying so
    // is the only honest answer.
    const noRevoke = sql(`
      grant select, insert, update, delete on public.records to authenticated;
    `);

    expect(tableGrantIssues(noRevoke, ["records"]).join(" | ")).toContain(
      "unknown"
    );
  });

  it("G10 rejects a fifth table nothing enumerates", () => {
    const issues = ungradedTableIssues(G10_FIFTH_TABLE).join(" | ");

    expect(issues).toContain("public.shares");
    expect(issues).toContain("not enumerated in USER_TABLES");
    expect(issues).toContain("not FORCED");
  });

  it("G10: the graders it dodges report nothing about it — the false pass", () => {
    // Recorded verbatim. `userTablePolicyIssues` filters to
    // `USER_TABLE_NAMES`, so the wide-open `for all to anon using (true)`
    // policy on `shares` is invisible to it. The finding has to come from the
    // other direction — from what the directory *creates*.
    const blind = userTablePolicyIssues(G10_FIFTH_TABLE, [...USER_TABLE_NAMES]);

    expect(blind.filter((issue) => issue.includes("shares"))).toEqual([]);
    expect(ungradedTableIssues(G10_FIFTH_TABLE)).not.toEqual([]);
  });

  it("G10: enumerating the table clears the enumeration finding, not the RLS one", () => {
    // The fix is to grade it, not to list it. A table added to `USER_TABLES`
    // still has to force RLS.
    const issues = ungradedTableIssues(G10_FIFTH_TABLE, {
      enumerated: [...USER_TABLE_NAMES, "shares"],
    }).join(" | ");

    expect(issues).not.toContain("not enumerated");
    expect(issues).toContain("not FORCED");
  });

  it("G10: a NAMED exemption is accepted, an unnamed one is not", () => {
    // The `EXEMPT_PAGES` mechanism, graded against a synthetic map so the
    // real one can stay empty and still be proven to work.
    const exempt = new Map([["shares", "not user data — a synthetic probe"]]);

    expect(ungradedTableIssues(G10_FIFTH_TABLE, { exempt })).toEqual([]);
    expect(
      ungradedTableIssues(G10_FIFTH_TABLE, { exempt: new Map() })
    ).not.toEqual([]);
  });

  it("G10: a correctly declared table produces nothing", () => {
    const correct = sql(`
      create table public.records (id uuid primary key);
      alter table public.records enable row level security;
      alter table public.records force row level security;
    `);

    expect(ungradedTableIssues(correct)).toEqual([]);
  });

  it("G12 rejects a revoke that forgets `public` — the ACL is UNKNOWN", () => {
    // Round-2 F1. Revoking from `anon` alone says nothing about what `anon`
    // can do, because a privilege `public` holds reaches every role.
    const state = grants(G12_REVOKE_ANON_ONLY);

    expect(rolePrivileges(state, "public.records", "anon").verdict).toBe(
      "unknown"
    );
    expect(privilegeVerdict(state, "public.records", "anon", "select")).toBe(
      "unknown"
    );
    expect(
      tableGrantIssues(G12_REVOKE_ANON_ONLY, ["records"]).join(" | ")
    ).toContain("nothing revokes public's inherited privileges");
  });

  it("G12: adding the `public` revoke is what makes the answer knowable", () => {
    // The control. One statement is the entire difference between "unknown"
    // and "none", and if this pair ever agrees the tri-state has collapsed.
    const complete = `${G12_REVOKE_ANON_ONLY} revoke all on public.records from public; revoke all on public.records from authenticated;`;

    expect(
      rolePrivileges(grants(complete), "public.records", "anon").verdict
    ).toBe("none");
    expect(tableGrantIssues(complete, ["records"])).toEqual([]);
  });

  it("G12b: a definer routine revoked from anon only stays anon-reachable", () => {
    // The same omission on the surface where it costs most. The routine looks
    // locked down — there is a revoke, and it names `anon` — and `public`
    // still holds Postgres's default EXECUTE.
    expect(
      anonExecutableFunctions(G12B_FUNCTION_REVOKE_ANON_ONLY).map(
        (routine) => routine.name
      )
    ).toEqual(["share_read_records"]);
    expect(
      anonFunctionAllowListIssues(
        G12B_FUNCTION_REVOKE_ANON_ONLY,
        []
      ).unexpected.join(" | ")
    ).toContain("security definer");
  });

  it("G13 rejects columns that are RETURNED but never TESTED", () => {
    // Round-2 F2. Every earlier probe removed the column outright, so the
    // rules were pinned only against absence — relaxing either comparison to
    // a bare-mention test left the suite green.
    const routine = readerOf(G13_MENTIONED_NEVER_COMPARED);

    expect(expiryCheckIssues(routine).join(" | ")).toContain(
      "mentioned but never compared"
    );
    expect(revocationCheckIssues(routine).join(" | ")).toContain(
      "cannot be revoked"
    );
  });

  it("G13: the hash check is fine — only the two time rules fire", () => {
    // Each fixture must fail for the reason it was written. This one hashes
    // correctly and projects named columns; only expiry and revocation are
    // missing.
    const routine = readerOf(G13_MENTIONED_NEVER_COMPARED);

    expect(tokenHashIssues(routine)).toEqual([]);
    expect(projectionIssues(routine)).toEqual([]);
  });

  it.each(G14_WHOLE_ROW_SPELLINGS)(
    "G14 rejects whole-row projection spelled `%s`",
    (_label, projection) => {
      // Round-2 F3. Every one of these returns every column of `records` and
      // every one produced zero findings before the rule was widened.
      const fixture = wholeRowReader(projection);

      expect(projectionIssues(readerOf(fixture))).not.toEqual([]);
      // And it is caught by the sweep a reviewer actually reads, not only by
      // the rule in isolation.
      expect(anonSurfaceIssues(fixture)).not.toEqual([]);
    }
  );

  it("G14: a named-column projection over the same query is accepted", () => {
    // The control for the widened rule. `r.id, r.occurred_on` names its
    // columns and must stay clean, or the rule is simply refusing joins.
    const named = wholeRowReader("select r.id, r.occurred_on");

    expect(projectionIssues(readerOf(named))).toEqual([]);
    expect(anonSurfaceIssues(named)).toEqual([]);
  });

  it("G14: rowAliases reads the aliases the whole-row rules depend on", () => {
    // If this returned nothing, every whole-row check above would be vacuous
    // and the `it.each` would be asserting that literal `*` is still caught.
    expect(
      rowAliases(
        "select r.id from public.records r join public.shares s on s.vehicle_id = r.vehicle_id"
      )
    ).toEqual(["r", "s"]);
  });

  it("G14: a keyword after a table name is not read as an alias", () => {
    // `from public.records where …` must not bind `where` as a row alias, or
    // the rule starts hunting for `where.*` and misses the real one.
    expect(rowAliases("select id from public.records where id = 1")).toEqual([
      "records",
    ]);
  });

  it("G15 rejects a view created without `security_invoker`", () => {
    // The option arrived in PG15 and defaults to `false`, so the default is
    // the unsafe direction: the view runs as its owner and RLS on the
    // underlying tables is evaluated against the owner, not the caller.
    expect(
      viewSecurityInvokerIssues(G15_VIEW_WITHOUT_INVOKER).join(" | ")
    ).toContain("public.vehicle_state");
  });

  it("G15b accepts a view that runs as its caller", () => {
    expect(viewSecurityInvokerIssues(G15B_VIEW_WITH_INVOKER)).toEqual([]);
  });

  it("G15c rejects `security_invoker = false` — mentioning it is not setting it", () => {
    // The F1 lesson applied to a view option: a rule that tests for the
    // presence of the word accepts the value that turns it off.
    expect(
      viewSecurityInvokerIssues(G15C_VIEW_INVOKER_FALSE).join(" | ")
    ).toContain("public.vehicle_state");
  });

  it("G15: a table is not asked for `security_invoker`", () => {
    // The rule applies to views only. If it fired on tables, the four real
    // user tables would light up and someone would delete the rule.
    expect(viewSecurityInvokerIssues(G10_FIFTH_TABLE)).toEqual([]);
  });

  it("G11 rejects a bearer secret stored in the clear", () => {
    expect(
      plaintextTokenColumnIssues(G11_PLAINTEXT_TOKEN_COLUMN).join(" | ")
    ).toContain("public.shares.token");
  });

  it("G11: `token_hash` is not mistaken for a plaintext column", () => {
    expect(plaintextTokenColumnIssues(G10_FIFTH_TABLE)).toEqual([]);
  });
});

describe("CORRECT: the reference share reader must be accepted", () => {
  it("is anon-reachable, and is the ONLY thing that is", () => {
    expect(
      anonExecutableFunctions(CORRECT_SHARE_READER).map(
        (routine) => routine.name
      )
    ).toEqual(["share_read_records"]);
  });

  it("satisfies the closed allow-list in both directions", () => {
    const { unexpected, missing } = anonFunctionAllowListIssues(
      CORRECT_SHARE_READER,
      ["share_read_records"]
    );

    expect(unexpected).toEqual([]);
    expect(missing).toEqual([]);
  });

  it("produces no finding from ANY of the anon-surface rules", () => {
    // The single assertion that would catch a rule which has become
    // over-strict. Every rejection above is only meaningful because this
    // passes.
    expect(anonSurfaceIssues(CORRECT_SHARE_READER)).toEqual([]);
  });

  it("parses as one definer routine with a pinned search path", () => {
    const routine = readerOf(CORRECT_SHARE_READER);

    expect(routine.identity).toBe("public.share_read_records(text)");
    expect(routine.securityDefiner).toBe(true);
    expect(routine.searchPath).toBe("''");
    expect(routine.returns).toContain("table (");
  });

  it("every wide-open function/grant probe produces at least one finding", () => {
    // The sweep, in the shape section A uses. A rule refactor that quietly
    // stopped detecting one of these would otherwise show up as one silent
    // green test.
    const verdicts: [string, string[]][] = [
      [
        "G1 definer no search_path",
        definerSearchPathIssues(G1_DEFINER_NO_SEARCH_PATH),
      ],
      ["G2 no expiry", expiryCheckIssues(readerOf(G2_NO_EXPIRY_CHECK))],
      [
        "G3 no revocation",
        revocationCheckIssues(readerOf(G3_NO_REVOCATION_CHECK)),
      ],
      ["G4 select star", projectionIssues(readerOf(G4_SELECT_STAR))],
      ["G5 raw token", tokenHashIssues(readerOf(G5_RAW_TOKEN))],
      ["G6 setof user table", projectionIssues(readerOf(G6_SETOF_USER_TABLE))],
      ["G7 anon write", anonWriteIssues(readerOf(G7_ANON_WRITE))],
      [
        "G8 never revoked",
        anonFunctionAllowListIssues(G8_NEVER_REVOKED, []).unexpected,
      ],
      [
        "G9 revoke then grant",
        tableGrantIssues(G9_REVOKE_THEN_GRANT, ["records"]),
      ],
      ["G10 fifth table", ungradedTableIssues(G10_FIFTH_TABLE)],
      [
        "G11 plaintext token",
        plaintextTokenColumnIssues(G11_PLAINTEXT_TOKEN_COLUMN),
      ],
      [
        "G12 revoke forgets public",
        tableGrantIssues(G12_REVOKE_ANON_ONLY, ["records"]),
      ],
      [
        "G12b definer revoked from anon only",
        anonFunctionAllowListIssues(G12B_FUNCTION_REVOKE_ANON_ONLY, [])
          .unexpected,
      ],
      [
        "G13 expiry mentioned never compared",
        expiryCheckIssues(readerOf(G13_MENTIONED_NEVER_COMPARED)),
      ],
      [
        "G13 revocation mentioned never compared",
        revocationCheckIssues(readerOf(G13_MENTIONED_NEVER_COMPARED)),
      ],
      ...G14_WHOLE_ROW_SPELLINGS.map(
        ([label, projection]): [string, string[]] => [
          `G14 whole row via ${label}`,
          anonSurfaceIssues(wholeRowReader(projection)),
        ]
      ),
      [
        "G15 view without security_invoker",
        viewSecurityInvokerIssues(G15_VIEW_WITHOUT_INVOKER),
      ],
      [
        "G15c view with security_invoker = false",
        viewSecurityInvokerIssues(G15C_VIEW_INVOKER_FALSE),
      ],
    ];

    expect(
      verdicts.filter(([, issues]) => issues.length === 0).map(([name]) => name)
    ).toEqual([]);
  });

  it("every correct function/grant probe produces none", () => {
    expect(
      [
        anonSurfaceIssues(CORRECT_SHARE_READER),
        definerSearchPathIssues(CORRECT_SHARE_READER),
        tableGrantIssues(G9B_REVOKE_ONLY, ["records"]),
        plaintextTokenColumnIssues(G10_FIFTH_TABLE),
        // Round-2 additions: the widened projection rule must still accept a
        // named-column projection, and the view rule a caller-scoped view.
        anonSurfaceIssues(wholeRowReader("select r.id, r.occurred_on")),
        viewSecurityInvokerIssues(G15B_VIEW_WITH_INVOKER),
      ].flat()
    ).toEqual([]);
  });
});

/* =========================================================================
 * E. The function/grant parsers underneath, graded directly
 * ====================================================================== */

describe("dollar-quoted bodies", () => {
  it("does not split a statement on a `;` inside a NAMED dollar tag", () => {
    // `$$` was the only tag the first version understood. `pg_dump` writes a
    // named tag whenever the body could contain `$$`, and a named tag made
    // every `;` in a plpgsql body a statement boundary — so every
    // function-level rule read a fragment.
    const named = sql(`
      create function public.f() returns void language plpgsql as $body$
      begin
        insert into public.t values (1);
        insert into public.t values (2);
      end;
      $body$;
      grant execute on function public.f() to anon;
    `);

    expect(statements(named)).toHaveLength(2);
    expect(functions(named)).toHaveLength(1);
  });

  it("still handles the plain `$$` spelling", () => {
    const plain = sql(`
      create function public.f() returns void language plpgsql as $$
      begin
        insert into public.t values (1);
      end;
      $$;
    `);

    expect(statements(plain)).toHaveLength(1);
    expect(functions(plain)[0].body).toContain("insert into public.t");
  });

  it("does not mistake a plpgsql positional parameter for a tag", () => {
    // `$1` is not a dollar quote. If it were read as one, everything after it
    // would vanish into a body that never closes.
    const positional = sql(`
      create function public.f(a int) returns int language sql as $$ select $1; $$;
      grant execute on function public.f(int) to anon;
    `);

    expect(statements(positional)).toHaveLength(2);
  });

  it.each<[string, number, string | null]>([
    ["$$", 0, "$$"],
    ["$body$", 0, "$body$"],
    ["$_x9$", 0, "$_x9$"],
    // A tag name must start with a letter or underscore. Without that, `$1`
    // is a tag and everything after a positional parameter disappears into a
    // body that never closes — and `statements()` returns one giant fragment
    // that no rule can read. Mutation-verified: relaxing the first character
    // survives every end-to-end probe, so it is pinned here directly.
    ["$1", 0, null],
    ["$1$", 0, null],
    ["select $1", 7, null],
    ["nothing", 0, null],
    ["a $$ b", 2, "$$"],
  ])("dollarTagAt(%j, %i) → %j", (text, index, expected) => {
    expect(dollarTagAt(text, index)).toBe(expected);
  });

  it("closes a body on its OWN tag, not on a different one inside it", () => {
    // The entire reason named tags exist: `$function$` wraps a body that
    // itself contains `$$`. A scanner that exited on any tag would end the
    // body at the inner `$$`, and the `;` after it would split the statement —
    // silently, with the rest of the function read as separate statements.
    const nested = sql(`
      create function public.f() returns void language plpgsql as $function$
      begin
        execute $$ select 1; $$;
        insert into public.t values (2);
      end;
      $function$;
      grant execute on function public.f() to anon;
    `);

    expect(statements(nested)).toHaveLength(2);
    expect(functions(nested)).toHaveLength(1);
    expect(functions(nested)[0].body).toContain("insert into public.t");
  });
});

describe("canonicalArgumentTypes — a signature is the ACL key", () => {
  it.each<[string, string[]]>([
    ["p_now timestamptz default now()", ["timestamptz"]],
    ["timestamp with time zone", ["timestamptz"]],
    ["p_when timestamp with time zone", ["timestamptz"]],
    ["event jsonb", ["jsonb"]],
    ["jsonb", ["jsonb"]],
    ["p_token text, p_id uuid", ["text", "uuid"]],
    ["in p_token text", ["text"]],
    ["variadic p_ids uuid[]", ["uuid[]"]],
    ["p_flag boolean", ["bool"]],
    ["p_n integer", ["int"]],
    ["", []],
  ])("reads `%s` as %j", (args, expected) => {
    expect(canonicalArgumentTypes(args)).toEqual(expected);
  });

  it("drops OUT parameters — they are not part of the identity", () => {
    expect(canonicalArgumentTypes("p_token text, out p_found bool")).toEqual([
      "text",
    ]);
  });

  it("resolves the CREATE and the GRANT to one identity", () => {
    // The case that actually occurs in this repo: the create spells the type
    // `timestamptz` and names the argument; the grant spells neither.
    const fixture = sql(`
      create function public.purge(p_now timestamp with time zone default now())
      returns int language sql security definer set search_path = ''
      as $$ select 1; $$;
      revoke all on function public.purge(timestamptz) from public;
      revoke all on function public.purge(timestamptz) from anon;
    `);

    expect(functions(fixture)[0].identity).toBe("public.purge(timestamptz)");
    expect(anonExecutableFunctions(fixture)).toEqual([]);
  });
});

describe("functions() replays create / replace / drop", () => {
  it("keeps the LAST definition, as Postgres does", () => {
    const replaced = sql(`
      create function public.f() returns void language plpgsql
      security definer set search_path = '' as $$ begin end; $$;
      create or replace function public.f() returns void language plpgsql
      security definer as $$ begin end; $$;
    `);

    expect(functions(replaced)).toHaveLength(1);
    // The replacement dropped `set search_path`, and the end state is what
    // gets graded — the `alter policy` lesson (D2) on the function surface.
    expect(definerSearchPathIssues(replaced).join(" | ")).toContain(
      "no `set search_path`"
    );
  });

  it("`create or replace` does NOT reset the ACL — as in Postgres", () => {
    // Replacing a function keeps its grants. A replay that re-initialised the
    // ACL would report a granted function as ungranted and hide the grant.
    const replaced = sql(`
      create function public.f() returns void language sql as $$ select 1; $$;
      revoke all on function public.f() from public;
      grant execute on function public.f() to anon;
      create or replace function public.f() returns void language sql as $$ select 2; $$;
    `);

    expect(
      privilegeVerdict(grants(replaced), "public.f()", "anon", "execute")
    ).toBe("granted");
  });

  it("a dropped function is gone from the end state", () => {
    const dropped = sql(`
      create function public.f() returns void language plpgsql
      security definer as $$ begin end; $$;
      drop function public.f();
    `);

    expect(functions(dropped)).toEqual([]);
    expect(definerSearchPathIssues(dropped)).toEqual([]);
  });
});

describe("grants() — the end-state ACL", () => {
  it("applies `all functions in schema` to the functions declared before it", () => {
    const bulk = sql(`
      create function public.f() returns void language sql as $$ select 1; $$;
      revoke all on all functions in schema public from public;
      revoke all on all functions in schema public from anon;
    `);

    expect(anonExecutableFunctions(bulk)).toEqual([]);
  });

  it("records `alter default privileges` without replaying it into an ACL", () => {
    // Default privileges apply to objects created afterwards *by the role
    // that set them*, and this module cannot know which role runs a
    // migration. T2-202's review is the reason for the caution: the first
    // version of that migration assumed they had emptied the tables' ACLs and
    // the running database disagreed.
    const adp = sql(`
      alter default privileges in schema public revoke all on tables from anon;
      create table public.t (id uuid primary key);
    `);
    const state = grants(adp);

    expect(state.defaultPrivileges).toHaveLength(1);
    expect(state.defaultPrivileges[0]).toMatchObject({
      action: "revoke",
      schema: "public",
      objectType: "tables",
      roles: ["anon"],
    });
    // …and the table's own ACL is still unknown, because nothing revoked on it.
    expect(rolePrivileges(state, "public.t", "anon").verdict).toBe("unknown");
  });

  it("reports a table nothing created and nothing granted as unknown", () => {
    expect(
      rolePrivileges(grants(sql(`select 1;`)), "public.ghost", "anon").verdict
    ).toBe("unknown");
  });

  it("removes one privilege without emptying the ACL", () => {
    const partial = sql(`
      revoke all on public.records from anon;
      revoke all on public.records from public;
      grant select, insert on public.records to anon;
      revoke insert on public.records from anon;
    `);

    expect(
      rolePrivileges(grants(partial), "public.records", "anon").privileges
    ).toEqual(["select"]);
  });
});

describe("createdTables() — what exists, replayed", () => {
  it("forgets a dropped table", () => {
    const dropped = sql(`
      create table public.tmp (id uuid primary key);
      drop table public.tmp;
    `);

    expect(createdTables(dropped)).toEqual([]);
  });

  it("follows a rename", () => {
    const renamed = sql(`
      create table public.grants_old (id uuid primary key);
      alter table public.grants_old rename to shares;
    `);

    expect(createdTables(renamed).map((table) => table.name)).toEqual([
      "shares",
    ]);
  });

  it("ignores tables outside the public schema", () => {
    // `storage.objects` and `auth.users` are Supabase's; they have their own
    // graders and are not this contract's to enumerate.
    const other = sql(`
      create table storage.buckets_extra (id text primary key);
      create table public.shares (id uuid primary key);
    `);

    expect(createdTables(other).map((table) => table.identity)).toEqual([
      "public.shares",
    ]);
  });
});
