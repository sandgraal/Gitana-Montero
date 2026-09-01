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

  it("refuses two rows in one list sharing an id", () => {
    const outcome = schema.safeParse(
      entry({
        causes: [{ id: "test-cause" }, { id: "test-cause" }],
      })
    );
    expect(issuePaths(outcome)).toContain("causes.1.id");
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
