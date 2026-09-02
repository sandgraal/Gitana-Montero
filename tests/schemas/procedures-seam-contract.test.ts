/**
 * T502a canary — **T502 deletes this whole file.**
 *
 * Every other T502a grader is marked `it.fails`: it is expected to fail today
 * because `src/schemas/procedures.ts` is a seam stub and the `procedures`
 * collection, its route segment and its page do not exist. That marker is only
 * honest if each grader fails for *that* reason. A grader failing for an
 * unrelated one — a renamed export, a fixture that stopped being schema-valid,
 * a glob that matches nothing because the pattern is wrong — looks identical in
 * the Vitest report and would leave a green suite guarding an empty promise
 * (`.claude/GRADER-PRINCIPLES.md`, "a test that cannot fail is worse than
 * none").
 *
 * **What catches what.** A typo'd import path or a renamed export is caught by
 * `astro check`, which runs before Vitest inside `npm run verify` and reports
 * ts(2305)/ts(2307). What this file catches is the class the type checker
 * cannot see:
 *
 *  1. the seam really throws, with the message the other graders match on;
 *  2. the vocabularies T502a pins are consistent with the modules they must
 *     agree with (`REFERENCE_KINDS`, `SAFETY_CRITICAL_SYSTEMS`);
 *  3. the machinery the graders borrow — `findCitationIssues`,
 *     `isSafetyCritical`, `requiresSafetyFlagFromSubject`, `difficultySchema`
 *     — works **today**, so an expected failure downstream is about procedures
 *     and not about the borrowed part;
 *  4. the fixtures are schema-valid where a real schema exists to judge them;
 *  5. today's absences are real absences: no `procedures` collection, no route
 *     segment, no page — and the page **glob itself finds T501's parts pages**,
 *     which is the positive control for the render graders' discovery
 *     mechanism.
 *
 * ## Activation (T502)
 *
 * Once the seam is implemented these assertions become false — the stubs no
 * longer throw, the collection exists — so this file must be deleted in the
 * same commit that implements them. It is self-enforcing: leaving it behind
 * turns `npm test` red.
 *
 * refs specs/001-foundation (PRC-01, PRC-02, PRC-03)
 */
import { describe, expect, it } from "vitest";
import { z } from "astro/zod";

import {
  PROCEDURE_ISSUE_CODES,
  PROCEDURE_SPEC_KINDS,
  SEAM_NOT_IMPLEMENTED,
  checkProcedureEntry,
  findProcedureIssues,
  procedureShapes,
} from "../../src/schemas/procedures.ts";
import {
  REFERENCE_KINDS,
  referenceEntrySchema,
} from "../../src/schemas/reference.ts";
import { partsSchema } from "../../src/schemas/parts.ts";
import {
  DIFFICULTY_MAX,
  DIFFICULTY_MIN,
  difficultySchema,
} from "../../src/schemas/problems.ts";
import {
  SAFETY_CRITICAL_SYSTEMS,
  isSafetyCritical,
  requiresSafetyFlagFromSubject,
} from "../../src/lib/safety.ts";
import { collections } from "../../src/content.config.ts";
import { COLLECTION_ROUTE_SEGMENTS } from "../../src/i18n/routes.ts";
import { findCitationIssues } from "../../scripts/check-citations.mjs";
import { issuePaths, unrecognizedKeys } from "../helpers/schema-outcome.ts";
import { accepts, parseProcedure } from "../helpers/procedures.ts";
import {
  PAGE_MODULES,
  findProcedureDetailPage,
  findProcedureIndexPage,
  pageKeysMatching,
} from "../helpers/page-modules.ts";
import {
  makeCorpusFor,
  makePart,
  makeProcedure,
  makeReference,
} from "../fixtures/procedure-fixtures.ts";

const seamError = new RegExp(SEAM_NOT_IMPLEMENTED);

/* -------------------------------------------------------------------------
 * 1. The seam itself
 * ---------------------------------------------------------------------- */

describe("T502a seam contract (delete this file in T502)", () => {
  it("agrees on the seam message the other graders rely on", () => {
    expect(SEAM_NOT_IMPLEMENTED).toBe("not implemented: T502");
  });

  it.each<[string, () => unknown]>([
    [
      "checkProcedureEntry",
      () => checkProcedureEntry(makeProcedure(), { addIssue: () => {} }),
    ],
    ["procedureShapes", () => procedureShapes()],
    [
      "findProcedureIssues",
      () => findProcedureIssues(makeCorpusFor([makeProcedure()])),
    ],
  ])(
    "src/schemas/procedures exports %s as an unimplemented seam",
    (_name, touch) => {
      expect(touch).toThrow(seamError);
    }
  );
});

/* -------------------------------------------------------------------------
 * 2. The vocabularies T502a pins
 * ---------------------------------------------------------------------- */

describe("T502a vocabularies agree with the modules they bind to", () => {
  it("names only real `reference` kinds as citable specs (PRC-03)", () => {
    for (const kind of PROCEDURE_SPEC_KINDS) {
      expect(REFERENCE_KINDS as readonly string[]).toContain(kind);
    }
  });

  it("covers PRC-03's own two words plus PRC-01's capacities", () => {
    expect([...PROCEDURE_SPEC_KINDS]).toEqual(["torque", "fluid", "capacity"]);
  });

  it("excludes the kinds a procedure cites as a source, not as a value", () => {
    // `fsm-section` is a citation and belongs in `sources`; the decoder kinds
    // answer "what does this code mean", which no procedure sets.
    for (const kind of [
      "fsm-section",
      "vin-position",
      "vin-code",
      "option-code",
    ]) {
      expect(PROCEDURE_SPEC_KINDS as readonly string[]).not.toContain(kind);
    }
  });

  it("names one corpus failure per question the build has to answer", () => {
    expect([...PROCEDURE_ISSUE_CODES]).toEqual([
      "duplicate-entry-id",
      "unknown-spec",
      "wrong-spec-kind",
      "unknown-part",
      "unknown-prerequisite",
      "prerequisite-cycle",
    ]);
  });
});

/* -------------------------------------------------------------------------
 * 3. The borrowed machinery works today
 *
 * Each of these is the *positive control* for a downstream `it.fails` grader.
 * If one of them goes red, that grader's expected failure has stopped being
 * about procedures.
 * ---------------------------------------------------------------------- */

describe("the machinery the T502a graders borrow (positive controls)", () => {
  it("`difficultySchema` is the 1–5 scale PRC-01 shares with PRB-01", () => {
    expect(DIFFICULTY_MIN).toBe(1);
    expect(DIFFICULTY_MAX).toBe(5);
    for (const value of [1, 2, 3, 4, 5]) {
      expect(difficultySchema.safeParse(value).success).toBe(true);
    }
    for (const value of [0, 6, 2.5, -1]) {
      expect(difficultySchema.safeParse(value).success).toBe(false);
    }
  });

  it("`findCitationIssues` flags an uncited number in shared data (REF-02)", () => {
    const issues = findCitationIssues({
      collection: "procedures",
      file: "src/content/procedures/test.md",
      data: {
        id: "test",
        fitment: { gens: ["gen3"] },
        confidence: "first-hand",
        sources: [],
        difficulty: 2,
        prose: { en: {}, es: {} },
      },
    }) as { field: string }[];

    expect(issues.map((issue) => issue.field)).toEqual(["difficulty"]);
  });

  it("`isSafetyCritical` answers from `system` alone, as PRC-02 needs", () => {
    for (const system of SAFETY_CRITICAL_SYSTEMS) {
      expect(isSafetyCritical({ system })).toBe(true);
    }
    expect(isSafetyCritical({ system: "engine" })).toBe(false);
    expect(isSafetyCritical({ system: "engine", safetyCritical: true })).toBe(
      true
    );
  });

  it("`requiresSafetyFlagFromSubject` reads a jacking/towing subject bilingually", () => {
    expect(
      requiresSafetyFlagFromSubject({
        id: "test-g3-general-jacking-points",
        prose: { en: { title: "Jacking points" }, es: { title: "Gatas" } },
      })
    ).toBe(true);

    expect(
      requiresSafetyFlagFromSubject({
        id: "test-g3-engine-oil-change",
        prose: {
          en: { title: "Engine oil change" },
          es: { title: "Cambio de aceite" },
        },
      })
    ).toBe(false);
  });
});

/* -------------------------------------------------------------------------
 * 4. Fixture integrity
 * ---------------------------------------------------------------------- */

describe("T502a fixtures are what the graders assume they are", () => {
  const baseProse = { title: z.string(), summary: z.string() };

  it.each(["torque", "fluid", "capacity", "dimension", "fsm-section"])(
    "the synthetic `%s` reference fixture is schema-valid",
    (kind) => {
      const outcome = referenceEntrySchema(baseProse).safeParse(
        makeReference({ id: `test-ref-${kind}`, kind })
      );

      expect(issuePaths(outcome)).toEqual([]);
      expect(outcome.success).toBe(true);
    }
  );

  it("the synthetic parts fixture is schema-valid", () => {
    const outcome = partsSchema.safeParse(makePart());

    expect(issuePaths(outcome)).toEqual([]);
    expect(outcome.success).toBe(true);
  });

  it("every part number in the fixtures is in the reserved TEST namespace", () => {
    // AGENTS.md: never invent a part number. A fixture number that *looks*
    // real is how one leaks into content.
    const part = makePart() as { oemNumber: string };
    expect(part.oemNumber.startsWith("TEST-")).toBe(true);

    const procedure = makeProcedure() as {
      tools: { sstNumber?: string }[];
    };
    for (const tool of procedure.tools) {
      if (tool.sstNumber === undefined) continue;
      expect(tool.sstNumber.startsWith("TEST-")).toBe(true);
    }
  });

  it("`makeProcedure` writes a prose line for every declared id, both locales", () => {
    const entry = makeProcedure() as {
      steps: { id: string }[];
      tools: { id: string }[];
      prerequisites: { id: string }[];
      prose: Record<string, Record<string, Record<string, string>>>;
    };

    for (const locale of ["en", "es"]) {
      expect(Object.keys(entry.prose[locale]?.steps ?? {})).toEqual(
        entry.steps.map((step) => step.id)
      );
      expect(Object.keys(entry.prose[locale]?.tools ?? {})).toEqual(
        entry.tools.map((tool) => tool.id)
      );
      expect(Object.keys(entry.prose[locale]?.prerequisites ?? {})).toEqual(
        entry.prerequisites.map((prerequisite) => prerequisite.id)
      );
    }
  });

  it("`proseOmit` really omits — the coverage graders depend on it", () => {
    const entry = makeProcedure({
      proseOmit: { es: { steps: ["test-step-torque"] } },
    }) as { prose: Record<string, { steps: Record<string, string> }> };

    expect(Object.keys(entry.prose["en"]?.steps ?? {})).toContain(
      "test-step-torque"
    );
    expect(Object.keys(entry.prose["es"]?.steps ?? {})).not.toContain(
      "test-step-torque"
    );
  });
});

/* -------------------------------------------------------------------------
 * 5. Today's absences are real absences
 * ---------------------------------------------------------------------- */

describe("what does not exist yet (the reason the markers are honest)", () => {
  /*
   * `procedures` *is* registered — on `baseEntrySchema()`, the placeholder
   * `src/content.config.ts` gives a collection "until the phase task that owns
   * it lands". So the honest statement of today's absence is not "no
   * collection" but "the registered collection knows none of PRC-01's fields",
   * and that is what makes every shape grader below fail: each of them comes
   * back as an unrecognized key at the root.
   */
  it("the registered `procedures` collection is still the placeholder shape", () => {
    expect(Object.keys(collections)).toContain("procedures");

    const barePlaceholderEntry = {
      id: "test-placeholder",
      fitment: { gens: ["gen3"] },
      confidence: "first-hand",
      sources: [],
      prose: {
        en: { title: "TEST", summary: "TEST" },
        es: { title: "PRUEBA", summary: "PRUEBA" },
      },
    };

    expect(accepts(barePlaceholderEntry)).toBe(true);
    expect(accepts(makeProcedure())).toBe(false);
    expect(unrecognizedKeys(parseProcedure(makeProcedure()))).toEqual(
      expect.arrayContaining([
        "system",
        "difficulty",
        "time",
        "steps",
        "tools",
        "prerequisites",
        "partsConsumed",
        "specs",
      ])
    );
  });

  it("no `procedures` route segment is registered", () => {
    expect(Object.keys(COLLECTION_ROUTE_SEGMENTS)).not.toContain("procedures");
  });

  it("the page glob works — it finds T501's parts pages", () => {
    // The positive control for `tests/pages/procedure-page.render.test.ts`.
    // Without it, "no procedures page" is indistinguishable from "the glob
    // pattern matches nothing at all".
    expect(Object.keys(PAGE_MODULES).length).toBeGreaterThan(0);
    expect(pageKeysMatching(/partSlug/).length).toBe(1);
  });

  it("and finds no procedures page, because none is written", () => {
    expect(findProcedureDetailPage()).toBeNull();
    expect(findProcedureIndexPage()).toBeNull();
  });
});
