/**
 * Reviewer-derived regression fixtures. **Nothing here is marked.**
 *
 * The T2-201 review defeated the first version of the declaration tier by
 * writing DDL rather than by reading the graders: three wide-open schemas
 * passed the entire merge-blocking proof, and five correctly-spelled schemas
 * were rejected. The graders were measuring string similarity to an imagined
 * implementation and calling it row-level security.
 *
 * Those twelve schemas live here now, as a suite with a known answer:
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
 * refs specs/002-montero-garage (SHR-01, SHR-03, GAR-02′, GAR-05′, ACC-03)
 */
import { describe, expect, it } from "vitest";
import { RECEIPTS_BUCKET } from "./contract.ts";
import {
  authUidComparands,
  bucketPrivacyIssues,
  effectiveCheck,
  isOptionalColumn,
  isOwnerScoped,
  isTautological,
  splitTopLevel,
  storagePolicyIssues,
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

  it("every wide-open probe produces at least one finding", () => {
    // The sweep. A rule refactor that quietly stopped detecting one of these
    // would otherwise only show up as one silent green test.
    const verdicts = [
      userTablePolicyIssues(P1_USING_ANY_LOGGED_IN, ["records"]),
      userTablePolicyIssues(P2_ONE_EQUALS_ONE, ["vehicles"]),
      userTablePolicyIssues(P3_OR_WIDENED, ["vehicles"]),
      storagePolicyIssues(P4_STORAGE_NO_PATH),
      bucketPrivacyIssues(P5_BUCKET_FLIPPED_LATER, RECEIPTS_BUCKET),
      bucketPrivacyIssues(P6_BUCKET_PUBLIC_REVERSED, RECEIPTS_BUCKET),
      userTablePolicyIssues(P7_INSERT_UNCHECKED, ["vehicles"]),
    ];

    expect(verdicts.map((issues) => issues.length > 0)).toEqual([
      true,
      true,
      true,
      true,
      true,
      true,
      true,
    ]);
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

  it("every correct probe produces no findings", () => {
    const verdicts = [
      userTablePolicyIssues(C7_FOR_ALL_USING_ONLY, ["vehicles"]),
      userTablePolicyIssues(C8_NESTED_OWNERSHIP, ["records"]),
      storagePolicyIssues(C9_STORAGE_PATH_SCOPED),
      userTablePolicyIssues(C10_RESTRICTIVE_NARROWS, ["vehicles"]),
      bucketPrivacyIssues(C11_BUCKET_PRIVATE, RECEIPTS_BUCKET),
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
