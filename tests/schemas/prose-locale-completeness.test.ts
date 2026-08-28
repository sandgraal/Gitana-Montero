/**
 * Graders — every entry carries `prose.en` AND `prose.es`.
 *
 * I18N-06: "IF an entry's `prose` lacks either `en` or `es`, THEN THE build
 * SHALL fail (schema-level requirement, no exceptions field)."
 * AGENTS.md: "No page ships in one language. Both or neither. […] A missing
 * locale is a build error, not a review comment."
 * SCF-04: the failure names the file and the field. The *file* half is proved
 * end-to-end by T106's deliberate one-locale entry turning CI red; the
 * *field* half is what these graders pin down, by asserting the issue path
 * and not merely that parsing failed.
 *
 * ## Expected-failure convention (read before editing)
 *
 * Every grader below is declared `it.fails(...)` / `it.fails.each(...)`.
 * `src/schemas/entry.ts` is a T103 seam stub, so each body throws today and
 * Vitest records the test as passing *because it failed*. The marker is the
 * literal text `.fails` on the `it` line — nothing else. That today's throw
 * is the seam throw, and not a typo'd import, is the job of the separate
 * canary in `tests/schemas/seam-contract.test.ts`.
 *
 * T104 activates a grader by **deleting exactly that `.fails`** and nothing
 * else. Leaving one on after the seam is implemented turns the suite red
 * ("expected test to fail"), so activation cannot be forgotten silently.
 * Implementers must not otherwise edit this file (AGENTS.md separation rule,
 * audited by T901).
 *
 * refs specs/001-foundation (I18N-06, SCF-04)
 */
import { describe, expect, it } from "vitest";
import { z } from "astro/zod";
import { defineEntrySchema } from "../../src/schemas/entry.ts";
import {
  issueCodes,
  issuePaths,
  unrecognizedKeys,
} from "../helpers/schema-outcome.ts";
import {
  makeProseEn,
  makeProseEs,
  makeValidEntry,
} from "../fixtures/schema-fixtures.ts";

/**
 * Built inside each test, never at module scope: at module scope the seam
 * stub's throw would abort collection and report an unhandled suite error
 * instead of a clean expected failure.
 */
const entrySchema = () =>
  defineEntrySchema(
    { torqueNm: z.number(), oemPartNumber: z.string() },
    { title: z.string(), summary: z.string() }
  );

const proseFor = (locale: string) =>
  locale === "en" ? makeProseEn() : makeProseEs();

const bothLocales = () => ({ en: makeProseEn(), es: makeProseEs() });

describe("entry prose: both locales required (I18N-06)", () => {
  it.fails("accepts an entry that carries both `en` and `es` prose", () => {
    const outcome = entrySchema().safeParse(makeValidEntry());

    expect(issuePaths(outcome)).toEqual([]);
    expect(outcome.success).toBe(true);
  });

  it.fails.each([
    ["en", "es"],
    ["es", "en"],
  ])(
    "rejects a %s-only entry, naming the field `prose.%s`",
    (present, missing) => {
      const entry = makeValidEntry();
      entry.prose = { [present]: proseFor(present) };

      const outcome = entrySchema().safeParse(entry);

      expect(outcome.success).toBe(false);
      expect(issuePaths(outcome)).toContain(`prose.${missing}`);
      expect(issueCodes(outcome)).toContain("invalid_type");
    }
  );

  it.fails("rejects an entry whose `prose` is an empty object", () => {
    const entry = makeValidEntry();
    entry.prose = {};

    const outcome = entrySchema().safeParse(entry);

    expect(outcome.success).toBe(false);
    expect(issuePaths(outcome)).toEqual(
      expect.arrayContaining(["prose.en", "prose.es"])
    );
  });

  it.fails("rejects an entry with no `prose` key at all", () => {
    const entry = makeValidEntry();
    delete entry.prose;

    const outcome = entrySchema().safeParse(entry);

    expect(outcome.success).toBe(false);
    expect(issuePaths(outcome)).toContain("prose");
  });

  it.fails.each(["en", "es"])(
    "rejects `prose.%s = null` — null is not an escape hatch for a locale",
    (locale) => {
      const entry = makeValidEntry();
      entry.prose = { ...bothLocales(), [locale]: null };

      const outcome = entrySchema().safeParse(entry);

      expect(outcome.success).toBe(false);
      expect(issuePaths(outcome)).toContain(`prose.${locale}`);
    }
  );

  it.fails.each(["en", "es"])(
    "rejects a `prose.%s` that is present but empty — a stub is not a locale",
    (locale) => {
      const entry = makeValidEntry();
      entry.prose = { ...bothLocales(), [locale]: {} };

      const outcome = entrySchema().safeParse(entry);

      expect(outcome.success).toBe(false);
      expect(issuePaths(outcome)).toEqual(
        expect.arrayContaining([
          `prose.${locale}.title`,
          `prose.${locale}.summary`,
        ])
      );
    }
  );

  it.fails.each(["en", "es"])(
    "rejects a whitespace-only field in `prose.%s` — blank is still missing",
    (locale) => {
      const entry = makeValidEntry();
      entry.prose = {
        ...bothLocales(),
        [locale]: { ...proseFor(locale), summary: "   " },
      };

      const outcome = entrySchema().safeParse(entry);

      expect(outcome.success).toBe(false);
      expect(issuePaths(outcome)).toContain(`prose.${locale}.summary`);
    }
  );

  it.fails(
    "rejects a third locale key in `prose` — spec §2 allows en and es only",
    () => {
      const entry = makeValidEntry();
      entry.prose = { ...bothLocales(), pt: makeProseEn() };

      const outcome = entrySchema().safeParse(entry);

      expect(outcome.success).toBe(false);
      expect(unrecognizedKeys(outcome)).toContain("pt");
    }
  );

  it.fails(
    "has no exceptions field that lets one locale ship alone (I18N-06)",
    () => {
      const entry = makeValidEntry();
      entry.prose = { en: makeProseEn() };
      entry["localeExceptions"] = ["es"];
      entry["translationPending"] = true;

      const outcome = entrySchema().safeParse(entry);

      expect(outcome.success).toBe(false);
      expect(issuePaths(outcome)).toContain("prose.es");
      expect(unrecognizedKeys(outcome)).toEqual(
        expect.arrayContaining(["localeExceptions", "translationPending"])
      );
    }
  );
});
