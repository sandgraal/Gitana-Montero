/**
 * Graders — the shared-data / prose split. Numbers are never translated.
 *
 * AGENTS.md: "Part numbers, torque specs, capacities, intervals, pressures,
 * clearances, and fitment are locale-independent `data`, stored once and
 * rendered into both languages. Never duplicate a number into a per-locale
 * field. If you find yourself writing the same figure twice, the schema is
 * wrong."
 * plan.md: prose holds only human-language text; `defineEntrySchema` is the
 * one place that shape is assembled, so it is the one place the rule can be
 * enforced structurally rather than by review.
 *
 * Two layers are graded, and both matter:
 *
 * 1. **Define time.** `defineEntrySchema` throws if the prose shape declares
 *    a numeric field, naming the field. This is the strong form: a numeric
 *    prose field can never reach a content author, because the collection
 *    fails to build at all. The wrapper cases (`.optional()`, `.nullable()`,
 *    `z.array(z.number())`) are in the table on purpose — without them the
 *    rule is one keystroke from being evaded.
 * 2. **Parse time.** Prose objects reject unknown keys, so a figure smuggled
 *    into an entry file is named in the error rather than silently stripped
 *    (SCF-04).
 *
 * Each negative has its positive control in the same block: the same figure,
 * in shared data, must be accepted. The rule is "numbers live in one place",
 * not "numbers are forbidden".
 *
 * ## Expected-failure convention
 *
 * `it.fails` is the marker; T104 activates a grader by deleting exactly that
 * `.fails`. See `tests/schemas/prose-locale-completeness.test.ts` for the
 * full note, and `tests/schemas/seam-contract.test.ts` for the canary that
 * proves today's failures are the seam and not a broken import.
 *
 * refs specs/001-foundation (I18N-06, SCF-04)
 */
import { describe, expect, it } from "vitest";
import { z } from "astro/zod";
import { defineEntrySchema } from "../../src/schemas/entry.ts";
import { issuePaths, unrecognizedKeys } from "../helpers/schema-outcome.ts";
import { makeProseEn, makeValidEntry } from "../fixtures/schema-fixtures.ts";

const sharedShape = { torqueNm: z.number(), oemPartNumber: z.string() };
const proseShape = { title: z.string(), summary: z.string() };

const entrySchema = () => defineEntrySchema(sharedShape, proseShape);

const bothLocales = () => makeValidEntry().prose ?? {};

describe("define time: no numeric field may be declared in prose", () => {
  it.fails(
    "accepts a numeric spec in shared data — the figure has to live somewhere",
    () => {
      expect(() =>
        defineEntrySchema({ torqueNm: z.number() }, proseShape)
      ).not.toThrow();
    }
  );

  it.fails.each([
    ["z.number()", z.number()],
    ["z.number().optional()", z.number().optional()],
    ["z.number().nullable()", z.number().nullable()],
    ["z.array(z.number())", z.array(z.number())],
  ])(
    "rejects a prose shape declaring `torqueNm: %s`, naming the field",
    (_label, fieldSchema) => {
      expect(() =>
        defineEntrySchema(sharedShape, { ...proseShape, torqueNm: fieldSchema })
      ).toThrow(/torqueNm/);
    }
  );

  it.fails(
    "still accepts an all-string prose shape — only numbers are barred",
    () => {
      expect(() =>
        defineEntrySchema(sharedShape, {
          ...proseShape,
          caveat: z.string().optional(),
          steps: z.array(z.string()),
        })
      ).not.toThrow();
    }
  );
});

describe("parse time: a figure exists exactly once, in shared data", () => {
  it.fails("accepts the torque spec at the shared-data top level", () => {
    const entry = makeValidEntry();
    entry.torqueNm = 88;

    const outcome = entrySchema().safeParse(entry);

    expect(issuePaths(outcome)).toEqual([]);
    expect(outcome.success).toBe(true);
  });

  it.fails.each(["en", "es"])(
    "rejects a torque figure smuggled into `prose.%s`, naming the key",
    (locale) => {
      const entry = makeValidEntry();
      entry.prose = {
        ...bothLocales(),
        [locale]: { ...makeProseEn(), torqueNm: 88 },
      };

      const outcome = entrySchema().safeParse(entry);

      expect(outcome.success).toBe(false);
      expect(unrecognizedKeys(outcome)).toContain("torqueNm");
    }
  );

  it.fails(
    "rejects the same figure duplicated into both locales (AGENTS.md: " +
      "writing a figure twice means the schema is wrong)",
    () => {
      const entry = makeValidEntry();
      entry.prose = {
        en: { ...makeProseEn(), torqueNm: 88 },
        es: { ...makeProseEn(), torqueNm: 88 },
      };

      const outcome = entrySchema().safeParse(entry);

      expect(outcome.success).toBe(false);
      expect(unrecognizedKeys(outcome)).toEqual(
        expect.arrayContaining(["torqueNm"])
      );
    }
  );

  it.fails.each(["en", "es"])(
    "rejects a part number smuggled into `prose.%s`",
    (locale) => {
      const entry = makeValidEntry();
      entry.prose = {
        ...bothLocales(),
        [locale]: { ...makeProseEn(), oemPartNumber: "TEST-MB000001" },
      };

      const outcome = entrySchema().safeParse(entry);

      expect(outcome.success).toBe(false);
      expect(unrecognizedKeys(outcome)).toContain("oemPartNumber");
    }
  );

  it.fails.each(["en", "es"])(
    "rejects a number in a prose field of `prose.%s`, naming the path",
    (locale) => {
      const entry = makeValidEntry();
      entry.prose = {
        ...bothLocales(),
        [locale]: { ...makeProseEn(), title: 88 },
      };

      const outcome = entrySchema().safeParse(entry);

      expect(outcome.success).toBe(false);
      expect(issuePaths(outcome)).toContain(`prose.${locale}.title`);
    }
  );

  it.fails(
    "rejects a shared numeric spec supplied as a localized string",
    () => {
      const entry: Record<string, unknown> = makeValidEntry();
      entry["torqueNm"] = "88 N·m";

      const outcome = entrySchema().safeParse(entry);

      expect(outcome.success).toBe(false);
      expect(issuePaths(outcome)).toContain("torqueNm");
    }
  );
});
