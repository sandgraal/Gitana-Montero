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
import {
  CITATION_REQUIRED_TIERS,
  SOURCE_KINDS,
  defineEntrySchema,
  sourceSchema,
} from "./entry";

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
  // Numbers carried as literal *values* rather than as a numeric type. A
  // difficulty of 1–5 (PRB-01, PRC-01) is naturally spelled this way, which
  // makes it the likeliest numeric prose field anyone would really write.
  ["z.literal(88)", z.literal(88)],
  [
    "z.union([z.literal(1), z.literal(2)])",
    z.union([z.literal(1), z.literal(2)]),
  ],
  ["z.literal([1, 'one'])", z.literal([1, "one"])],
  ["z.literal(88n)", z.literal(88n)],
  ["z.enum({ ONE: 1 })", z.enum({ ONE: 1 })],
  [
    "z.object({ difficulty: z.literal([1, 2, 3, 4, 5]) })",
    z.object({ difficulty: z.literal([1, 2, 3, 4, 5]) }),
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

  it("still accepts string literals and string enums in prose", () => {
    expect(() =>
      defineEntrySchema(shared, {
        ...prose,
        tone: z.literal("warning"),
        severity: z.enum(["low", "high"]),
      })
    ).not.toThrow();
  });

  /**
   * Fails closed. A hand-rolled parser, or an `astro/zod` upgrade that renamed
   * `_def.type`, would otherwise be waved through as "nothing numeric found"
   * and take its whole subtree with it.
   */
  it("refuses a prose field it cannot inspect, rather than assuming it clean", () => {
    const opaque = {
      safeParse: () => ({ success: true, data: 88 }),
      parse: () => 88,
    };

    expect(() =>
      defineEntrySchema(shared, {
        ...prose,
        sneaky: opaque as unknown as z.ZodType,
      })
    ).toThrow(/sneaky/);
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
    // `first-hand` is the owner's own truck, so it needs no citation — see the
    // citation-tier block below.
    confidence: "first-hand",
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

describe("citation-required confidence tiers", () => {
  const source = {
    title: "TEST fixture source — not a real document",
    url: "https://example.invalid/test-schema/source",
    archiveUrl:
      "https://web.archive.org/web/20260101000000/" +
      "https://example.invalid/test-schema/source",
    accessed: "2026-08-27",
    kind: "fsm",
  };

  const entry = (confidence: string, sources: unknown[]) => ({
    id: "test-schema-alpha",
    fitment: { gens: ["gen3"] },
    torqueNm: 88,
    confidence,
    sources,
    prose: {
      en: { title: "T", summary: "S" },
      es: { title: "T", summary: "S" },
    },
  });

  const schema = () => defineEntrySchema(shared, prose);

  it.each([...CITATION_REQUIRED_TIERS])(
    "rejects an entry claiming `%s` while citing nothing",
    (tier) => {
      const outcome = schema().safeParse(entry(tier, []));

      expect(outcome.success).toBe(false);
      expect(
        outcome.error?.issues.map((issue) => issue.path.join("."))
      ).toContain("sources");
    }
  );

  it.each([...CITATION_REQUIRED_TIERS])(
    "accepts `%s` once the entry cites something",
    (tier) => {
      expect(schema().safeParse(entry(tier, [source])).success).toBe(true);
    }
  );

  it.each(["community-consensus", "first-hand", "anecdotal"])(
    "leaves `%s` free to carry no source",
    (tier) => {
      expect(schema().safeParse(entry(tier, [])).success).toBe(true);
    }
  );
});

/**
 * The `manufacturer` / `reference` source kinds (plan.md amended 2026-08-28).
 *
 * Exact `SOURCE_KINDS` membership is the graders' contract
 * (`tests/schemas/entry-primitives.test.ts`). What is tested here is the
 * implementation-side consequence of adding them: that the new kinds are
 * actually reachable through `sourceSchema` and satisfy the
 * citation-required-tier refinement, which is the whole reason they exist —
 * `manufacturer` was added so factory literature could support
 * `fsm-confirmed` without filing a brochure as `vendor`.
 */
describe("manufacturer and reference source kinds", () => {
  const sourceOfKind = (kind: string) => ({
    title: "TEST fixture source — not a real document",
    url: "https://example.invalid/test-schema/source",
    archiveUrl:
      "https://web.archive.org/web/20260101000000/" +
      "https://example.invalid/test-schema/source",
    accessed: "2026-08-27",
    kind,
  });

  it.each(["manufacturer", "reference"])(
    "sourceSchema accepts the kind `%s`",
    (kind) => {
      expect(sourceSchema.safeParse(sourceOfKind(kind)).success).toBe(true);
    }
  );

  /**
   * Guards against enum/schema drift: `sourceSchema.kind` is built from
   * `SOURCE_KINDS`, so a kind that is listed but unparseable would mean the
   * two had come apart.
   */
  it.each([...SOURCE_KINDS])(
    "sourceSchema accepts every listed kind %j",
    (kind) => {
      expect(sourceSchema.safeParse(sourceOfKind(kind)).success).toBe(true);
    }
  );

  const entryCitedBy = (confidence: string, kind: string) => ({
    id: "test-schema-alpha",
    fitment: { gens: ["gen3"] },
    torqueNm: 88,
    confidence,
    sources: [sourceOfKind(kind)],
    prose: {
      en: { title: "T", summary: "S" },
      es: { title: "T", summary: "S" },
    },
  });

  /**
   * The round-trip proof: a whole entry at the strongest tier, cited only by
   * factory literature, parses. Before `manufacturer` existed this shape was
   * unexpressible — the citation had to claim a kind it was not.
   */
  it("accepts an `fsm-confirmed` entry cited only by a `manufacturer` source", () => {
    const outcome = defineEntrySchema(shared, prose).safeParse(
      entryCitedBy("fsm-confirmed", "manufacturer")
    );

    expect(outcome.success).toBe(true);
  });

  it("accepts a `community-consensus` entry cited only by a `reference` source", () => {
    const outcome = defineEntrySchema(shared, prose).safeParse(
      entryCitedBy("community-consensus", "reference")
    );

    expect(outcome.success).toBe(true);
  });

  /**
   * **T207 resolved this (2026-08-30).** The predecessor of this test was
   * named "does not yet constrain which kind may support which tier" and was
   * pinned so that the day a kind→tier rule arrived, the decision would be
   * deliberate rather than discovered. The decision: the rule exists — a
   * documentary tier (`fsm-confirmed`, `tsb`) requires a documentary source
   * (`fsm`, `tsb`, `manufacturer`) — and it is enforced by
   * `scripts/check-citations.mjs`, not by this schema, for the reason recorded
   * on `SOURCE_KINDS` and on the tier/source invariant that landed the same
   * way: a schema refines on structural contradictions, and "is this the right
   * *class* of evidence" is content policy.
   *
   * So the schema-level answer is unchanged and is now *deliberate* rather
   * than merely unwritten. The graders for the rule itself live in
   * `tests/check-citations.test.ts` ("findKindTierIssues").
   */
  it("leaves kind→tier coherence to check:citations, not to the schema", () => {
    const outcome = defineEntrySchema(shared, prose).safeParse(
      entryCitedBy("fsm-confirmed", "reference")
    );

    expect(outcome.success).toBe(true);
  });
});
