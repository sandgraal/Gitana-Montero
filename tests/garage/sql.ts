/**
 * Grader infrastructure — the *declaration* tier of the T2-201 harness.
 *
 * This module reads whatever DDL T2-202 ships under `supabase/` and turns it
 * into something assertable. It is not an implementation of anything the spec
 * asks for; it is the instrument the graders read the implementation with.
 *
 * ## Why a declaration tier exists at all
 *
 * The behavioural tier (`harness.ts`) proves RLS the only way it can honestly
 * be proved: by asking a real Postgres, through a real API, as three real
 * actors. That needs `supabase start`, which needs Docker, which CI does not
 * have today (see `harness.ts` for the full infrastructure note). If that were
 * the only tier, every RLS guarantee in this repo would be unproven on the
 * merge path — the exact situation AGENTS.md's "proven by graders before
 * content flows" forbids.
 *
 * So the declaration tier runs everywhere, with no Docker and no network, and
 * pins the invariants that are visible in the DDL itself: RLS enabled *and*
 * forced, no policy granted to `anon`/`public`, share flags defaulting to
 * false, ownership chains declared `on delete cascade`, the receipts bucket
 * created non-public. Those are not a substitute for the behavioural proofs.
 * They are the half that can never silently stop running.
 *
 * ## Deliberately not a SQL parser
 *
 * It normalises (comments out, whitespace collapsed, lower-cased, string
 * literals preserved) and then extracts by structure: balanced-paren bodies
 * for `create table`, top-level comma splits for column definitions,
 * statement splits on top-level semicolons. Anything it cannot understand it
 * reports rather than guesses at — a silent "no match" in a security grader
 * is worse than no grader.
 *
 * refs specs/002-montero-garage (SHR-01, ACC-03, GAR-05′, MIG-03)
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

/** Repo root, resolved from this file so the graders are cwd-independent. */
const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));

/** Where the Supabase CLI keeps a project's DDL. */
export const MIGRATIONS_DIR = join(REPO_ROOT, "supabase", "migrations");

/** Where the Supabase CLI keeps local stack + auth configuration. */
export const CONFIG_PATH = join(REPO_ROOT, "supabase", "config.toml");

/**
 * The seam message. Every declaration-tier grader is expected to fail today
 * with *this* — not with a typo, not with a bad path. `harness-contract.test.ts`
 * is the unmarked canary that proves it, so the `it.fails` markers elsewhere
 * are honest.
 */
export const SEAM_NOT_IMPLEMENTED = "not implemented: T2-202";

function seam(what: string): Error {
  return new Error(
    `${SEAM_NOT_IMPLEMENTED} — ${what}. T2-201 declared the user-data ` +
      `contract as graders; T2-202 [PLATFORM] ships the DDL that satisfies ` +
      `it (refs specs/002-montero-garage)`
  );
}

/* -------------------------------------------------------------------------
 * Reading
 * ---------------------------------------------------------------------- */

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

/** `true` once T2-202 has landed any migration at all. */
export function migrationsExist(): boolean {
  return isDirectory(MIGRATIONS_DIR) && listMigrationFiles().length > 0;
}

function listMigrationFiles(): string[] {
  if (!isDirectory(MIGRATIONS_DIR)) return [];
  return readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith(".sql"))
    .sort();
}

/**
 * Every migration concatenated in filename order — which for the Supabase CLI
 * is timestamp order, i.e. the order Postgres will apply them.
 *
 * Throws the seam error when there are none, so a grader that has not been
 * activated yet fails for a reason a human can read.
 */
export function readMigrationSql(): string {
  const files = listMigrationFiles();
  if (files.length === 0) {
    throw seam(`no .sql migrations found under supabase/migrations/`);
  }
  return files
    .map((name) => readFileSync(join(MIGRATIONS_DIR, name), "utf8"))
    .join("\n");
}

/** `supabase/config.toml` as text, or the seam error if T2-202 has not run. */
export function readSupabaseConfig(): string {
  if (!isFile(CONFIG_PATH)) {
    throw seam(`supabase/config.toml does not exist`);
  }
  return readFileSync(CONFIG_PATH, "utf8");
}

/* -------------------------------------------------------------------------
 * Normalising
 * ---------------------------------------------------------------------- */

/**
 * Lower-case the SQL, drop `--` and block comments, collapse whitespace.
 *
 * String literals survive intact apart from the case fold, because a `--`
 * inside `'…'` is data, not a comment, and a normaliser that eats it would
 * corrupt exactly the policy expressions these graders read.
 */
export function normalizeSql(sql: string): string {
  let out = "";
  let index = 0;
  while (index < sql.length) {
    const two = sql.slice(index, index + 2);
    if (two === "--") {
      const end = sql.indexOf("\n", index);
      index = end === -1 ? sql.length : end;
      continue;
    }
    if (two === "/*") {
      const end = sql.indexOf("*/", index + 2);
      index = end === -1 ? sql.length : end + 2;
      continue;
    }
    const char = sql[index];
    if (char === "'" || char === '"') {
      const quote = char;
      let cursor = index + 1;
      while (cursor < sql.length) {
        if (sql[cursor] === quote && sql[cursor + 1] === quote) {
          cursor += 2;
          continue;
        }
        if (sql[cursor] === quote) break;
        cursor += 1;
      }
      out += sql.slice(index, Math.min(cursor + 1, sql.length));
      index = cursor + 1;
      continue;
    }
    // `$$ … $$` bodies (functions) are copied through verbatim: their
    // contents are SQL too, and the cascade/policy graders read them.
    if (two === "$$") {
      const end = sql.indexOf("$$", index + 2);
      const stop = end === -1 ? sql.length : end + 2;
      out += sql.slice(index, stop);
      index = stop;
      continue;
    }
    out += char;
    index += 1;
  }
  return out.toLowerCase().replace(/\s+/g, " ").trim();
}

/** Normalised migration SQL, ready to assert against. */
export function migrationSql(): string {
  return normalizeSql(readMigrationSql());
}

/** Split normalised SQL into statements on top-level semicolons. */
export function statements(normalized: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  let inDollar = false;
  for (let index = 0; index < normalized.length; index += 1) {
    if (normalized.startsWith("$$", index)) {
      inDollar = !inDollar;
      index += 1;
      continue;
    }
    if (inDollar) continue;
    const char = normalized[index];
    if (char === "(") depth += 1;
    else if (char === ")") depth -= 1;
    else if (char === ";" && depth === 0) {
      const statement = normalized.slice(start, index).trim();
      if (statement) out.push(statement);
      start = index + 1;
    }
  }
  const tail = normalized.slice(start).trim();
  if (tail) out.push(tail);
  return out;
}

/* -------------------------------------------------------------------------
 * Extracting
 * ---------------------------------------------------------------------- */

/** The parenthesised body of `create table <name> ( … )`, or `null`. */
export function createTableBody(
  normalized: string,
  table: string
): string | null {
  const pattern = new RegExp(
    `create table (?:if not exists )?(?:public\\.)?${table}\\s*\\(`
  );
  const match = pattern.exec(normalized);
  if (!match) return null;
  const open = match.index + match[0].length - 1;
  let depth = 0;
  for (let index = open; index < normalized.length; index += 1) {
    if (normalized[index] === "(") depth += 1;
    else if (normalized[index] === ")") {
      depth -= 1;
      if (depth === 0) return normalized.slice(open + 1, index).trim();
    }
  }
  return null;
}

/** Split a `create table` body into its top-level comma-separated items. */
export function tableItems(body: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < body.length; index += 1) {
    const char = body[index];
    if (char === "(") depth += 1;
    else if (char === ")") depth -= 1;
    else if (char === "," && depth === 0) {
      out.push(body.slice(start, index).trim());
      start = index + 1;
    }
  }
  const tail = body.slice(start).trim();
  if (tail) out.push(tail);
  return out.filter(Boolean);
}

/** One column definition, as written. */
export interface ColumnDefinition {
  readonly name: string;
  /** Everything after the name: type, constraints, default. */
  readonly definition: string;
}

const TABLE_CONSTRAINT_KEYWORDS = [
  "primary key",
  "foreign key",
  "unique",
  "check",
  "constraint",
  "exclude",
  "like",
];

/** Column definitions from a `create table` body, constraints filtered out. */
export function columnDefinitions(body: string): ColumnDefinition[] {
  return tableItems(body)
    .filter(
      (item) =>
        !TABLE_CONSTRAINT_KEYWORDS.some((keyword) => item.startsWith(keyword))
    )
    .map((item) => {
      const space = item.indexOf(" ");
      return space === -1
        ? { name: item, definition: "" }
        : { name: item.slice(0, space), definition: item.slice(space + 1) };
    });
}

/** Find one column's definition in a table body, or `null`. */
export function columnDefinition(
  body: string,
  column: string
): ColumnDefinition | null {
  return columnDefinitions(body).find((def) => def.name === column) ?? null;
}

/**
 * The `default …` expression of a column definition, or `null`.
 *
 * Stops at the next constraint keyword so `default false not null` yields
 * `false`, not `false not null`.
 */
export function defaultExpression(definition: string): string | null {
  const match = /\bdefault\s+(.+)$/.exec(definition);
  if (!match) return null;
  return match[1]
    .replace(
      /\b(not null|null|references|primary key|unique|check|generated)\b[\s\S]*$/,
      ""
    )
    .trim();
}

/**
 * The balanced-paren expression introduced by `keyword`, or `null`.
 *
 * `using (a = (b))` must yield `a = (b)` and not `a = (b`, which is why this
 * counts depth instead of reaching for the next `)`.
 */
export function parenExpression(
  statement: string,
  keyword: "using" | "with check"
): string | null {
  const opener = new RegExp(`\\b${keyword}\\s*\\(`).exec(statement);
  if (!opener) return null;
  const open = opener.index + opener[0].length - 1;
  let depth = 0;
  for (let index = open; index < statement.length; index += 1) {
    if (statement[index] === "(") depth += 1;
    else if (statement[index] === ")") {
      depth -= 1;
      if (depth === 0) return statement.slice(open + 1, index).trim();
    }
  }
  return null;
}

/** One `create policy` statement, decomposed. */
export interface PolicyDefinition {
  readonly name: string;
  readonly table: string;
  /** `select` | `insert` | `update` | `delete` | `all` */
  readonly command: string;
  /** The roles named in `to …`; empty means the SQL default, `public`. */
  readonly roles: readonly string[];
  /**
   * The `using (…)` predicate, or `null`. Governs which rows are **visible**
   * — reads, and which rows an update or delete may touch.
   *
   * Kept apart from `withCheckExpr` because the T2-201 review found that
   * grading their concatenation grades nothing: a policy reading
   * `using (auth.uid() is not null) with check (owner_id = auth.uid())` has a
   * correct-looking string and hands every logged-in user everybody's rows.
   * The two clauses answer different questions and each has to be asked.
   */
  readonly usingExpr: string | null;
  /** The `with check (…)` predicate — which *new* rows are allowed. */
  readonly withCheckExpr: string | null;
  /** `false` for `as restrictive`. Restrictive policies filter, never grant. */
  readonly permissive: boolean;
  readonly statement: string;
}

/** Every `create policy` in the normalised SQL. */
export function policies(normalized: string): PolicyDefinition[] {
  return statements(normalized)
    .filter((statement) => statement.startsWith("create policy"))
    .map((statement) => {
      const name =
        /create policy "?([a-z0-9_ -]+)"? on/.exec(statement)?.[1]?.trim() ??
        "";
      const table =
        /\bon (?:(?:public|storage)\.)?([a-z0-9_]+)/.exec(statement)?.[1] ?? "";
      const command = /\bfor (all|select|insert|update|delete)\b/.exec(
        statement
      )?.[1];
      const roleClause = /\bto ([a-z0-9_, ]+?)(?= using| with check|$)/.exec(
        statement
      )?.[1];
      return {
        name,
        table,
        command: command ?? "all",
        roles: roleClause
          ? roleClause
              .split(",")
              .map((role) => role.trim())
              .filter(Boolean)
          : [],
        usingExpr: parenExpression(statement, "using"),
        withCheckExpr: parenExpression(statement, "with check"),
        permissive: !/\bas restrictive\b/.test(statement),
        statement,
      };
    });
}

/**
 * `alter table [ if exists ] [ only ] [public.]<table>` — the full spelling
 * Postgres accepts.
 *
 * `only` matters because `pg_dump` writes `ALTER TABLE ONLY`, so a schema
 * round-tripped through a dump would have failed the RLS graders while being
 * completely correct (T2-201 review, F6).
 */
function alterTablePrefix(table: string): string {
  return `alter table (?:if exists )?(?:only )?(?:public\\.)?${table}\\b`;
}

/** `true` when the SQL enables RLS on `table`. */
export function enablesRls(normalized: string, table: string): boolean {
  return new RegExp(
    `${alterTablePrefix(table)} enable row level security`
  ).test(normalized);
}

/**
 * `true` when the SQL *forces* RLS on `table`.
 *
 * `enable` alone exempts the table owner, and Supabase migrations run as the
 * owner — so a table that is only `enable`d is wide open to anything that
 * connects as that role. `force` closes it. This is the invariant most often
 * missed, which is why it is graded separately from `enable`.
 */
export function forcesRls(normalized: string, table: string): boolean {
  return new RegExp(`${alterTablePrefix(table)} force row level security`).test(
    normalized
  );
}

/**
 * The referenced table of a `references …` clause, plus whether the reference
 * is declared `on delete cascade`.
 *
 * The referenced column list is **optional**: `references auth.users on delete
 * cascade` is valid Postgres — it targets the primary key — and rejecting it
 * failed a correct schema (T2-201 review, F6).
 */
export function foreignKey(
  definition: string
): { readonly target: string; readonly cascades: boolean } | null {
  const match =
    /references\s+(?:([a-z0-9_]+)\.)?([a-z0-9_]+)\s*(?:\(([^)]*)\))?([\s\S]*)$/.exec(
      definition
    );
  if (!match) return null;
  const schema = match[1] ? `${match[1]}.` : "";
  return {
    target: `${schema}${match[2]}`,
    cascades: /on delete cascade/.test(match[4] ?? ""),
  };
}

/** The table-level constraint items of a `create table` body. */
export function tableConstraints(body: string): string[] {
  return tableItems(body).filter((item) =>
    TABLE_CONSTRAINT_KEYWORDS.some((keyword) => item.startsWith(keyword))
  );
}

/**
 * The foreign key on `table.column`, wherever it is declared.
 *
 * Postgres accepts three spellings and a schema is no less correct for
 * choosing one of the latter two, so all three are searched (T2-201 review,
 * F6): inline on the column, as a table-level `constraint … foreign key (…)`
 * inside `create table`, or bolted on afterwards with `alter table … add
 * constraint … foreign key (…)`, which is what `pg_dump` emits.
 */
export function foreignKeyFor(
  normalized: string,
  table: string,
  column: string
): { readonly target: string; readonly cascades: boolean } | null {
  const body = createTableBody(normalized, table);
  if (body) {
    const inline = columnDefinition(body, column);
    const fromColumn = inline ? foreignKey(inline.definition) : null;
    if (fromColumn) return fromColumn;

    for (const constraint of tableConstraints(body)) {
      const match = /foreign key\s*\(([^)]*)\)([\s\S]*)$/.exec(constraint);
      if (!match) continue;
      const columns = match[1].split(",").map((name) => name.trim());
      if (columns.includes(column)) return foreignKey(match[2]);
    }
  }

  for (const statement of statements(normalized)) {
    if (!new RegExp(`^${alterTablePrefix(table)}`).test(statement)) continue;
    const match = /foreign key\s*\(([^)]*)\)([\s\S]*)$/.exec(statement);
    if (!match) continue;
    const columns = match[1].split(",").map((name) => name.trim());
    if (columns.includes(column)) return foreignKey(match[2]);
  }
  return null;
}

/**
 * `true` when `table.column` cannot be null.
 *
 * **`primary key` implies `NOT NULL`** — in Postgres it is not an extra
 * constraint you may also want, it is part of what a primary key *is*. The
 * first version of this harness demanded the literal `not null` and therefore
 * failed a column spelled `id uuid primary key`, which is the spelling used in
 * its own sample DDL (T2-201 review, F6).
 */
export function isNotNullFor(
  normalized: string,
  table: string,
  column: string
): boolean {
  const body = createTableBody(normalized, table);
  if (!body) return false;
  const definition = columnDefinition(body, column);
  if (!definition) return false;
  if (/\bnot null\b/.test(definition.definition)) return true;
  if (/\bprimary key\b/.test(definition.definition)) return true;

  for (const constraint of tableConstraints(body)) {
    const match = /primary key\s*\(([^)]*)\)/.exec(constraint);
    if (!match) continue;
    if (
      match[1]
        .split(",")
        .map((name) => name.trim())
        .includes(column)
    ) {
      return true;
    }
  }
  return false;
}

/**
 * `true` when a default expression means "nothing here yet".
 *
 * GAR-02′ makes a record's reference arrays optional, and
 * `problem_ids text[] not null default '{}'` says exactly that — an empty
 * array is the absence of references, and it is a *better* modelling choice
 * than a nullable array because it removes the null/empty ambiguity. The
 * optionality grader has to accept it (T2-201 review, F8).
 */
export function representsAbsence(defaultExpr: string | null): boolean {
  if (defaultExpr === null) return false;
  const expr = defaultExpr.replace(/::[a-z_ \][]+$/, "").trim();
  return (
    /^'\{\s*\}'$/.test(expr) ||
    /^array\s*\[\s*\]$/.test(expr) ||
    /^'\[\s*\]'$/.test(expr) ||
    /^'\{\s*\}'::/.test(expr)
  );
}
