/**
 * Implementation-side unit tests for the entry schema building blocks.
 *
 * The contract itself is graded by `tests/schemas/` (written by T103, a
 * different agent). These are the author's own tests for the parts of the
 * implementation that are *decisions rather than contract*: how far the
 * numeric-prose guard recurses through `astro/zod`'s internals, that it
 * terminates on a recursive schema, and the reserved-field guard this
 * implementation added. They exist so a future Zod upgrade that renames a
 * `_def` key fails here, loudly, instead of silently opening a hole the
 * graders do not probe.
 *
 * refs specs/001-foundation (I18N-06, SCF-04)
 */
import { describe, expect, it } from "vitest";
import { z } from "astro/zod";
import { defineEntrySchema } from "./entry";

const shared = { torqueNm: z.number() };
const prose = { title: z.string(), summary: z.string() };

/**
 * Every wrapper, container and composite `astro/zod` offers that can hide a
 * number from a one-level check. `sneaky` is the field name in each case, so
 * the assertion also proves the thrown error names the offending prose field.
 */
const numericEvasions: [string, z.ZodType][] = [
  ["z.coerce.number()", z.coerce.number()],
  ["z.int()", z.int()],
  ["z.number().array()", z.number().array()],
  ["z.number().nullish()", z.number().nullish()],
  ["z.number().readonly()", z.number().readonly()],
  ["z.number().catch(0)", z.number().catch(0)],
  ["z.promise(z.number())", z.promise(z.number())],
  ["z.set(z.number())", z.set(z.number())],
  ["z.map(z.string(), z.number())", z.map(z.string(), z.number())],
  [
    "z.intersection(…, z.object({ b: z.number() }))",
    z.intersection(z.object({ a: z.string() }), z.object({ b: z.number() })),
  ],
  ["z.string().pipe(z.coerce.number())", z.string().pipe(z.coerce.number())],
  [
    "z.discriminatedUnion(…)",
    z.discriminatedUnion("k", [z.object({ k: z.literal("a"), n: z.number() })]),
  ],
  [
    "z.lazy(() => z.object({ n: z.number() }))",
    z.lazy(() => z.object({ n: z.number() })),
  ],
  [
    "z.record(z.string(), z.array(z.object({ n: z.number() })))",
    z.record(z.string(), z.array(z.object({ n: z.number() }))),
  ],
  ["z.tuple([z.string()], z.number())", z.tuple([z.string()], z.number())],
  [
    "z.object({ n: z.number() }).default(…)",
    z.object({ n: z.number() }).default({ n: 1 }),
  ],
  [
    "z.array(z.object({ deep: z.object({ n: z.bigint() }) })).optional()",
    z.array(z.object({ deep: z.object({ n: z.bigint() }) })).optional(),
  ],
];

describe("numeric-prose guard", () => {
  it.each(numericEvasions)(
    "refuses a prose field declared as %s",
    (_label, schema) => {
      expect(() =>
        defineEntrySchema(shared, { ...prose, sneaky: schema })
      ).toThrow(/sneaky/);
    }
  );

  it("terminates on a self-referencing all-string prose schema", () => {
    type Step = { label: string; substeps?: Step[] };
    const step: z.ZodType<Step> = z.lazy(() =>
      z.object({ label: z.string(), substeps: z.array(step).optional() })
    );

    expect(() =>
      defineEntrySchema(shared, { ...prose, steps: step })
    ).not.toThrow();
  });
});

describe("reserved entry fields", () => {
  it.each(["id", "fitment", "confidence", "sources", "prose"])(
    "refuses a shared shape that redeclares `%s`",
    (field) => {
      expect(() => defineEntrySchema({ [field]: z.string() }, prose)).toThrow(
        new RegExp(field)
      );
    }
  );

  it("refuses a prose shape that redeclares an entry-level field", () => {
    expect(() =>
      defineEntrySchema(shared, { ...prose, fitment: z.string() })
    ).toThrow(/fitment/);
  });
});

describe("blank prose strings", () => {
  const entry = (steps: string[]) => ({
    id: "test-schema-alpha",
    fitment: { gens: ["gen3"] },
    torqueNm: 88,
    confidence: "tsb",
    sources: [],
    prose: {
      en: { title: "T", summary: "S", steps },
      es: { title: "T", summary: "S", steps: ["ok"] },
    },
  });

  const schema = () =>
    defineEntrySchema(shared, { ...prose, steps: z.array(z.string()) });

  it("names the indexed path of a blank string nested inside prose", () => {
    const outcome = schema().safeParse(entry(["ok", "   "]));

    expect(outcome.success).toBe(false);
    expect(
      outcome.error?.issues.map((issue) => issue.path.join("."))
    ).toContain("prose.en.steps.1");
  });

  it("accepts the same entry once the string says something", () => {
    expect(schema().safeParse(entry(["ok", "listo"])).success).toBe(true);
  });
});
