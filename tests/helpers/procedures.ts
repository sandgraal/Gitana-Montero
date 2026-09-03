/**
 * The one way the T502a graders reach the `procedures` schema: through the
 * **registered collection**, never through a schema value a grader imported
 * directly.
 *
 * `tests/schemas/collections.test.ts` states the reason for the whole repo: "a
 * perfect factory does not make the site bilingual if `src/content.config.ts`
 * never calls it". A `proceduresSchema` exported from `src/schemas/` and never
 * wired into `content.config.ts` would satisfy every field-level grader while
 * shipping a collection that still accepts anything — and `procedures` is
 * *already* registered today, on the placeholder `baseEntrySchema()`, so that
 * failure mode is not hypothetical here. It is the current state.
 *
 * refs specs/001-foundation (PRC-01, PRC-02, PRC-03, SCF-01)
 */
import { z } from "astro/zod";
import { collections } from "../../src/content.config.ts";
import { issuesOf } from "./schema-outcome.ts";

interface RegisteredCollection {
  schema?: unknown;
}

interface Parsable {
  safeParse(value: unknown): unknown;
}

/**
 * Astro allows a collection `schema` to be a Zod schema or a function of a
 * context (`{ image }`) returning one. Both are unwrapped, exactly as
 * `tests/schemas/collections.test.ts` does, so T502 is free to use either.
 */
function schemaOf(collection: unknown): Parsable {
  const { schema } = (collection ?? {}) as RegisteredCollection;
  const resolved =
    typeof schema === "function"
      ? (schema as (context: { image: () => unknown }) => unknown)({
          image: () => z.any(),
        })
      : schema;

  if (
    typeof resolved !== "object" ||
    resolved === null ||
    typeof (resolved as Parsable).safeParse !== "function"
  ) {
    throw new Error(
      "the registered `procedures` collection has no parsable schema — " +
        "src/content.config.ts must register it through defineEntrySchema " +
        "(SCF-01). refs specs/001-foundation"
    );
  }

  return resolved as Parsable;
}

/** The registered `procedures` collection's schema. */
export function proceduresCollectionSchema(): Parsable {
  const registered = (collections as Record<string, unknown>)["procedures"];
  if (registered === undefined) {
    throw new Error(
      "no `procedures` collection is registered in src/content.config.ts " +
        "(PRC-01). refs specs/001-foundation"
    );
  }
  return schemaOf(registered);
}

/** One entry, parsed by the collection the site actually builds from. */
export function parseProcedure(entry: unknown): unknown {
  return proceduresCollectionSchema().safeParse(entry);
}

/** Dotted issue paths, sorted — order is not part of any contract graded here. */
export function procedureIssuePaths(entry: unknown): string[] {
  return issuesOf(parseProcedure(entry))
    .map((issue) => issue.path.map(String).join("."))
    .sort();
}

/**
 * The issues reported against `path`, or against anything nested under it.
 *
 * Nesting matters: a bad `time.unit` is reported at `time.unit`, and a grader
 * asking "did this entry's `time` get rejected" must not have to guess how deep
 * the schema chose to report. Prefix matching is on **path segments**, so
 * `time` does not match `timeline`.
 */
export function issuesUnder(
  entry: unknown,
  path: string
): { path: string; message: string }[] {
  return issuesOf(parseProcedure(entry))
    .map((issue) => ({
      path: issue.path.map(String).join("."),
      message: issue.message,
    }))
    .filter(
      (issue) => issue.path === path || issue.path.startsWith(`${path}.`)
    );
}

/** Whether the registered schema accepts `entry` outright. */
export function accepts(entry: unknown): boolean {
  const outcome = parseProcedure(entry) as { success?: boolean };
  return outcome.success === true;
}

/**
 * The parsed entry, with every `.default([])` the schema applies — what a page
 * actually receives as `entry.data`.
 *
 * Throws, naming the issues, rather than returning `undefined`: a render
 * grader handed an invalid fixture would otherwise fail somewhere far away,
 * and the reason would be gone by then.
 */
export function parsedProcedureData(entry: unknown): Record<string, unknown> {
  const outcome = parseProcedure(entry) as {
    success?: boolean;
    data?: unknown;
  };
  if (outcome.success !== true) {
    throw new Error(
      `the fixture does not parse against the registered \`procedures\` ` +
        `schema:\n` +
        issuesOf(outcome)
          .map(
            (issue) =>
              `  • ${issue.path.map(String).join(".")}: ${issue.message}`
          )
          .join("\n")
    );
  }
  return outcome.data as Record<string, unknown>;
}
