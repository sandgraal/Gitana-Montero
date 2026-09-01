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
import { RECEIPTS_BUCKET } from "./contract.ts";
import {
  authUidComparands,
  bucketPolicyIssues,
  bucketPrivacyIssues,
  effectiveCheck,
  isCorrelated,
  isOptionalColumn,
  isOwnerScoped,
  isTautological,
  splitTopLevel,
  storagePolicyIssues,
  stripSubqueries,
  subqueryTables,
  userTablePolicyIssues,
} from "./rules.ts";
import {
  columnDefinition,
  createTableBody,
  enablesRls,
  foreignKeyFor,
  forcesRls,
  isNotNullFor,
  normalizeSql,
  policies,
  representsAbsence,
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
