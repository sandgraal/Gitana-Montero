/**
 * Grader infrastructure — **the semantic layer**.
 *
 * ## Why this file exists
 *
 * The first version of T2-201's declaration tier graded *spelling*. It asked
 * whether a policy statement contained the characters `auth.uid()` and did not
 * contain the characters `using (true)`. The review proved what that is worth
 * by writing schemas that are wide open and pass:
 *
 * ```sql
 * -- 164 graders passed. Every logged-in user reads everybody's records.
 * create policy "…" on public.records for all to authenticated
 *   using (auth.uid() is not null)
 *   with check (vehicle_id in (select id from vehicles where owner_id = auth.uid()));
 *
 * -- Passed. `1 = 1` is not the literal string `true`.
 * create policy "…" on public.vehicles for all to authenticated using (1 = 1);
 *
 * -- Passed. Every authenticated user downloads everybody's receipts.
 * create policy "…" on storage.objects for select to authenticated
 *   using (bucket_id = 'receipts' and auth.uid() is not null);
 * ```
 *
 * All three failed the same way: the graders tested the *concatenation* of
 * `using` and `with check`, so a correct `with check` covered for a wide-open
 * `using`. The two clauses answer different questions — `using` decides what
 * you can **see**, `with check` decides what you can **write** — and a
 * predicate that satisfies one says nothing about the other.
 *
 * So the rules moved out of the test bodies and into this file, as pure
 * functions over DDL text that return a list of findings. Three things follow
 * from that:
 *
 * 1. The graders became thin — they assert `issues == []` — so a rule can be
 *    fixed in one place instead of six.
 * 2. The rules are **testable against DDL with a known answer**, which is what
 *    `reviewer-probes.test.ts` does: the wide-open variants must be rejected
 *    and the correctly-spelled ones must be accepted. That suite is unmarked
 *    and green, and it is what stops this entire finding class from coming
 *    back — and it has itself been mutation-tested, because a corpus that
 *    only reaches the rules it happens to hit first has holes in it.
 * 3. Being about semantics rather than substrings, the rules accept spellings
 *    the string-matching version rejected — `primary key` for `not null`,
 *    `references auth.users` with no column list, table-level constraints,
 *    `ALTER TABLE ONLY`.
 *
 * ## The rule that does the work
 *
 * A predicate is **owner-scoped** when every one of its top-level `or`
 * branches compares `auth.uid()` for equality against something belonging to
 * the row. Two halves, both load-bearing:
 *
 * - *equality against a row term*, not merely a mention. `auth.uid() is not
 *   null` mentions it and means "anyone logged in".
 * - *every* branch, because `or` is how a scoped predicate gets widened:
 *   `owner_id = auth.uid() or true` reads as careful and grants everything.
 *
 * And one more, added after the confirm review: when the equality lives inside
 * a subquery, the subquery must **correlate** back to the outer row. Without
 * that, `exists (select 1 from vehicles where owner_id = auth.uid())` is a
 * global "does this person own anything at all" and grants every record in the
 * database to anyone with one truck. See `isCorrelated`.
 *
 * refs specs/002-montero-garage (SHR-01, SHR-03, GAR-05′, ACC-03)
 */
import { USER_TABLES } from "./contract.ts";
import {
  createTableBody,
  columnDefinition,
  defaultExpression,
  parenExpression,
  policies,
  representsAbsence,
  statements,
  type PolicyDefinition,
} from "./sql.ts";

/* -------------------------------------------------------------------------
 * Expression analysis
 * ---------------------------------------------------------------------- */

/** Split on a top-level boolean operator, ignoring parens and string literals. */
export function splitTopLevel(expr: string, operator: "or" | "and"): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quoted = false;
  let start = 0;
  for (let index = 0; index < expr.length; index += 1) {
    const char = expr[index];
    if (char === "'") quoted = !quoted;
    if (quoted) continue;
    if (char === "(") depth += 1;
    else if (char === ")") depth -= 1;
    else if (depth === 0) {
      const ahead = expr.slice(index);
      const match = new RegExp(`^\\b${operator}\\b`).exec(ahead);
      const boundaryBefore = index === 0 || /\s|\)/.test(expr[index - 1]);
      if (match && boundaryBefore) {
        parts.push(expr.slice(start, index).trim());
        index += operator.length - 1;
        start = index + 1;
      }
    }
  }
  parts.push(expr.slice(start).trim());
  return parts.map((part) => part.trim()).filter(Boolean);
}

/** Strip redundant wrapping parens: `((a = b))` → `a = b`. */
export function unwrap(expr: string): string {
  let out = expr.trim();
  while (out.startsWith("(") && out.endsWith(")")) {
    let depth = 0;
    let closesAtEnd = true;
    for (let index = 0; index < out.length; index += 1) {
      if (out[index] === "(") depth += 1;
      else if (out[index] === ")") {
        depth -= 1;
        if (depth === 0 && index < out.length - 1) closesAtEnd = false;
      }
    }
    if (!closesAtEnd) break;
    out = out.slice(1, -1).trim();
  }
  return out;
}

/**
 * Things that are true for anybody who gets as far as being asked.
 *
 * Not an attempt at a general theorem prover — a closed list of the forms that
 * actually turn up in a hand-written policy, including the two the review
 * used to walk through the first version of this harness (`1 = 1`, and
 * `auth.uid() is not null`, which reads like a security check and means
 * "any account at all").
 */
export function isTautological(expr: string): boolean {
  const term = unwrap(expr).replace(/\s+/g, " ").trim();
  if (term === "true") return true;
  if (/^\(?\s*(\d+)\s*=\s*(\d+)\s*\)?$/.test(term)) {
    const [, left, right] = /^\(?\s*(\d+)\s*=\s*(\d+)\s*\)?$/.exec(term) ?? [];
    return left === right;
  }
  if (/^'([^']*)'\s*=\s*'([^']*)'$/.test(term)) {
    const [, left, right] = /^'([^']*)'\s*=\s*'([^']*)'$/.exec(term) ?? [];
    return left === right;
  }
  // "Somebody is logged in" is not "this row is yours".
  if (/^auth\.uid\(\)\s*is not null$/.test(term)) return true;
  if (/^auth\.role\(\)\s*=\s*'authenticated'$/.test(term)) return true;
  if (/^auth\.jwt\(\)\s*is not null$/.test(term)) return true;
  if (/^current_user\s*is not null$/.test(term)) return true;
  // A conjunction is tautological only if every conjunct is.
  const conjuncts = splitTopLevel(term, "and");
  if (conjuncts.length > 1) return conjuncts.every(isTautological);
  return false;
}

/**
 * Rewrite the two idioms Supabase's own RLS performance guide recommends into
 * the plain form the comparand matcher understands.
 *
 * `(select auth.uid()) = owner_id` and `owner_id in (select auth.uid())` are
 * not exotic: wrapping the call in a scalar subquery lets Postgres hoist it
 * out of the per-row loop, so they are what a schema written for scale will
 * actually say. Both were being rejected as unscoped — a grader that fails
 * closed on the officially recommended spelling would have pushed T2-202
 * toward the slower one to get a green build (T2-201 confirm review, R4).
 */
export function canonicalizeAuthUid(expr: string): string {
  return expr
    .replace(/\bin\s*\(\s*select\s+auth\.uid\(\)\s*\)/g, "= auth.uid()")
    .replace(/\(\s*select\s+auth\.uid\(\)\s*\)/g, "auth.uid()");
}

/**
 * Operands that are not row terms — comparing to these proves nothing.
 *
 * `current_setting('request.jwt…')` is here because `auth.uid()` *is*
 * `current_setting('request.jwt.claims')::json->>'sub'` underneath. Comparing
 * the two is comparing the caller to themselves: always true, and it reads
 * like a careful check (T2-201 confirm review, R3).
 */
const NON_ROW_TERMS =
  /^(true|false|null|\d+|'.*'|auth\.uid\(\)(::[a-z_]+)?|auth\.role\(\)|auth\.jwt\(\).*|current_setting\(.*|current_user|session_user)$/;

/**
 * Every term compared for **equality** with `auth.uid()` in `expr`.
 *
 * Equality is the point. A predicate that merely mentions `auth.uid()` —
 * `auth.uid() is not null`, `coalesce(auth.uid(), …)` — has not tied the row
 * to the caller, and that distinction is the whole of finding F1.
 */
export function authUidComparands(rawExpr: string): string[] {
  const expr = canonicalizeAuthUid(rawExpr);
  const term = "[a-z0-9_.\"'\\[\\]()>-]+(?:::[a-z_ \\[\\]]+)?";
  const out: string[] = [];
  for (const pattern of [
    new RegExp(`(${term})\\s*=\\s*auth\\.uid\\(\\)(?:::[a-z_]+)?`, "g"),
    new RegExp(`auth\\.uid\\(\\)(?:::[a-z_]+)?\\s*=\\s*(${term})`, "g"),
  ]) {
    for (const match of expr.matchAll(pattern)) {
      const operand = match[1].replace(/::[a-z_ [\]]+$/, "").trim();
      if (!operand || NON_ROW_TERMS.test(operand)) continue;
      out.push(operand);
    }
  }
  return out;
}

/** Functions that pull the owning folder out of a storage object's name. */
const PATH_EXTRACTORS = /storage\.foldername|split_part|string_to_array|ltree/;

export interface ScopeOptions {
  /** Storage policies must also derive the owner from the object path. */
  readonly requirePathExtraction?: boolean;
  /** The table the policy is on — needed to judge subquery correlation. */
  readonly outerTable?: string;
  /** That table's declared columns, for the unqualified-reference case. */
  readonly outerColumns?: readonly string[];
}

/**
 * Split `expr` into the part outside any subquery and the subqueries
 * themselves. A subquery is a parenthesised group whose body starts `select`.
 */
export function stripSubqueries(expr: string): {
  readonly outer: string;
  readonly subqueries: string[];
} {
  const subqueries: string[] = [];
  let outer = "";
  let index = 0;
  while (index < expr.length) {
    if (expr[index] === "(" && /^\(\s*select\b/.test(expr.slice(index))) {
      let depth = 0;
      let end = index;
      for (let cursor = index; cursor < expr.length; cursor += 1) {
        if (expr[cursor] === "(") depth += 1;
        else if (expr[cursor] === ")") {
          depth -= 1;
          if (depth === 0) {
            end = cursor;
            break;
          }
        }
      }
      subqueries.push(expr.slice(index + 1, end).trim());
      outer += " SUBQUERY ";
      index = end + 1;
      continue;
    }
    outer += expr[index];
    index += 1;
  }
  return { outer, subqueries };
}

/**
 * `true` when `subquery` refers back to the row the policy is filtering.
 *
 * This is the whole of finding D1. A subquery can contain a perfectly good
 * `owner_id = auth.uid()` and still say nothing about the current row:
 *
 * ```sql
 * -- "if you own ANY vehicle, read EVERYONE's records"
 * using (exists (select 1 from vehicles v where v.owner_id = auth.uid()))
 * ```
 *
 * The equality is there, the tautology check passes, and the policy is wide
 * open to every user who owns a single truck. What is missing is the join back
 * to the outer row — `v.id = records.vehicle_id`. Correlation *is* the
 * ownership claim; without it the subquery is a global yes/no about the
 * caller.
 *
 * Both spellings of the back-reference count: qualified (`records.vehicle_id`,
 * which is the clearer one) and unqualified (`vehicle_id`, which Postgres
 * resolves outward when the inner tables have no such column). Rejecting the
 * unqualified form would fail a correct policy, so it is accepted — via the
 * outer table's declared columns, ignoring any that arrive with an alias
 * prefix.
 *
 * ## CLOSED IN T2-202: the shared-column-name gap
 *
 * Accepting the unqualified spelling used to cost something. The bare-name
 * test matched column *names* and did not resolve them against the subquery's
 * own `from` list, so when the inner table declared a column of the same name
 * as an outer one, a bare mention was read as a back-reference to the outer
 * row when it was nothing of the kind — and the uncorrelated subquery D1
 * exists to catch was waved through.
 *
 * It was reachable with this contract's own columns: `records` and `vehicles`
 * share exactly `{id, odometer_km}`. Two shapes, both of which used to pass:
 *
 * ```sql
 * -- `id = id` is a self-join on the INNER table. Reads as correlation. Is not.
 * exists (select 1 from vehicles v where id = id and v.owner_id = auth.uid())
 *
 * -- bare `odometer_km` resolves to vehicles.odometer_km, never to records'.
 * exists (select 1 from vehicles v where odometer_km > 0 and v.owner_id = auth.uid())
 * ```
 *
 * The fix, recorded on T2-201's handoff and landed with T2-202's first real
 * policy: read the subquery's own `from`/`join` list and **subtract those
 * tables' declared columns from `outerColumns` before the bare-name test**. A
 * name the inner table also declares cannot be evidence of an outward
 * reference, because Postgres resolves it inward. Both shapes above now
 * produce a finding, and both are pinned end-to-end as N13/N14 in
 * `reviewer-probes.test.ts` — the reviewer's P1/P2 — the same way N4 pins the
 * rule they are a hole in.
 *
 * Deliberately unchanged, because it is the safe half: the *qualified*
 * spelling (`records.vehicle_id`) still short-circuits to `true`, and a
 * subquery whose only candidate names have all been subtracted is judged
 * uncorrelated rather than unknown. This rule fails **closed** now — it can
 * reject a policy that correlates through something this module cannot see
 * (a view, a CTE, a table outside `USER_TABLES`), and rejecting a correct
 * policy is the direction a security grader should err in.
 */
export function isCorrelated(subquery: string, options: ScopeOptions): boolean {
  // With no table context there is nothing to correlate against, so this
  // cannot judge and must not invent a finding.
  if (!options.outerTable) return true;
  if (subquery.includes(`${options.outerTable}.`)) return true;

  // A bare name the subquery's OWN tables declare resolves inward, so it says
  // nothing about the outer row.
  const inner = new Set(
    subqueryTables(subquery).flatMap((table) => columnsOf(table))
  );
  return (options.outerColumns ?? [])
    .filter((column) => !inner.has(column))
    .some((column) => new RegExp(`(^|[^.a-z0-9_])${column}\\b`).test(subquery));
}

/**
 * The tables a subquery reads from, unqualified — the `from` and `join` list.
 *
 * Deliberately shallow: it collects names, it does not resolve aliases or
 * nesting. It only has to be right about which *declared* columns could
 * resolve inward, and a name it misses simply leaves that column in the
 * candidate set, which is the direction the old bug ran in — so a miss here
 * cannot be worse than not having the check at all.
 */
export function subqueryTables(subquery: string): string[] {
  return [
    ...subquery.matchAll(/\b(?:from|join)\s+(?:[a-z0-9_]+\.)?([a-z0-9_]+)/g),
  ].map((match) => match[1]);
}

/**
 * `true` when **every top-level `or` branch** of `expr` ties the row to the
 * caller.
 *
 * Every branch, because `or` is how a careful-looking predicate gets widened
 * to everything. One branch that grants unconditionally grants
 * unconditionally, however scoped its neighbours are.
 */
export function isOwnerScoped(
  expr: string | null,
  options: ScopeOptions = {}
): boolean {
  if (expr === null) return false;
  const branches = splitTopLevel(unwrap(expr), "or");
  if (branches.length === 0) return false;
  return branches.every((branch) => branchIsOwnerScoped(branch, options));
}

function branchIsOwnerScoped(branch: string, options: ScopeOptions): boolean {
  if (isTautological(branch)) return false;
  const canonical = canonicalizeAuthUid(branch);
  if (options.requirePathExtraction && !PATH_EXTRACTORS.test(canonical)) {
    return false;
  }

  const { outer, subqueries } = stripSubqueries(canonical);

  // A comparison on the row itself needs no correlation — it *is* the row.
  if (authUidComparands(outer).length > 0) return true;

  // Otherwise the claim rests entirely on a subquery, and a subquery only
  // speaks about this row if it mentions this row (D1).
  const owning = subqueries.filter(
    (subquery) => authUidComparands(subquery).length > 0
  );
  if (owning.length === 0) return false;
  return owning.some((subquery) => isCorrelated(subquery, options));
}

/* -------------------------------------------------------------------------
 * Policy rules
 * ---------------------------------------------------------------------- */

/**
 * The predicate Postgres actually applies to new rows.
 *
 * For `update` and `all`, omitting `with check` is not an omission: Postgres
 * reuses the `using` expression for the write side. Treating a missing clause
 * as a finding would reject `for all using (owner_id = auth.uid())`, which is
 * both idiomatic and correct.
 */
export function effectiveCheck(policy: PolicyDefinition): string | null {
  if (policy.withCheckExpr !== null) return policy.withCheckExpr;
  if (policy.command === "update" || policy.command === "all") {
    return policy.usingExpr;
  }
  return null;
}

const READ_COMMANDS = new Set(["select", "update", "delete", "all"]);
const WRITE_COMMANDS = new Set(["insert", "update", "all"]);

function policyIssues(
  policy: PolicyDefinition,
  options: ScopeOptions
): string[] {
  const issues: string[] = [];
  const where = `${policy.table} policy "${policy.name}" (for ${policy.command})`;

  if (
    policy.roles.length === 0 ||
    policy.roles.some((role) => role === "anon" || role === "public")
  ) {
    issues.push(
      `${where}: granted to ${policy.roles.length === 0 ? "public (no `to` clause)" : policy.roles.join(", ")}`
    );
  }

  // Restrictive policies only ever narrow what a permissive policy granted, so
  // they are not required to be owner-scoped on their own.
  if (!policy.permissive) return issues;

  if (READ_COMMANDS.has(policy.command)) {
    if (!isOwnerScoped(policy.usingExpr, options)) {
      issues.push(
        `${where}: \`using\` is not owner-scoped — ` +
          `${policy.usingExpr === null ? "no using clause" : `using (${policy.usingExpr})`}`
      );
    }
  }
  if (WRITE_COMMANDS.has(policy.command)) {
    const check = effectiveCheck(policy);
    if (!isOwnerScoped(check, options)) {
      issues.push(
        `${where}: \`with check\` is not owner-scoped — ` +
          `${check === null ? "no with check clause" : `with check (${check})`}`
      );
    }
  }
  return issues;
}

/** The declared columns of a contract table, for correlation checking. */
function columnsOf(table: string): readonly string[] {
  return (
    USER_TABLES.find((entry) => entry.name === table)?.columns.map(
      (column) => column.name
    ) ?? []
  );
}

/** Every finding against the policies on the named user tables. */
export function userTablePolicyIssues(
  normalized: string,
  tables: readonly string[]
): string[] {
  const found = policies(normalized).filter((policy) =>
    tables.includes(policy.table)
  );
  const issues = found.flatMap((policy) =>
    policyIssues(policy, {
      outerTable: policy.table,
      outerColumns: columnsOf(policy.table),
    })
  );

  for (const table of tables) {
    if (!found.some((policy) => policy.table === table)) {
      issues.push(`${table}: no policy at all`);
    }
  }
  return issues;
}

/**
 * Every finding against `storage.objects` policies.
 *
 * Same rule as the tables plus one: the predicate has to derive the owner from
 * the object's *path*, because that is the only thing about a storage row that
 * says whose it is. Finding F2 was a policy that checked the bucket and the
 * session and never the path.
 */
export function storagePolicyIssues(normalized: string): string[] {
  const found = policies(normalized).filter(
    (policy) => policy.table === "objects"
  );
  if (found.length === 0) return ["storage.objects: no policy at all"];
  return found.flatMap((policy) =>
    policyIssues(policy, {
      requirePathExtraction: true,
      outerTable: "objects",
      outerColumns: ["name", "bucket_id", "owner", "id"],
    })
  );
}

/** Which SQL commands each table's policies cover. */
export function coveredCommands(
  normalized: string,
  table: string
): Set<string> {
  const covered = new Set<string>();
  for (const policy of policies(normalized)) {
    if (policy.table !== table || !policy.permissive) continue;
    if (policy.command === "all") {
      for (const command of ["select", "insert", "update", "delete"]) {
        covered.add(command);
      }
    } else {
      covered.add(policy.command);
    }
  }
  return covered;
}

/* -------------------------------------------------------------------------
 * Storage bucket privacy
 * ---------------------------------------------------------------------- */

/**
 * Every finding against the privacy of `bucket`.
 *
 * Three ways to get this wrong, and the first version of the harness caught
 * none of them reliably (T2-201 review, F5): create it public; create it
 * private and flip it in a later migration; create it private and flip it in
 * the same statement's `on conflict do update`. So the check is scoped to the
 * statements that touch `storage.buckets` — not, as before, to a slice running
 * to the end of the file, where a stray `false` anywhere satisfied it.
 */
export function bucketPrivacyIssues(
  normalized: string,
  bucket: string
): string[] {
  const issues: string[] = [];
  const literal = `'${bucket}'`;
  const touching = statements(normalized).filter(
    (statement) =>
      (statement.includes("storage.buckets") ||
        statement.includes("create_bucket")) &&
      statement.includes(literal)
  );

  const creating = touching.filter(
    (statement) =>
      statement.startsWith("insert into storage.buckets") ||
      statement.includes("create_bucket")
  );
  if (creating.length === 0) {
    issues.push(`no statement creates the ${bucket} bucket`);
  }

  for (const statement of touching) {
    // Inside a statement that names this bucket, `true` can only be the
    // public flag — there is nothing else boolean in a bucket row worth
    // setting. Position-independent on purpose: the review's probe passed by
    // putting the value before the name.
    if (/\btrue\b/.test(statement)) {
      issues.push(
        `a statement sets ${bucket} public: ${statement.slice(0, 160)}`
      );
    }
    if (
      statement.startsWith("insert into storage.buckets") &&
      !/\bfalse\b/.test(statement)
    ) {
      issues.push(
        `${bucket} is created without an explicit public = false: ` +
          statement.slice(0, 160)
      );
    }
  }

  // A later mutation that names no bucket flips every bucket, including this
  // one, so it is a finding even though the loop above cannot see it.
  for (const statement of statements(normalized)) {
    if (!statement.startsWith("update storage.buckets")) continue;
    if (/set[\s\S]*public\s*=\s*true/.test(statement)) {
      issues.push(
        `a later update sets buckets public: ${statement.slice(0, 160)}`
      );
    }
  }
  return issues;
}

/* -------------------------------------------------------------------------
 * Column rules
 * ---------------------------------------------------------------------- */

/**
 * `true` when `table.column` is optional in the sense GAR-02′ means it.
 *
 * Nullable is the obvious spelling. `not null default '{}'` is the other one,
 * and it is a better model for the reference arrays — an empty array *is* "no
 * references", with none of the null-versus-empty ambiguity (T2-201 review,
 * F8).
 */
export function isOptionalColumn(
  normalized: string,
  table: string,
  column: string,
  allowAbsenceDefault: boolean
): boolean {
  const body = createTableBody(normalized, table);
  const definition = columnDefinition(body ?? "", column);
  if (!definition) return false;
  const notNull = /\bnot null\b/.test(definition.definition);
  if (!notNull) return true;
  if (!allowAbsenceDefault) return false;
  return representsAbsence(defaultExpression(definition.definition));
}

/** Re-exported so the probe suite can reach the parser it is grading. */
export { parenExpression };
