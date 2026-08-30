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

/** One `create policy` statement, decomposed. */
export interface PolicyDefinition {
  readonly name: string;
  readonly table: string;
  /** `select` | `insert` | `update` | `delete` | `all` */
  readonly command: string;
  /** The roles named in `to …`; empty means the SQL default, `public`. */
  readonly roles: readonly string[];
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
        statement,
      };
    });
}

/** `true` when the SQL enables RLS on `table`. */
export function enablesRls(normalized: string, table: string): boolean {
  const pattern = new RegExp(
    `alter table (?:if exists )?(?:public\\.)?${table} enable row level security`
  );
  return pattern.test(normalized);
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
  const pattern = new RegExp(
    `alter table (?:if exists )?(?:public\\.)?${table} force row level security`
  );
  return pattern.test(normalized);
}

/**
 * The referenced table of a column's `references …` clause, plus whether the
 * reference is declared `on delete cascade`.
 */
export function foreignKey(
  definition: string
): { readonly target: string; readonly cascades: boolean } | null {
  const match =
    /references\s+(?:([a-z0-9_]+)\.)?([a-z0-9_]+)\s*\(([^)]*)\)([\s\S]*)$/.exec(
      definition
    );
  if (!match) return null;
  const schema = match[1] ? `${match[1]}.` : "";
  return {
    target: `${schema}${match[2]}`,
    cascades: /on delete cascade/.test(match[4]),
  };
}
