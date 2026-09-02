/**
 * Implementation-side unit tests for the `problems` collection schema (T401).
 *
 * What this schema alone can decide, within one entry: does every id declared
 * in shared data have a phrase in both locales (and no phrase exist for an id
 * that does not), does every diagnostic step say what a result rules in or out
 * about a cause the entry actually declares, is the safety flag coherent with
 * the system and the severity, and is no cause weaker evidence than the entry
 * carrying it. Cross-entry questions (fitment resolution, slug collisions,
 * whether a referenced part id exists) belong to `src/lib/fitment/`,
 * `src/lib/problems.ts` and T703's gaps report respectively.
 *
 * Every fixture is synthetic in the same sense as `reference.test.ts`'s:
 * `.invalid` URLs, `test-`-prefixed ids, and figures chosen to be structurally
 * interesting rather than to assert a fact about a real truck. **Nothing here
 * is a diagnosis, a triage call, or a repair time anyone should act on.**
 *
 * refs specs/001-foundation (PRB-01, PRB-03, PRB-04, PRB-05)
 */
import { describe, expect, it } from "vitest";
import { z } from "astro/zod";
import { issuePaths } from "../../tests/helpers/schema-outcome.ts";
import { CONFIDENCE_TIERS } from "./entry";
import { SAFETY_CRITICAL_SYSTEMS } from "../lib/safety";
import {
  COST_BANDS,
  DIFFICULTY_MAX,
  DRIVABILITY_STATES,
  PROBLEM_SEVERITIES,
  problemsEntrySchema,
} from "./problems";

const schema = problemsEntrySchema({
  title: z.string(),
  summary: z.string(),
});

function source() {
  return {
    title: "TEST fixture source — not a real document",
    url: "https://example.invalid/t401/source",
    archiveUrl:
      "https://web.archive.org/web/20260101000000/" +
      "https://example.invalid/t401/source",
    accessed: "2026-08-31",
    kind: "forum",
  };
}

/**
 * A structurally complete entry with one of everything: one symptom, one
 * cause, one diagnostic step that rules that cause in, one fix path. Every
 * negative case below is this object with exactly one thing changed.
 */
function entry(overrides: Record<string, unknown> = {}) {
  const base = {
    id: "test-problem",
    fitment: { gens: ["gen3"] },
    system: "hvac",
    severity: "degrading",
    drivability: "drive-normally",
    symptoms: ["test-symptom"],
    causes: [{ id: "test-cause" }],
    diagnosticSteps: [{ id: "test-step", rulesIn: ["test-cause"] }],
    fixPaths: [
      {
        id: "test-fix",
        difficulty: 2,
        cost: { from: "minimal", to: "moderate" },
        time: { value: 1, unit: "h" },
        addresses: ["test-cause"],
        parts: [],
        procedures: [],
      },
    ],
    confidence: "community-consensus",
    sources: [source()],
    prose: {
      en: proseBlock("en"),
      es: proseBlock("es"),
    },
  };

  return { ...base, ...overrides };
}

function proseBlock(locale: string) {
  return {
    title: `TEST problem (${locale})`,
    summary: `TEST summary (${locale})`,
    slug: `test-problem-${locale}`,
    symptoms: { "test-symptom": `TEST symptom (${locale})` },
    causes: { "test-cause": `TEST cause (${locale})` },
    diagnosticSteps: { "test-step": `TEST step (${locale})` },
    fixPaths: { "test-fix": { title: `TEST fix (${locale})` } },
  };
}

/* -------------------------------------------------------------------------
 * The four id-bearing lists, one spec each.
 *
 * `checkProblemEntry` sweeps `["symptoms", "causes", "diagnosticSteps",
 * "fixPaths"]` for duplicate ids. Each spec below says how to build one row of
 * that list and one phrase for it in a locale, so the same two graders — the
 * duplicate is rejected, a distinct second row is accepted — run over every
 * field rather than over whichever one happened to get written first.
 * ---------------------------------------------------------------------- */

interface IdListSpec {
  /** The shared-data field, and the prose sub-object that mirrors it. */
  readonly field: "symptoms" | "causes" | "diagnosticSteps" | "fixPaths";
  /** The id `entry()`'s own single row already uses. */
  readonly id: string;
  /** A second, distinct id — the positive control. */
  readonly secondId: string;
  /** One row of shared data under `id`. */
  readonly row: (id: string) => unknown;
  /** That row's phrase in `locale` — a string, or an object for fix paths. */
  readonly phrase: (id: string, locale: string) => unknown;
  /** Where `checkDuplicateIds` must report the collision. */
  readonly duplicatePath: string;
}

const DUPLICATE_ID_FIELDS: readonly IdListSpec[] = [
  {
    field: "symptoms",
    id: "test-symptom",
    secondId: "test-symptom-2",
    // Symptoms are bare strings, so the issue path carries no `.id` segment.
    row: (id) => id,
    phrase: (id, locale) => `TEST symptom ${id} (${locale})`,
    duplicatePath: "symptoms.1",
  },
  {
    field: "causes",
    id: "test-cause",
    secondId: "test-cause-2",
    row: (id) => ({ id }),
    phrase: (id, locale) => `TEST cause ${id} (${locale})`,
    duplicatePath: "causes.1.id",
  },
  {
    field: "diagnosticSteps",
    id: "test-step",
    secondId: "test-step-2",
    row: (id) => ({ id, rulesIn: ["test-cause"] }),
    phrase: (id, locale) => `TEST step ${id} (${locale})`,
    duplicatePath: "diagnosticSteps.1.id",
  },
  {
    field: "fixPaths",
    id: "test-fix",
    secondId: "test-fix-2",
    row: (id) => ({
      ...(entry().fixPaths[0] as Record<string, unknown>),
      id,
    }),
    phrase: (id, locale) => ({ title: `TEST fix ${id} (${locale})` }),
    duplicatePath: "fixPaths.1.id",
  },
];

/**
 * `entry()` with one extra row appended to `spec.field`, and that row's phrase
 * added to both prose locales.
 *
 * Passing `spec.id` yields the duplicate fixture (the phrase patch is then a
 * no-op rewrite of the existing key) and `spec.secondId` yields the clean one
 * — the two differ by nothing but the id, which is what makes the pair a real
 * control rather than two unrelated fixtures.
 */
function withExtraRow(spec: IdListSpec, id: string) {
  const base = entry() as Record<string, unknown>;
  const rows = [...(base[spec.field] as unknown[]), spec.row(id)];

  const prose = Object.fromEntries(
    (["en", "es"] as const).map((locale) => {
      const block = proseBlock(locale) as Record<string, unknown>;
      return [
        locale,
        {
          ...block,
          [spec.field]: {
            ...(block[spec.field] as Record<string, unknown>),
            [id]: spec.phrase(id, locale),
          },
        },
      ];
    })
  );

  return { ...base, [spec.field]: rows, prose };
}

/** `entry()` with one prose locale replaced wholesale. */
function withProse(locale: "en" | "es", block: Record<string, unknown>) {
  const base = entry();
  return {
    ...base,
    prose: { ...base.prose, [locale]: block },
  };
}

describe("the vocabularies PRB-01 and PRB-05 fix", () => {
  it("offers exactly PRB-05's four drivability states, in escalating order", () => {
    expect(DRIVABILITY_STATES).toEqual([
      "drive-normally",
      "drive-gently-repair-soon",
      "do-not-drive",
      "tow-only",
    ]);
  });

  it("puts `safety-critical` first in the severity ladder", () => {
    expect(PROBLEM_SEVERITIES[0]).toBe("safety-critical");
  });

  it("orders cost bands cheapest first, so a range is an index comparison", () => {
    expect(COST_BANDS).toEqual(["minimal", "moderate", "significant", "major"]);
  });

  it("accepts a structurally complete entry", () => {
    expect(schema.safeParse(entry()).success).toBe(true);
  });

  it.each(DRIVABILITY_STATES)("accepts drivability `%s`", (state) => {
    expect(schema.safeParse(entry({ drivability: state })).success).toBe(true);
  });

  it("refuses a drivability value outside the four (PRB-05)", () => {
    const outcome = schema.safeParse(entry({ drivability: "drive-carefully" }));
    expect(issuePaths(outcome)).toContain("drivability");
  });

  it("refuses an entry with no drivability triage at all", () => {
    const { drivability: _dropped, ...rest } = entry();
    void _dropped;
    expect(issuePaths(schema.safeParse(rest))).toContain("drivability");
  });
});

describe("difficulty, cost and time", () => {
  it.each([0, 6, 2.5])("refuses difficulty `%s`", (difficulty) => {
    const outcome = schema.safeParse(
      entry({ fixPaths: [{ ...entry().fixPaths[0], difficulty }] })
    );
    expect(issuePaths(outcome)).toContain("fixPaths.0.difficulty");
  });

  it(`accepts the whole 1–${DIFFICULTY_MAX} scale`, () => {
    for (let difficulty = 1; difficulty <= DIFFICULTY_MAX; difficulty += 1) {
      const outcome = schema.safeParse(
        entry({ fixPaths: [{ ...entry().fixPaths[0], difficulty }] })
      );
      expect(outcome.success).toBe(true);
    }
  });

  it("refuses a cost range that reads backwards", () => {
    const outcome = schema.safeParse(
      entry({
        fixPaths: [
          { ...entry().fixPaths[0], cost: { from: "major", to: "minimal" } },
        ],
      })
    );
    expect(issuePaths(outcome)).toContain("fixPaths.0.cost.to");
  });

  it("refuses a repair cost stated as a figure", () => {
    const outcome = schema.safeParse(
      entry({ fixPaths: [{ ...entry().fixPaths[0], cost: 120 }] })
    );
    expect(outcome.success).toBe(false);
  });

  it("refuses a time with a lone bound (half a specification)", () => {
    const outcome = schema.safeParse(
      entry({
        fixPaths: [{ ...entry().fixPaths[0], time: { min: 1, unit: "h" } }],
      })
    );
    expect(issuePaths(outcome)).toContain("fixPaths.0.time.min");
  });

  it("refuses a time in a unit nothing on this site is measured in", () => {
    const outcome = schema.safeParse(
      entry({
        fixPaths: [
          { ...entry().fixPaths[0], time: { value: 2, unit: "days" } },
        ],
      })
    );
    expect(issuePaths(outcome)).toContain("fixPaths.0.time.unit");
  });
});

describe("the numbers-are-never-translated guard reaches this schema", () => {
  it("throws at define time on a numeric field in a problems prose shape", () => {
    expect(() =>
      problemsEntrySchema({
        title: z.string(),
        summary: z.string(),
        // The mistake this guard exists for: a fix-path difficulty typed into
        // the per-locale half, where it would be written down twice.
        difficulty: z.number(),
      })
    ).toThrow(/numbers are never translated/);
  });

  it("throws on a numeric literal nested inside a prose object", () => {
    expect(() =>
      problemsEntrySchema({
        title: z.string(),
        summary: z.string(),
        estimate: z.object({ hours: z.literal(2) }),
      })
    ).toThrow(/numbers are never translated/);
  });
});

describe("prose coverage — I18N-06, one level down", () => {
  it("refuses an id with no phrase in the Spanish half", () => {
    const outcome = schema.safeParse(
      withProse("es", { ...proseBlock("es"), symptoms: {} })
    );
    expect(issuePaths(outcome)).toContain("prose.es.symptoms.test-symptom");
  });

  it("refuses an id with no phrase in the English half", () => {
    const outcome = schema.safeParse(
      withProse("en", { ...proseBlock("en"), causes: {} })
    );
    expect(issuePaths(outcome)).toContain("prose.en.causes.test-cause");
  });

  it("refuses a phrase for an id the shared data never declares", () => {
    const outcome = schema.safeParse(
      withProse("en", {
        ...proseBlock("en"),
        symptoms: {
          "test-symptom": "TEST symptom (en)",
          "test-ghost": "TEST symptom that renders nowhere",
        },
      })
    );
    expect(issuePaths(outcome)).toContain("prose.en.symptoms.test-ghost");
  });

  it("refuses a blank phrase — a present-but-empty locale is a missing one", () => {
    const outcome = schema.safeParse(
      withProse("es", {
        ...proseBlock("es"),
        symptoms: { "test-symptom": "   " },
      })
    );
    expect(issuePaths(outcome)).toContain("prose.es.symptoms.test-symptom");
  });

  it("covers fix paths, whose phrases are objects rather than strings", () => {
    const outcome = schema.safeParse(
      withProse("es", { ...proseBlock("es"), fixPaths: {} })
    );
    expect(issuePaths(outcome)).toContain("prose.es.fixPaths.test-fix");
  });
});

describe("slugs — I18N-05", () => {
  it("refuses an accented slug: a URL a reader cannot type", () => {
    const outcome = schema.safeParse(
      withProse("es", { ...proseBlock("es"), slug: "rótula-del-tensor" })
    );
    expect(issuePaths(outcome)).toContain("prose.es.slug");
  });

  it("refuses a slug with a space or a leading hyphen", () => {
    for (const slug of [
      "two words",
      "-leading",
      "trailing-",
      "Double--Hyphen",
    ]) {
      const outcome = schema.safeParse(
        withProse("en", { ...proseBlock("en"), slug })
      );
      expect(issuePaths(outcome)).toContain("prose.en.slug");
    }
  });

  it("requires a slug in each locale", () => {
    const { slug: _dropped, ...block } = proseBlock("es");
    void _dropped;
    expect(issuePaths(schema.safeParse(withProse("es", block)))).toContain(
      "prose.es.slug"
    );
  });

  it("never lets a slug sit at the top level, where Astro reads it as the id", () => {
    // `scripts/check-locales.mjs` fails on sight of `data.slug` because Astro's
    // glob loader would use it as the entry's real id. The strict envelope is
    // what keeps that guard meaningful.
    const outcome = schema.safeParse(entry({ slug: "test-problem" }));
    expect(outcome.success).toBe(false);
  });
});

describe("diagnostic steps state what a result means — PRB-01", () => {
  it("refuses a step that rules nothing in and nothing out", () => {
    const outcome = schema.safeParse(
      entry({ diagnosticSteps: [{ id: "test-step" }] })
    );
    expect(issuePaths(outcome)).toContain("diagnosticSteps.0.rulesIn");
  });

  it("accepts a step that only rules a cause out", () => {
    const outcome = schema.safeParse(
      entry({
        diagnosticSteps: [{ id: "test-step", rulesOut: ["test-cause"] }],
      })
    );
    expect(outcome.success).toBe(true);
  });

  it("refuses a step ruling in a cause the entry does not declare", () => {
    const outcome = schema.safeParse(
      entry({
        diagnosticSteps: [{ id: "test-step", rulesIn: ["test-undeclared"] }],
      })
    );
    expect(issuePaths(outcome)).toContain("diagnosticSteps.0.rulesIn.0");
  });

  it("refuses a fix path addressing a cause the entry does not declare", () => {
    const outcome = schema.safeParse(
      entry({
        fixPaths: [{ ...entry().fixPaths[0], addresses: ["test-undeclared"] }],
      })
    );
    expect(issuePaths(outcome)).toContain("fixPaths.0.addresses.0");
  });

  /*
   * The duplicate-id sweep runs over all four id-bearing lists
   * (`checkProblemEntry`'s `for (const field of ["symptoms", "causes",
   * "diagnosticSteps", "fixPaths"])`), but this grader used to name only
   * `causes`. Narrowing the implementation's loop back to `["causes"]` left
   * the suite green — three of the four fields were correct and ungraded, so
   * nothing stopped a later edit from dropping them. One case per field, from
   * the constant's own membership.
   */
  it.each(DUPLICATE_ID_FIELDS)(
    "refuses two rows in `$field` sharing an id",
    (spec) => {
      const outcome = schema.safeParse(withExtraRow(spec, spec.id));
      expect(issuePaths(outcome)).toContain(spec.duplicatePath);
    }
  );

  it.each(DUPLICATE_ID_FIELDS)(
    "accepts a second row in `$field` under an id of its own",
    (spec) => {
      // The positive control: the same fixture shape, one character of the id
      // apart. Without it the rule above could be over-strict — rejecting any
      // second row — and nothing here would say so.
      const outcome = schema.safeParse(withExtraRow(spec, spec.secondId));
      expect(outcome.success, JSON.stringify(issuePaths(outcome))).toBe(true);
    }
  );
});

/**
 * A diagnostic step is a claim about causes, and a claim that contradicts
 * itself is not a diagnostic — PRB-01's "each stating what a result rules in
 * or out".
 *
 * **`it.fails` is the marker.** The schema does not make either of these
 * checks today; the implementer activates a grader by deleting exactly that
 * one marker line. The seam is `checkDiagnostics` in `src/schemas/problems.ts`
 * — see the note above each case for the issue path it must report.
 *
 * refs specs/001-foundation (PRB-01)
 */
describe("a diagnostic step may not contradict itself — PRB-01", () => {
  /** Two declared causes, so a step can rule one in and the other out. */
  function twoCauses() {
    const causes = DUPLICATE_ID_FIELDS.find((spec) => spec.field === "causes");
    if (causes === undefined) throw new Error("no `causes` spec");
    return withExtraRow(causes, causes.secondId);
  }

  /** `twoCauses()` with its single diagnostic step replaced. */
  function withStep(step: Record<string, unknown>) {
    return { ...twoCauses(), diagnosticSteps: [{ id: "test-step", ...step }] };
  }

  it("accepts a step that rules one cause in and a different one out", () => {
    // Positive control for both `it.fails` cases below: it proves the fixture
    // itself is well-formed, so when one of them goes red after the fix it is
    // red for the contradiction and not for a broken entry.
    const outcome = schema.safeParse(
      withStep({ rulesIn: ["test-cause"], rulesOut: ["test-cause-2"] })
    );
    expect(outcome.success, JSON.stringify(issuePaths(outcome))).toBe(true);
  });

  it.fails("refuses a step that rules the same cause both in and out", () => {
    // "Rules in: worn bushing" and "rules out: worn bushing" on one step is
    // an authoring contradiction, not a diagnostic: whichever way the result
    // goes, the reader is told the opposite thing at the same time. Both ids
    // are declared causes, so every rule the schema has today is satisfied.
    // Report it on the `rulesOut` position — the later of the two, and the
    // half an author most often pasted in by mistake.
    const outcome = schema.safeParse(
      withStep({ rulesIn: ["test-cause"], rulesOut: ["test-cause"] })
    );
    expect(issuePaths(outcome)).toContain("diagnosticSteps.0.rulesOut.0");
  });

  it.fails("refuses one cause named twice inside a step's rulesIn", () => {
    // `checkDuplicateIds` sweeps the four top-level lists only; the id lists
    // *inside* a step are not swept, so `["test-cause", "test-cause"]` passes
    // today. Same rule, one level down: an id is a key, and keys are unique.
    const outcome = schema.safeParse(
      withStep({ rulesIn: ["test-cause", "test-cause"] })
    );
    expect(issuePaths(outcome)).toContain("diagnosticSteps.0.rulesIn.1");
  });

  it.fails("refuses one cause named twice inside a step's rulesOut", () => {
    const outcome = schema.safeParse(
      withStep({ rulesOut: ["test-cause", "test-cause"] })
    );
    expect(issuePaths(outcome)).toContain("diagnosticSteps.0.rulesOut.1");
  });
});

describe("PRB-02 — a problem a reader cannot find is not an entry", () => {
  it("refuses an entry with no symptoms", () => {
    const noSymptoms = {
      ...entry({ symptoms: [] }),
      prose: {
        en: { ...proseBlock("en"), symptoms: {} },
        es: { ...proseBlock("es"), symptoms: {} },
      },
    };
    expect(issuePaths(schema.safeParse(noSymptoms))).toContain("symptoms");
  });

  it("accepts an entry with no fix path — PRB-06 reports it, the build does not", () => {
    const noFix = {
      ...entry({ fixPaths: [] }),
      prose: {
        en: { ...proseBlock("en"), fixPaths: {} },
        es: { ...proseBlock("es"), fixPaths: {} },
      },
    };
    expect(schema.safeParse(noFix).success).toBe(true);
  });
});

describe("safety — PRB-03", () => {
  it.each(SAFETY_CRITICAL_SYSTEMS)(
    "refuses `safetyCritical: false` on the %s system",
    (system) => {
      const outcome = schema.safeParse(
        entry({ system, safetyCritical: false })
      );
      expect(issuePaths(outcome)).toContain("safetyCritical");
    }
  );

  it("refuses `safetyCritical: false` on a safety-critical severity", () => {
    const outcome = schema.safeParse(
      entry({
        system: "electrical",
        severity: "safety-critical",
        safetyCritical: false,
      })
    );
    expect(issuePaths(outcome)).toContain("safetyCritical");
  });

  it("requires the flag when the severity says hazard but the system does not", () => {
    // The SRS/airbag, towing and jacking case: a real hazard whose system has
    // no id of its own, so `isSafetyCritical` would answer "no" and the
    // standing notice would silently not render.
    const outcome = schema.safeParse(
      entry({ system: "electrical", severity: "safety-critical" })
    );
    expect(issuePaths(outcome)).toContain("safetyCritical");
  });

  it("accepts the same entry once it carries the flag", () => {
    const outcome = schema.safeParse(
      entry({
        system: "electrical",
        severity: "safety-critical",
        safetyCritical: true,
      })
    );
    expect(outcome.success).toBe(true);
  });

  it("needs no flag when the system is already on AGENTS.md's list", () => {
    const outcome = schema.safeParse(
      entry({ system: "brakes", severity: "safety-critical" })
    );
    expect(outcome.success).toBe(true);
  });

  it("lets a cosmetic problem sit on a safety-critical system", () => {
    // A squeaking brake is a `cosmetic` problem on a safety-critical system.
    // It still renders the notice (the system says so) and its severity chip
    // still says the honest thing.
    const outcome = schema.safeParse(
      entry({ system: "brakes", severity: "cosmetic" })
    );
    expect(outcome.success).toBe(true);
  });
});

describe("per-cause confidence — PRB-04", () => {
  it("accepts a cause with no confidence of its own", () => {
    expect(schema.safeParse(entry()).success).toBe(true);
  });

  it("accepts a cause stronger than its entry", () => {
    const outcome = schema.safeParse(
      entry({
        confidence: "community-consensus",
        causes: [{ id: "test-cause", confidence: "fsm-confirmed" }],
      })
    );
    expect(outcome.success).toBe(true);
  });

  it("refuses a cause weaker than its entry — the caveat would under-warn", () => {
    const outcome = schema.safeParse(
      entry({
        confidence: "fsm-confirmed",
        causes: [{ id: "test-cause", confidence: "anecdotal" }],
      })
    );
    expect(issuePaths(outcome)).toContain("causes.0.confidence");
  });

  it("accepts a cause at exactly the entry's own tier", () => {
    const outcome = schema.safeParse(
      entry({
        confidence: "community-consensus",
        causes: [{ id: "test-cause", confidence: "community-consensus" }],
      })
    );
    expect(outcome.success).toBe(true);
  });

  it("refuses a confidence tier outside the five", () => {
    const outcome = schema.safeParse(
      entry({ causes: [{ id: "test-cause", confidence: "probably" }] })
    );
    expect(issuePaths(outcome)).toContain("causes.0.confidence");
  });

  it.each(CONFIDENCE_TIERS)("accepts an entry at tier `%s`", (tier) => {
    const documentary = tier === "fsm-confirmed" || tier === "tsb";
    const outcome = schema.safeParse(
      entry({
        confidence: tier,
        sources: documentary ? [{ ...source(), kind: "fsm" }] : [source()],
      })
    );
    expect(outcome.success).toBe(true);
  });
});

describe("the strict envelope still holds", () => {
  it("names an unknown shared-data field rather than dropping it", () => {
    const outcome = schema.safeParse(entry({ likelihood: "high" }));
    expect(outcome.success).toBe(false);
  });

  it("still requires a fitment", () => {
    const { fitment: _dropped, ...rest } = entry();
    void _dropped;
    expect(issuePaths(schema.safeParse(rest))).toContain("fitment");
  });
});
