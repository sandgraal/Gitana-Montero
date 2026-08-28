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
 *    fails to build at all. The table covers wrappers (`.optional()`,
 *    `.nullable()`, `.default()`), containers (`array`, `object`, `tuple`,
 *    `record`), composites (`union`) and `bigint`, because a check that
 *    unwraps only one level is one keystroke from being evaded.
 * 2. **Parse time.** Prose objects reject unknown keys, so a figure smuggled
 *    into an entry file is named in the error — with its locale path, not
 *    just its key — rather than silently stripped (SCF-04).
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
import {
  makeProseEn,
  makeProseEs,
  makeValidEntry,
} from "../fixtures/schema-fixtures.ts";

const sharedShape = { torqueNm: z.number(), oemPartNumber: z.string() };
const proseShape = { title: z.string(), summary: z.string() };

const entrySchema = () => defineEntrySchema(sharedShape, proseShape);

const bothLocales = () => makeValidEntry().prose ?? {};

/**
 * `[label, prose field name, field schema]`.
 *
 * A guard that unwraps only one level is not a guard: it passes every
 * grader while letting `specs: z.object({ torqueNm: z.number() })` through,
 * and a figure nested one level inside prose is duplicated per locale
 * exactly like a top-level one. The wrapper, container and composite cases
 * below are the evasions that matter, so the check has to recurse through
 * `optional` / `nullable` / `default` wrappers and into `array`, `object`,
 * `union`, `tuple` and `record` children. `z.bigint()` counts as numeric.
 */
const numericProseShapes: [string, string, z.ZodType][] = [
  ["z.number()", "torqueNm", z.number()],
  ["z.number().optional()", "torqueNm", z.number().optional()],
  ["z.number().nullable()", "torqueNm", z.number().nullable()],
  ["z.number().default(88)", "torqueNm", z.number().default(88)],
  ["z.bigint()", "odometerKm", z.bigint()],
  ["z.array(z.number())", "torqueSequenceNm", z.array(z.number())],
  [
    "z.array(z.array(z.number()))",
    "torqueStagesNm",
    z.array(z.array(z.number())),
  ],
  // Field names here must not appear as a substring of any plausible error
  // message: the assertion builds a regex from the name, and a field called
  // `specs` would be "matched" by the words `specs/001-foundation` in a
  // message that never mentioned the field at all.
  [
    "z.object({ torqueNm: z.number() })",
    "nestedTorque",
    z.object({ torqueNm: z.number() }),
  ],
  [
    "z.array(z.object({ nm: z.number() }))",
    "torqueRows",
    z.array(z.object({ nm: z.number() })),
  ],
  [
    "z.union([z.string(), z.number()])",
    "torqueNm",
    z.union([z.string(), z.number()]),
  ],
  ["z.tuple([z.number()])", "torqueRangeNm", z.tuple([z.number()])],
  [
    "z.record(z.string(), z.number())",
    "capacitiesL",
    z.record(z.string(), z.number()),
  ],
];

describe("define time: no numeric field may be declared in prose", () => {
  it.fails(
    "accepts a numeric spec in shared data — the figure has to live somewhere",
    () => {
      expect(() =>
        defineEntrySchema({ torqueNm: z.number() }, proseShape)
      ).not.toThrow();
    }
  );

  it.fails.each(numericProseShapes)(
    "rejects a prose shape declaring a %s field, naming the field",
    (_label, fieldName, fieldSchema) => {
      expect(() =>
        defineEntrySchema(sharedShape, {
          ...proseShape,
          [fieldName]: fieldSchema,
        })
      ).toThrow(new RegExp(fieldName));
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

  it.fails(
    "still accepts strings nested in the same containers the numeric " +
      "check recurses through — the rule is about numbers, not about depth",
    () => {
      expect(() =>
        defineEntrySchema(sharedShape, {
          ...proseShape,
          callout: z.object({ label: z.string(), body: z.string() }),
          steps: z.array(z.object({ instruction: z.string() })),
          aside: z.union([z.string(), z.array(z.string())]),
          labels: z.record(z.string(), z.string()),
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
      // The key name alone is not enough: an issue reporting
      // "unrecognized key torqueNm" with no path would satisfy the line
      // above while the figure sat anywhere at all. Zod reports the parent
      // object's path on a strict-object violation, so the locale must be
      // named too.
      expect(issuePaths(outcome)).toContain(`prose.${locale}`);
    }
  );

  it.fails(
    "rejects the same figure duplicated into both locales (AGENTS.md: " +
      "writing a figure twice means the schema is wrong)",
    () => {
      const entry = makeValidEntry();
      entry.prose = {
        en: { ...makeProseEn(), torqueNm: 88 },
        es: { ...makeProseEs(), torqueNm: 88 },
      };

      const outcome = entrySchema().safeParse(entry);

      expect(outcome.success).toBe(false);
      expect(unrecognizedKeys(outcome)).toEqual(
        expect.arrayContaining(["torqueNm"])
      );
      expect(issuePaths(outcome)).toEqual(
        expect.arrayContaining(["prose.en", "prose.es"])
      );
    }
  );

  it.fails.each(["en", "es"])(
    "rejects a figure nested one level inside `prose.%s` — the evasion a " +
      "one-level numeric check lets through",
    (locale) => {
      const entry = makeValidEntry();
      entry.prose = {
        ...bothLocales(),
        [locale]: { ...makeProseEn(), specs: { torqueNm: 88 } },
      };

      const outcome = entrySchema().safeParse(entry);

      expect(outcome.success).toBe(false);
      expect(unrecognizedKeys(outcome)).toContain("specs");
      expect(issuePaths(outcome)).toContain(`prose.${locale}`);
    }
  );

  it.fails(
    "rejects a nested figure duplicated into both locales — " +
      "prose.en.specs.torqueNm and prose.es.specs.torqueNm are one figure " +
      "written twice",
    () => {
      const entry = makeValidEntry();
      entry.prose = {
        en: { ...makeProseEn(), specs: { torqueNm: 88 } },
        es: { ...makeProseEs(), specs: { torqueNm: 88 } },
      };

      const outcome = entrySchema().safeParse(entry);

      expect(outcome.success).toBe(false);
      expect(issuePaths(outcome)).toEqual(
        expect.arrayContaining(["prose.en", "prose.es"])
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
      expect(issuePaths(outcome)).toContain(`prose.${locale}`);
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
