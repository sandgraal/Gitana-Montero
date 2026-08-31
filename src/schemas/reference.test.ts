/**
 * Implementation-side unit tests for the `reference` collection schema (T207).
 *
 * What this schema alone can decide, within one entry: is the figure
 * well-formed, does the field belong to the kind, does an FSM index entry cite
 * the manual it indexes, and can an author demote a brakes figure out of the
 * safety notice. Cross-entry questions (fitment resolution) belong to
 * `src/lib/fitment/`; the "is this figure cited at all" gate is REF-02's
 * `check:citations` and is graded in `tests/check-citations.test.ts`.
 *
 * Every fixture is synthetic in the same sense as
 * `tests/fixtures/schema-fixtures.ts`: `.invalid` URLs, `test-`-prefixed ids,
 * and figures chosen to be structurally interesting rather than to assert a
 * fact about a real truck. Nothing here is a torque specification anyone
 * should tighten anything to.
 *
 * refs specs/001-foundation (REF-01, REF-02)
 */
import { describe, expect, it } from "vitest";
import { z } from "astro/zod";
import { issuePaths } from "../../tests/helpers/schema-outcome.ts";
import {
  COLLECTION_ENTRY_PATTERNS,
  DATA_ENTRY_PATTERN,
  ENTRY_PATTERN,
} from "../content.config.ts";
import {
  ANGLE_UNITS,
  DIMENSION_UNITS,
  FSM_SUMMARY_MAX_LENGTH,
  REFERENCE_KINDS,
  TORQUE_UNITS,
  VOLUME_UNITS,
  assertNoFieldCollisions,
  quantitySchema,
  referenceEntrySchema,
} from "./reference";

const schema = referenceEntrySchema({
  title: z.string(),
  summary: z.string(),
});

function source(kind = "fsm") {
  return {
    title: "TEST fixture source — not a real document",
    url: "https://example.invalid/t207/source",
    archiveUrl:
      "https://web.archive.org/web/20260101000000/" +
      "https://example.invalid/t207/source",
    accessed: "2026-08-30",
    kind,
  };
}

function prose(summary = "Synthetic T207 fixture.") {
  return {
    en: { title: "TEST reference row", summary },
    es: { title: "Fila de referencia de prueba", summary },
  };
}

/** The envelope every entry carries, so each test states only its subject. */
function envelope(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    id: "test-reference-alpha",
    fitment: { gens: ["gen3"] },
    confidence: "fsm-confirmed",
    sources: [source()],
    prose: prose(),
    ...overrides,
  };
}

function torqueEntry(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return envelope({
    kind: "torque",
    system: "engine",
    torque: { value: 88, unit: "nm" },
    ...overrides,
  });
}

function fluidEntry(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return envelope({
    kind: "fluid",
    system: "transmission",
    specification: "TEST FLUID SPEC — not a real designation",
    ...overrides,
  });
}

function fsmSectionEntry(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return envelope({
    kind: "fsm-section",
    system: "engine",
    manual: "TEST Service Manual, Vol. 2",
    section: "Group 00 — TEST",
    ...overrides,
  });
}

describe("the reference entry envelope", () => {
  it("accepts a well-formed torque row", () => {
    expect(schema.safeParse(torqueEntry()).success).toBe(true);
  });

  it("requires a kind", () => {
    const entry = torqueEntry();
    delete entry.kind;
    expect(issuePaths(schema.safeParse(entry))).toContain("kind");
  });

  it("requires a system", () => {
    const entry = torqueEntry();
    delete entry.system;
    expect(issuePaths(schema.safeParse(entry))).toContain("system");
  });

  it("rejects a system outside the glossary vocabulary", () => {
    expect(
      issuePaths(schema.safeParse(torqueEntry({ system: "flux-capacitor" })))
    ).toContain("system");
  });

  it("names an unknown top-level field rather than stripping it", () => {
    const outcome = schema.safeParse(torqueEntry({ torqueNm: 88 }));
    expect(outcome.success).toBe(false);
    expect(JSON.stringify(outcome)).toMatch(/torqueNm/);
  });

  it("still requires both prose locales", () => {
    const entry = torqueEntry();
    entry.prose = { en: { title: "T", summary: "S" } };
    expect(issuePaths(schema.safeParse(entry))).toContain("prose.es");
  });
});

describe("per-kind field ownership", () => {
  it("rejects a fluid field on a torque entry, naming the field", () => {
    const outcome = schema.safeParse(
      torqueEntry({ specification: "TEST SPEC" })
    );
    expect(issuePaths(outcome)).toContain("specification");
    expect(JSON.stringify(outcome)).toMatch(/another reference kind/);
  });

  it("rejects a torque entry with no torque, naming the field", () => {
    const entry = torqueEntry();
    delete entry.torque;
    expect(issuePaths(schema.safeParse(entry))).toContain("torque");
  });

  it("requires a fluid entry to state its specification", () => {
    const entry = fluidEntry();
    delete entry.specification;
    expect(issuePaths(schema.safeParse(entry))).toContain("specification");
  });

  it("lets fluid and capacity share the one capacity quantity", () => {
    expect(
      schema.safeParse(fluidEntry({ capacity: { value: 2.3, unit: "l" } }))
        .success
    ).toBe(true);
    expect(
      schema.safeParse(
        envelope({
          kind: "capacity",
          system: "fuel",
          capacity: { value: 90, unit: "l" },
        })
      ).success
    ).toBe(true);
  });

  it("covers every declared kind with a shape", () => {
    // A kind added to REFERENCE_KINDS without a shape would parse every field
    // as unrecognized; the `satisfies` in the module makes that a type error,
    // and this makes it a red test too.
    for (const kind of REFERENCE_KINDS) {
      const outcome = schema.safeParse(envelope({ kind, system: "engine" }));
      expect(JSON.stringify(outcome), kind).not.toMatch(/is not a field of a/);
    }
  });
});

describe("quantities", () => {
  const torque = (quantity: unknown) =>
    schema.safeParse(torqueEntry({ torque: quantity }));

  it("accepts a bare value", () => {
    expect(torque({ value: 88, unit: "nm" }).success).toBe(true);
  });

  it("accepts a min/max band with no nominal", () => {
    expect(torque({ min: 84, max: 96, unit: "nm" }).success).toBe(true);
  });

  it("accepts a nominal inside its band", () => {
    expect(torque({ value: 88, min: 84, max: 96, unit: "nm" }).success).toBe(
      true
    );
  });

  it("rejects a lone min — half a specification is never completed by us", () => {
    const outcome = torque({ min: 84, unit: "nm" });
    expect(outcome.success).toBe(false);
    expect(JSON.stringify(outcome)).toMatch(/invented number/);
  });

  it("rejects a figure with no value, min or max", () => {
    expect(torque({ unit: "nm" }).success).toBe(false);
  });

  it("rejects an inverted band", () => {
    expect(torque({ min: 96, max: 84, unit: "nm" }).success).toBe(false);
  });

  it("rejects a nominal outside its own band", () => {
    const outcome = torque({ value: 120, min: 84, max: 96, unit: "nm" });
    expect(outcome.success).toBe(false);
    expect(JSON.stringify(outcome)).toMatch(/outside its own band/);
  });

  it("requires a unit", () => {
    expect(torque({ value: 88 }).success).toBe(false);
  });

  it("rejects a unit from another family", () => {
    // A torque in litres is a typo, not a rendering surprise.
    expect(torque({ value: 88, unit: "l" }).success).toBe(false);
  });

  it.each([...TORQUE_UNITS])("accepts the torque unit %s", (unit) => {
    expect(torque({ value: 88, unit }).success).toBe(true);
  });

  it("rejects a zero or negative torque", () => {
    expect(torque({ value: 0, unit: "nm" }).success).toBe(false);
    expect(torque({ value: -5, unit: "nm" }).success).toBe(false);
  });

  it("allows a signed dimension (camber, caster, toe are negative)", () => {
    expect(
      schema.safeParse(
        envelope({
          kind: "dimension",
          system: "suspension",
          dimension: { value: -0.5, unit: "deg" },
          safetyCritical: true,
        })
      ).success
    ).toBe(true);
  });

  it.each([...VOLUME_UNITS])("accepts the volume unit %s", (unit) => {
    expect(
      schema.safeParse(fluidEntry({ capacity: { value: 2, unit } })).success
    ).toBe(true);
  });

  it.each([...DIMENSION_UNITS])("accepts the dimension unit %s", (unit) => {
    expect(
      schema.safeParse(
        envelope({
          kind: "dimension",
          system: "body",
          dimension: { value: 2, unit },
        })
      ).success
    ).toBe(true);
  });

  it("exposes the same rules through quantitySchema directly", () => {
    const angle = quantitySchema(ANGLE_UNITS);
    expect(angle.safeParse({ value: 90, unit: "deg" }).success).toBe(true);
    expect(angle.safeParse({ value: 90, unit: "nm" }).success).toBe(false);
  });
});

describe("torque stages (torque-to-yield fasteners)", () => {
  it("accepts a torque-then-angle sequence", () => {
    expect(
      schema.safeParse(
        torqueEntry({
          stages: [
            { torque: { value: 50, unit: "nm" } },
            { angle: { value: 90, unit: "deg" } },
            { angle: { value: 90, unit: "deg" } },
          ],
          singleUseFastener: true,
        })
      ).success
    ).toBe(true);
  });

  it("rejects an empty stage", () => {
    const outcome = schema.safeParse(
      torqueEntry({ stages: [{}, { angle: { value: 90, unit: "deg" } }] })
    );
    expect(outcome.success).toBe(false);
  });

  it("rejects a one-item sequence — that is the torque field", () => {
    expect(
      schema.safeParse(
        torqueEntry({ stages: [{ torque: { value: 50, unit: "nm" } }] })
      ).success
    ).toBe(false);
  });
});

describe("service intervals", () => {
  it("accepts distance, time, or both", () => {
    for (const serviceInterval of [
      { km: 10000 },
      { months: 6 },
      { km: 10000, months: 6 },
    ]) {
      expect(schema.safeParse(fluidEntry({ serviceInterval })).success).toBe(
        true
      );
    }
  });

  it("rejects an empty interval", () => {
    expect(schema.safeParse(fluidEntry({ serviceInterval: {} })).success).toBe(
      false
    );
  });

  it("rejects a fractional or negative distance", () => {
    expect(
      schema.safeParse(fluidEntry({ serviceInterval: { km: 1000.5 } })).success
    ).toBe(false);
    expect(
      schema.safeParse(fluidEntry({ serviceInterval: { km: -1 } })).success
    ).toBe(false);
  });
});

describe("the FSM section index — cite, never reproduce", () => {
  it("accepts a section pointer citing the manual", () => {
    expect(schema.safeParse(fsmSectionEntry()).success).toBe(true);
  });

  it("accepts a page range", () => {
    expect(
      schema.safeParse(fsmSectionEntry({ pages: { from: 11, to: 42 } })).success
    ).toBe(true);
  });

  it("rejects a backwards page range", () => {
    expect(
      schema.safeParse(fsmSectionEntry({ pages: { from: 42, to: 11 } })).success
    ).toBe(false);
  });

  it("FAILS an FSM index entry that cites no fsm source", () => {
    const outcome = schema.safeParse(
      fsmSectionEntry({ sources: [source("forum")] })
    );
    expect(issuePaths(outcome)).toContain("sources");
    expect(JSON.stringify(outcome)).toMatch(/pointer into the factory manual/);
  });

  it("does not impose that rule on other kinds", () => {
    expect(
      schema.safeParse(
        torqueEntry({
          confidence: "community-consensus",
          sources: [source("forum")],
        })
      ).success
    ).toBe(true);
  });

  it.each(["en", "es"])(
    "FAILS an FSM index entry whose %s summary is long enough to be a procedure",
    (locale) => {
      const entry = fsmSectionEntry();
      const long = "a".repeat(FSM_SUMMARY_MAX_LENGTH + 1);
      entry.prose = {
        ...prose(),
        [locale]: { title: "T", summary: long },
      };
      const outcome = schema.safeParse(entry);
      expect(issuePaths(outcome)).toContain(`prose.${locale}.summary`);
      expect(JSON.stringify(outcome)).toMatch(/copyrighted/);
    }
  );

  it("accepts a summary exactly at the cap", () => {
    const entry = fsmSectionEntry();
    const atCap = "a".repeat(FSM_SUMMARY_MAX_LENGTH);
    entry.prose = {
      en: { title: "T", summary: atCap },
      es: { title: "T", summary: atCap },
    };
    expect(schema.safeParse(entry).success).toBe(true);
  });
});

/**
 * T207 review, F1 + F2: the anti-reproduction guard has two halves — the cap
 * on the field, and the loader that stops a Markdown *body* from being a place
 * to put a procedure the cap never sees. Both are pinned here, because both
 * enforce a copyright non-negotiable and neither is load-bearing for anything
 * else, which is exactly the kind of code a later refactor removes without
 * anyone noticing.
 */
describe("the anti-reproduction guard is pinned, not incidental", () => {
  it("caps the fsm-section summary at 500 characters", () => {
    // AGENTS.md, "Safety and legal": "Cite the Factory Service Manual, never
    // reproduce it. Section references only. It is copyrighted." 500
    // characters is a sentence or two — enough to say what a section covers,
    // far too little to paste a procedure into. The reviewer set this to
    // 100 000 and every other test stayed green; this assertion is why that
    // cannot happen twice. Changing the number is a deliberate act that
    // updates this line and says why.
    expect(FSM_SUMMARY_MAX_LENGTH).toBe(500);
  });

  it("loads the reference collection from data files only", () => {
    // A `.md`/`.mdx` entry carries an unvalidated body outside every schema,
    // so a verbatim procedure in a body passes the cap, the schema, and every
    // check (T207 review, F1). The reference collection has no legitimate use
    // for a body, so the narrowing lives in the loader, where it cannot be
    // forgotten.
    expect(COLLECTION_ENTRY_PATTERNS["reference"]).toBe(DATA_ENTRY_PATTERN);
    expect(DATA_ENTRY_PATTERN).not.toMatch(/md/);
    // Positive control: the default pattern really does admit bodies, so the
    // assertion above is a difference and not a tautology.
    expect(ENTRY_PATTERN).toMatch(/md/);
  });
});

describe("assertNoFieldCollisions", () => {
  const capacity = quantitySchema(VOLUME_UNITS);

  it("accepts two kinds sharing literally the same field", () => {
    expect(() =>
      assertNoFieldCollisions({
        alpha: { capacity: capacity.optional() },
        beta: { capacity },
      })
    ).not.toThrow();
  });

  it("THROWS when two kinds declare one field name with different schemas", () => {
    // The failure this prevents: flattening resolves the collision by
    // last-writer-wins, and one kind silently starts validating against the
    // other kind's rules.
    expect(() =>
      assertNoFieldCollisions({
        alpha: { capacity },
        beta: { capacity: quantitySchema(TORQUE_UNITS) },
      })
    ).toThrow(/`capacity` is declared by `alpha` and by `beta`/);
  });

  it("names both kinds, so the author knows where to look", () => {
    expect(() =>
      assertNoFieldCollisions({
        alpha: { threads: z.string() },
        beta: { threads: z.number() },
      })
    ).toThrow(/refs specs\/001-foundation \(REF-01\)/);
  });
});

describe("the safety hook", () => {
  it("needs no flag on a safety-critical system — the system is the signal", () => {
    expect(schema.safeParse(torqueEntry({ system: "brakes" })).success).toBe(
      true
    );
  });

  it("REJECTS demoting a safety-critical system with safetyCritical: false", () => {
    const outcome = schema.safeParse(
      torqueEntry({ system: "brakes", safetyCritical: false })
    );
    expect(issuePaths(outcome)).toContain("safetyCritical");
    expect(JSON.stringify(outcome)).toMatch(/only ever promotes/);
  });

  it("allows promoting a system the list does not catch (SRS, jacking points)", () => {
    expect(
      schema.safeParse(torqueEntry({ system: "body", safetyCritical: true }))
        .success
    ).toBe(true);
  });

  it("allows an explicit false on a system that is not safety-critical", () => {
    expect(
      schema.safeParse(torqueEntry({ system: "body", safetyCritical: false }))
        .success
    ).toBe(true);
  });
});
