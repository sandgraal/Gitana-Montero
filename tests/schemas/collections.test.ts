/**
 * Graders — the *registered collections*, not just the schema factory.
 *
 * Why this file exists: every other T103 grader tests
 * `defineEntrySchema`. A perfect factory does not make the site bilingual if
 * `src/content.config.ts` never calls it. A `defineCollection({ schema })`
 * that hand-rolls its shape — or calls the factory and then relaxes it with
 * `.partial()` on `prose` — satisfies every factory grader while shipping a
 * collection that happily accepts a one-locale entry. I18N-06 is a claim
 * about entries in collections, so it has to be graded there.
 *
 * This is reachable because `vitest.config.ts` runs through Astro's own Vite
 * config (`getViteConfig`), which resolves the virtual `astro:content`
 * module. Importing `src/content.config.ts` from a test therefore works.
 *
 * The graders are deliberately generic: they say nothing about which
 * collections exist or what fields they carry, only that whatever is
 * registered enforces the locale rule. They assert on `prose.*` issue paths
 * rather than on overall success, so a collection requiring fields the
 * fixture does not carry still grades correctly.
 *
 * ## Expected-failure convention
 *
 * `it.fails` is the marker; T104 activates a grader by deleting exactly that
 * `.fails`. Full note in
 * `tests/schemas/prose-locale-completeness.test.ts`. Today `collections` is
 * `{}` (the T101 scaffold), so every grader here fails on the
 * "at least one collection" assertion.
 *
 * refs specs/001-foundation (I18N-06, SCF-01, SCF-04)
 */
import { describe, expect, it } from "vitest";
import { z } from "astro/zod";
import { collections } from "../../src/content.config.ts";
import { issuePaths } from "../helpers/schema-outcome.ts";
import {
  makeCoreEntry,
  makeProseEn,
  makeProseEs,
} from "../fixtures/schema-fixtures.ts";

interface RegisteredCollection {
  schema?: unknown;
}

interface Parsable {
  safeParse(value: unknown): unknown;
}

/**
 * Astro allows a collection `schema` to be either a Zod schema or a function
 * of a context (`{ image }`) returning one. Both forms are unwrapped here so
 * T104 is free to use either.
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
      "collection schema is not parsable — every collection registered in " +
        "src/content.config.ts must define a Zod schema (SCF-01)"
    );
  }

  return resolved as Parsable;
}

const registered = () => Object.entries(collections as Record<string, unknown>);

describe("registered content collections enforce the locale rule", () => {
  it.fails("registers at least one content collection", () => {
    expect(registered().length).toBeGreaterThan(0);
  });

  it.fails("gives every registered collection a parsable Zod schema", () => {
    const entries = registered();
    expect(entries.length).toBeGreaterThan(0);

    for (const [name, collection] of entries) {
      expect(() => schemaOf(collection), name).not.toThrow();
    }
  });

  it.fails.each(["es", "en"])(
    "every registered collection rejects an entry missing prose.%s, " +
      "naming the field",
    (missing) => {
      const entries = registered();
      expect(entries.length).toBeGreaterThan(0);

      const present = missing === "es" ? "en" : "es";
      const entry = makeCoreEntry();
      entry.prose = {
        [present]: present === "en" ? makeProseEn() : makeProseEs(),
      };

      for (const [name, collection] of entries) {
        const outcome = schemaOf(collection).safeParse(entry);
        expect(issuePaths(outcome), name).toContain(`prose.${missing}`);
      }
    }
  );

  it.fails(
    "no registered collection flags a locale when both are present " +
      "(positive control: the rule is completeness, not rejection)",
    () => {
      const entries = registered();
      expect(entries.length).toBeGreaterThan(0);

      for (const [name, collection] of entries) {
        const paths = issuePaths(
          schemaOf(collection).safeParse(makeCoreEntry())
        );
        expect(paths, name).not.toContain("prose.en");
        expect(paths, name).not.toContain("prose.es");
      }
    }
  );

  it.fails(
    "no registered collection accepts an entry with no prose at all",
    () => {
      const entries = registered();
      expect(entries.length).toBeGreaterThan(0);

      const entry = makeCoreEntry();
      delete entry.prose;

      for (const [name, collection] of entries) {
        const outcome = schemaOf(collection).safeParse(entry);
        expect((outcome as { success: boolean }).success, name).toBe(false);
      }
    }
  );
});
