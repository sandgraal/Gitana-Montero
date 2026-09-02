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
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "astro/zod";
import { issueCodes, issuePaths } from "../../tests/helpers/schema-outcome.ts";
import {
  COLLECTION_ENTRY_PATTERNS,
  DATA_ENTRY_PATTERN,
  ENTRY_PATTERN,
} from "../content.config.ts";
import {
  ANGLE_UNITS,
  CODE_MAX_LENGTH,
  DIMENSION_UNITS,
  FSM_SUMMARY_MAX_LENGTH,
  OPTION_CODE_SETS,
  REFERENCE_KINDS,
  TORQUE_UNITS,
  VIN_EXCLUDED_LETTERS,
  VIN_FIELDS,
  VIN_LENGTH,
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

/**
 * T208's decoder fixtures. Every code below is invented for shape, not read off
 * a chart — `ZZ` is not a Mitsubishi engine code and `test-engine` is not a
 * taxonomy id. Nothing here decodes a real VIN.
 */
function vinPositionEntry(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return envelope({
    kind: "vin-position",
    system: "general",
    sources: [source("manufacturer")],
    positions: { from: 12, to: 17 },
    encodes: "serial",
    ...overrides,
  });
}

function vinCodeEntry(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return envelope({
    kind: "vin-code",
    system: "engine",
    sources: [source("manufacturer")],
    positions: { from: 8 },
    code: "Z",
    ...overrides,
  });
}

function optionCodeEntry(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return envelope({
    kind: "option-code",
    system: "body",
    sources: [source("manufacturer")],
    codeSet: "paint",
    code: "T99",
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

  it("rejects a lone max the same way", () => {
    const outcome = torque({ max: 96, unit: "nm" });
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

  /**
   * SCF-04 is "names the file and the *field*", and the structured `path` is
   * the machine-readable half of that — it is what an editor jumps to and what
   * `issuePaths` reads. The message being right is not enough, which is
   * exactly how the lone-`max` case shipped pointing at `min`, a key that is
   * not in the object at all (T207 review, Copilot). Every quantity issue's
   * path is pinned here, and pinned at the *entry* level so the re-pathing
   * through `torque.` is proved too.
   */
  describe("issue paths name the field that is actually there", () => {
    /**
     * De-duplicated on purpose, and the duplication is itself pinned below: a
     * quantity is reached twice — once through the flattened shared shape and
     * once through the per-kind re-parse in `checkReferenceEntry` — so each
     * issue is reported twice with the same path. That is the `vehicles.ts`
     * flatten-then-reparse pattern's cost, it is cosmetic (the same field,
     * named twice), and it is not what these tests are about.
     */
    const pathsOf = (outcome: unknown) => [...new Set(issuePaths(outcome))];

    it("attaches a lone min to `min`", () => {
      expect(pathsOf(torque({ min: 84, unit: "nm" }))).toEqual(["torque.min"]);
    });

    it("attaches a lone max to `max`, not to the absent `min`", () => {
      // The regression this file exists for: the path read `["min"]` for both
      // halves, so a lone `max` was reported against a key not in the object.
      expect(pathsOf(torque({ max: 96, unit: "nm" }))).toEqual(["torque.max"]);
      expect(issuePaths(torque({ max: 96, unit: "nm" }))).not.toContain(
        "torque.min"
      );
    });

    it("attaches a wholly empty figure to `value`", () => {
      // Nothing half-written to point at, so it lands on the field that
      // should have been used.
      expect(pathsOf(torque({ unit: "nm" }))).toEqual(["torque.value"]);
    });

    it("attaches an inverted band to `max`", () => {
      expect(pathsOf(torque({ min: 96, max: 84, unit: "nm" }))).toEqual([
        "torque.max",
      ]);
    });

    it("attaches an out-of-band nominal to `value`", () => {
      expect(
        pathsOf(torque({ value: 120, min: 84, max: 96, unit: "nm" }))
      ).toEqual(["torque.value"]);
    });

    it("names the same fields on a capacity, not just on a torque", () => {
      // The rule lives in `quantitySchema`, so it must re-path identically
      // wherever a quantity is embedded.
      expect(
        pathsOf(
          schema.safeParse(fluidEntry({ capacity: { max: 4, unit: "l" } }))
        )
      ).toEqual(["capacity.max"]);
    });

    it("reports each quantity issue twice, at one path (known, cosmetic)", () => {
      // Recorded rather than silently deduped: the flatten-then-reparse shape
      // reaches every kind-owned field twice. Pinned so the day someone
      // changes that (deliberately or not), a test says so — the field named
      // is what SCF-04 is about, and that is unaffected.
      expect(issuePaths(torque({ max: 96, unit: "nm" }))).toEqual([
        "torque.max",
        "torque.max",
      ]);
    });
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

/**
 * T208 — the VIN/option-code decoder kinds (REF-01).
 *
 * The schema cannot read a factory VIN chart, so nothing here grades whether a
 * decoding is *true*; that is the content half's job, with its citations. What
 * these grade is the class of mistake a reviewer skimming eighty single-letter
 * rows will miss: a code in the wrong alphabet, a code that does not fill the
 * positions it claims, and a meaning that contradicts the row's own fitment.
 */
describe("the VIN position map (`vin-position`)", () => {
  it("accepts a row that says which characters are the serial", () => {
    expect(schema.safeParse(vinPositionEntry()).success).toBe(true);
  });

  it("accepts a single position", () => {
    expect(
      schema.safeParse(
        vinPositionEntry({ positions: { from: 10 }, encodes: "model-year" })
      ).success
    ).toBe(true);
  });

  it("requires the range and the field it encodes", () => {
    for (const field of ["positions", "encodes"]) {
      const entry = vinPositionEntry();
      delete entry[field];
      expect(issuePaths(schema.safeParse(entry)), field).toContain(field);
    }
  });

  it("rejects a field outside the closed vocabulary", () => {
    expect(
      issuePaths(
        schema.safeParse(vinPositionEntry({ encodes: "lucky-number" }))
      )
    ).toContain("encodes");
  });

  /**
   * One position each field really is encoded at, written out rather than read
   * from `VIN_FIELD_SECTIONS` — a table derived from the table it grades proves
   * nothing. Changing the section map must change this list too.
   */
  const A_REAL_POSITION: Record<string, number> = {
    wmi: 1,
    country: 1,
    manufacturer: 2,
    "vehicle-type": 3,
    line: 4,
    "body-style": 5,
    engine: 6,
    transmission: 7,
    drive: 8,
    "restraint-system": 5,
    series: 9,
    "check-digit": 9,
    "model-year": 10,
    plant: 11,
    serial: 12,
  };

  it.each([...VIN_FIELDS])(
    "accepts the VIN field %s where it lives",
    (encodes) => {
      expect(
        schema.safeParse(
          vinPositionEntry({
            encodes,
            positions: { from: A_REAL_POSITION[encodes] },
          })
        ).success
      ).toBe(true);
    }
  );

  /**
   * T208 review, F1: `encodes` and `positions` used to be two independent
   * fields, so `wmi` at 4–8 and `country` at 17 both parsed — which made a
   * nonsense of the reason this kind exists. The bound is ISO 3779's *section*
   * (WMI 1–3, VDS 4–9, VIS 10–17), never a national position convention.
   */
  it.each([
    ["wmi", { from: 4, to: 8 }],
    ["country", { from: 17 }],
    ["manufacturer", { from: 10 }],
    ["engine", { from: 1 }],
    ["engine", { from: 8, to: 11 }],
    ["series", { from: 12 }],
    ["serial", { from: 1 }],
    ["plant", { from: 1 }],
    ["model-year", { from: 9 }],
  ] as const)(
    "REJECTS %s at %o — it is not in that section of the VIN",
    (encodes, positions) => {
      const outcome = schema.safeParse(
        vinPositionEntry({ encodes, positions })
      );
      expect(issuePaths(outcome)).toContain("positions");
      expect(JSON.stringify(outcome)).toMatch(/ISO 3779/);
    }
  );

  it("accepts a range that fills a whole section", () => {
    for (const [encodes, positions] of [
      ["wmi", { from: 1, to: 3 }],
      ["series", { from: 4, to: 9 }],
      ["serial", { from: 12, to: 17 }],
    ] as const) {
      expect(
        schema.safeParse(vinPositionEntry({ encodes, positions })).success,
        encodes
      ).toBe(true);
    }
  });

  it("bounds the check digit by nothing — ISO 3779 does not place it", () => {
    // 49 CFR 565 puts it at position 9 for the North American market; markets
    // that require no check digit leave that position to the descriptor. This
    // site is global-scope, so the row a market's own chart prints must be
    // writable — including the one this deliberately does not pin.
    for (const positions of [{ from: 9 }, { from: 1 }, { from: 17 }]) {
      expect(
        schema.safeParse(
          vinPositionEntry({ encodes: "check-digit", positions })
        ).success,
        JSON.stringify(positions)
      ).toBe(true);
    }
  });

  it("REJECTS a position outside the 17-character VIN", () => {
    // A transposed `17` → `71` is the mistake this bound exists for.
    for (const positions of [{ from: 0 }, { from: 18 }, { from: 1, to: 71 }]) {
      expect(
        schema.safeParse(vinPositionEntry({ positions })).success,
        JSON.stringify(positions)
      ).toBe(false);
    }
  });

  it("rejects a fractional position", () => {
    expect(
      schema.safeParse(vinPositionEntry({ positions: { from: 4.5 } })).success
    ).toBe(false);
  });

  it("rejects a backwards range", () => {
    expect(
      schema.safeParse(vinPositionEntry({ positions: { from: 8, to: 4 } }))
        .success
    ).toBe(false);
  });

  it("carries no code — the serial is a position, not a table", () => {
    const outcome = schema.safeParse(vinPositionEntry({ code: "Z" }));
    expect(issuePaths(outcome)).toContain("code");
    expect(JSON.stringify(outcome)).toMatch(/another reference kind/);
  });

  it("pins the VIN at 17 characters (ISO 3779)", () => {
    // Load-bearing: it is the only thing that makes "position 18" an error,
    // and it is the difference between a VIN row and a JDM chassis code, which
    // is an `option-code` precisely because it has no ISO positions.
    expect(VIN_LENGTH).toBe(17);
  });
});

describe("VIN code rows (`vin-code`)", () => {
  it("accepts a one-character code at one position", () => {
    expect(schema.safeParse(vinCodeEntry()).success).toBe(true);
  });

  it("accepts a code that fills a range exactly", () => {
    expect(
      schema.safeParse(
        vinCodeEntry({ positions: { from: 4, to: 8 }, code: "ZZ5W7" })
      ).success
    ).toBe(true);
  });

  it("requires both the code and the positions it is read from", () => {
    for (const field of ["code", "positions"]) {
      const entry = vinCodeEntry();
      delete entry[field];
      expect(issuePaths(schema.safeParse(entry)), field).toContain(field);
    }
  });

  it("REJECTS a code that does not fill the positions it claims", () => {
    const outcome = schema.safeParse(
      vinCodeEntry({ positions: { from: 4, to: 8 }, code: "Z" })
    );
    expect(issuePaths(outcome)).toContain("code");
    expect(JSON.stringify(outcome)).toMatch(/fills exactly the positions/);
  });

  it.each([...VIN_EXCLUDED_LETTERS])(
    "REJECTS the letter %s, which no VIN contains",
    (letter) => {
      const outcome = schema.safeParse(vinCodeEntry({ code: letter }));
      expect(issuePaths(outcome)).toContain("code");
      expect(JSON.stringify(outcome)).toMatch(/ISO 3779/);
    }
  );

  it("rejects a lowercase code — one code is one row", () => {
    expect(schema.safeParse(vinCodeEntry({ code: "z" })).success).toBe(false);
  });

  it("rejects a code with a space, and a blank one", () => {
    for (const code of ["Z Z", "", " "]) {
      expect(
        schema.safeParse(vinCodeEntry({ positions: { from: 4, to: 6 }, code }))
          .success,
        JSON.stringify(code)
      ).toBe(false);
    }
  });

  /**
   * PR #63, Copilot — the finding two review rounds missed.
   *
   * `code` is one schema object shared with `option-code` (the flatten guard
   * requires that identity), and it admits hyphens because stamped option
   * codes have them. A VIN does not: every one of its seventeen characters is
   * a letter or a digit. Worse, the hyphen *counts toward `code.length`*, so
   * before this rule a hyphenated code could satisfy the position-fill check
   * while standing for fewer real VIN characters than its range claimed — a
   * structurally impossible VIN that validated.
   */
  it("REJECTS a hyphen in a VIN code — a VIN is strictly alphanumeric", () => {
    const outcome = schema.safeParse(
      vinCodeEntry({ positions: { from: 4, to: 5 }, code: "Z-" })
    );
    expect(issuePaths(outcome)).toContain("code");
    expect(JSON.stringify(outcome)).toMatch(/strictly alphanumeric/);
  });

  it("REJECTS the gamed case: a hyphenated code whose length matches its width", () => {
    // `Z-Z` is three characters for a three-position range, so the fill rule
    // is satisfied and says nothing — yet the code stands for two real VIN
    // characters at positions 4–6. This is the case that used to pass, and it
    // is why the hyphen rule cannot be left to the width check.
    const entry = vinCodeEntry({ positions: { from: 4, to: 6 }, code: "Z-Z" });
    const outcome = schema.safeParse(entry);
    expect(outcome.success).toBe(false);
    expect(issuePaths(outcome)).toContain("code");
    expect(JSON.stringify(outcome)).toMatch(/strictly alphanumeric/);
    // Proof that the width rule really is silent here, so the assertion above
    // is the hyphen rule doing the work and not a second opinion.
    expect(JSON.stringify(outcome)).not.toMatch(/fills exactly the positions/);
  });

  it("keeps accepting the same code shape on an option-code", () => {
    // The other direction: the shared field schema is unchanged and stays
    // wide. `MB-000001` is a stamped code, not a VIN, and remains legal.
    expect(
      schema.safeParse(
        optionCodeEntry({ codeSet: "equipment", code: "MB-000001" })
      ).success
    ).toBe(true);
    expect(
      schema.safeParse(optionCodeEntry({ codeSet: "equipment", code: "Z-Z" }))
        .success
    ).toBe(true);
  });

  it("needs no length cap of its own — the positions are the cap", () => {
    // A vin-code's length is bounded from both sides by its position range,
    // and the range is bounded by VIN_LENGTH: 17 characters is the ceiling and
    // there is no `to` "far enough away" to make a 33-character code legal.
    // That is why CODE_MAX_LENGTH's grader is an option-code, below.
    expect(
      schema.safeParse(
        vinCodeEntry({
          positions: { from: 1, to: 17 },
          code: "A".repeat(CODE_MAX_LENGTH + 1),
        })
      ).success
    ).toBe(false);
  });
});

describe("option and build-plate codes (`option-code`)", () => {
  it("accepts a paint code", () => {
    expect(schema.safeParse(optionCodeEntry()).success).toBe(true);
  });

  it("requires the set the code comes from", () => {
    const entry = optionCodeEntry();
    delete entry.codeSet;
    expect(issuePaths(schema.safeParse(entry))).toContain("codeSet");
  });

  it("rejects a set outside the closed vocabulary", () => {
    expect(
      issuePaths(schema.safeParse(optionCodeEntry({ codeSet: "vibes" })))
    ).toContain("codeSet");
  });

  it.each([...OPTION_CODE_SETS])("accepts the code set %s", (codeSet) => {
    expect(schema.safeParse(optionCodeEntry({ codeSet })).success).toBe(true);
  });

  it("carries no VIN positions — it is not in the VIN", () => {
    const outcome = schema.safeParse(
      optionCodeEntry({ positions: { from: 4 } })
    );
    expect(issuePaths(outcome)).toContain("positions");
  });

  it("takes a JDM model code, which is not a VIN and keeps its letters", () => {
    // `V45W`: no ISO positions, and the excluded-letter rule is a VIN rule, so
    // it does not fire here. This is the row the three-kind split exists for.
    expect(
      schema.safeParse(
        optionCodeEntry({
          codeSet: "model-code",
          code: "V45W",
          system: "general",
        })
      ).success
    ).toBe(true);
  });

  /**
   * T208 review, F2. This is `CODE_MAX_LENGTH`'s real grader: an option code
   * has **no positions**, so the cap is the only length bound it has. Remove
   * `.max(CODE_MAX_LENGTH)` from the code schema and this test — and only this
   * test — goes red.
   */
  it("REJECTS a description pasted into an option code", () => {
    expect(
      schema.safeParse(
        optionCodeEntry({ code: "A".repeat(CODE_MAX_LENGTH + 1) })
      ).success
    ).toBe(false);
    // The neighbouring length is legal, so the assertion above is the cap and
    // not some other rule objecting.
    expect(
      schema.safeParse(optionCodeEntry({ code: "A".repeat(CODE_MAX_LENGTH) }))
        .success
    ).toBe(true);
  });

  it("pins the code cap at 32 characters", () => {
    // Same precedent as FSM_SUMMARY_MAX_LENGTH: a bound nothing else enforces
    // is a bound a refactor deletes silently. Changing this number is a
    // deliberate act that updates this line and says why.
    expect(CODE_MAX_LENGTH).toBe(32);
  });

  /**
   * T208 review, F5: the first pattern was `/^[0-9A-Z][0-9A-Z-]*$/`, which
   * accepted `V45W-` and `V45--W` while the docstring claimed hyphens were
   * *inside* a code. It now mirrors `TAXONOMY_ID_PATTERN`'s shape with the case
   * inverted — alphanumeric groups joined by single hyphens.
   */
  it.each(["V45W-", "-V45W", "V45--W", "V45 W", "v45w", "V45W_A", ""])(
    "REJECTS the malformed code %o",
    (code) => {
      expect(issuePaths(schema.safeParse(optionCodeEntry({ code })))).toContain(
        "code"
      );
    }
  );

  it.each(["V45W", "T69", "A31", "MB-000001", "6G74-SOHC"])(
    "accepts the well-formed code %s",
    (code) => {
      expect(
        schema.safeParse(optionCodeEntry({ code, codeSet: "equipment" }))
          .success
      ).toBe(true);
    }
  );

  /**
   * T208 review, F6: a `-model` code set names an entity the taxonomy has an
   * id for, so a decoding of one that names something else has one of its two
   * fields wrong. Both sides are closed vocabularies, so the rule is a lookup.
   */
  it("accepts an engine-model code that decodes to an engine", () => {
    expect(
      schema.safeParse(
        optionCodeEntry({
          codeSet: "engine-model",
          code: "6G74",
          system: "engine",
          fitment: { gens: ["gen3"], engines: ["test-engine"] },
          decodesTo: { engine: "test-engine" },
        })
      ).success
    ).toBe(true);
  });

  it.each([
    ["engine-model", "engine"],
    ["transmission-model", "transmission"],
    ["transfer-case-model", "transferCase"],
  ] as const)(
    "REJECTS a %s code whose decoding names no %s",
    (codeSet, facet) => {
      const outcome = schema.safeParse(
        optionCodeEntry({
          codeSet,
          system: "general",
          decodesTo: { generation: "gen3" },
        })
      );
      expect(issuePaths(outcome)).toContain(`decodesTo.${facet}`);
      expect(JSON.stringify(outcome)).toMatch(/that is what the code set/);
    }
  );

  it("does not require a decoding at all — an id is never invented to satisfy a schema", () => {
    // A build-plate code whose engine has no taxonomy entry yet is written
    // with its meaning in prose, in both locales, and no `decodesTo`.
    expect(
      schema.safeParse(
        optionCodeEntry({ codeSet: "engine-model", system: "engine" })
      ).success
    ).toBe(true);
  });

  it("imposes no such rule on the sets that name no taxonomy entity", () => {
    // `model-code` is deliberately absent from the table: `V45W` spans engine
    // *and* body *and* wheelbase at once, so there is no one facet it must
    // state.
    expect(
      schema.safeParse(
        optionCodeEntry({
          codeSet: "model-code",
          code: "V45W",
          system: "general",
          decodesTo: { generation: "gen3" },
        })
      ).success
    ).toBe(true);
  });
});

describe("what a code decodes to (`decodesTo`)", () => {
  it("accepts an engine id the row is also scoped to", () => {
    expect(
      schema.safeParse(
        vinCodeEntry({
          fitment: { gens: ["gen3"], engines: ["test-engine"] },
          decodesTo: { engine: "test-engine" },
        })
      ).success
    ).toBe(true);
  });

  it("REJECTS a meaning the row's own fitment contradicts", () => {
    const outcome = schema.safeParse(
      vinCodeEntry({
        fitment: { gens: ["gen3"], engines: ["other-engine"] },
        decodesTo: { engine: "test-engine" },
      })
    );
    expect(issuePaths(outcome)).toContain("decodesTo.engine");
    expect(JSON.stringify(outcome)).toMatch(/only applies to trucks that have/);
  });

  it("REJECTS a meaning the fitment does not scope at all", () => {
    // This is also how the id reaches the taxonomy: `fitment.engines` is
    // resolved against the real `vehicles` collection at build time (FIT-02),
    // so an id that names nothing fails there — without this module keeping a
    // second, driftable copy of the id space.
    const outcome = schema.safeParse(
      vinCodeEntry({ decodesTo: { engine: "test-engine" } })
    );
    expect(issuePaths(outcome)).toContain("decodesTo.engine");
    expect(JSON.stringify(outcome)).toMatch(/claims every one of them/);
  });

  it("applies the same rule to a transmission, a transfer case and a trim", () => {
    for (const [facet, fitmentKey] of [
      ["transmission", "transmissions"],
      ["transferCase", "transferCases"],
      ["trim", "trims"],
    ] as const) {
      expect(
        schema.safeParse(
          vinCodeEntry({
            fitment: { gens: ["gen3"], [fitmentKey]: ["test-id"] },
            decodesTo: { [facet]: "test-id" },
          })
        ).success,
        facet
      ).toBe(true);
      expect(
        issuePaths(
          schema.safeParse(vinCodeEntry({ decodesTo: { [facet]: "test-id" } }))
        ),
        facet
      ).toContain(`decodesTo.${facet}`);
    }
  });

  it("applies it to drive too", () => {
    expect(
      schema.safeParse(
        vinCodeEntry({
          fitment: { gens: ["gen3"], drive: ["4wd"] },
          decodesTo: { drive: "4wd" },
        })
      ).success
    ).toBe(true);
    expect(
      issuePaths(
        schema.safeParse(vinCodeEntry({ decodesTo: { drive: "4wd" } }))
      )
    ).toContain("decodesTo.drive");
  });

  it("rejects a drive value outside the closed vocabulary", () => {
    expect(
      schema.safeParse(
        vinCodeEntry({
          fitment: { gens: ["gen3"], drive: ["awd"] },
          decodesTo: { drive: "awd" },
        })
      ).success
    ).toBe(false);
  });

  it("does NOT membership-test the generation — containment is the resolver's", () => {
    // `gen2-5` declares `parentGeneration: "gen2"`, so a row scoped to `gen2`
    // and decoding to `gen2-5` is correct, and a literal `includes` here would
    // reject it. The enum still catches a misspelling (below).
    expect(
      schema.safeParse(
        vinCodeEntry({
          fitment: { gens: ["gen2"] },
          decodesTo: { generation: "gen2-5" },
        })
      ).success
    ).toBe(true);
  });

  it("RECORDS THE RESIDUAL: an unrelated generation is accepted today", () => {
    // T208 review, F4. Dropping the membership test to protect the `gen2-5` ⊂
    // `gen2` case also lets this nonsense through — a row scoped to `gen1` that
    // decodes to `gen4`. The honest rule is containment-aware membership, which
    // needs `expandGenerationIds` and therefore the taxonomy, so it belongs in
    // the FIT-02 build layer beside `validateEntryFitments`, not in this
    // module. Asserting `true` is not an endorsement: it is the hole, pinned,
    // so the day it is closed this line has to be rewritten deliberately.
    expect(
      schema.safeParse(
        vinCodeEntry({
          fitment: { gens: ["gen1"] },
          decodesTo: { generation: "gen4" },
        })
      ).success
    ).toBe(true);
  });

  it("still rejects a generation that is not a generation", () => {
    expect(
      issuePaths(
        schema.safeParse(vinCodeEntry({ decodesTo: { generation: "gen9" } }))
      )
    ).toContain("decodesTo.generation");
  });

  it("requires ids in the taxonomy's kebab-case, not the code or the name", () => {
    expect(
      schema.safeParse(
        vinCodeEntry({
          fitment: { gens: ["gen3"], engines: ["6G74"] },
          decodesTo: { engine: "6G74" },
        })
      ).success
    ).toBe(false);
  });

  it("rejects an empty decoding and an unknown facet", () => {
    expect(schema.safeParse(vinCodeEntry({ decodesTo: {} })).success).toBe(
      false
    );
    expect(
      schema.safeParse(vinCodeEntry({ decodesTo: { colour: "red" } })).success
    ).toBe(false);
  });

  describe("model years — the cipher repeats every thirty years", () => {
    const yearRow = (
      modelYear: number,
      years?: Record<string, number>
    ): Record<string, unknown> =>
      vinCodeEntry({
        positions: { from: 10 },
        code: "2",
        system: "general",
        fitment: years ? { gens: ["gen3"], years } : { gens: ["gen3"] },
        decodesTo: { modelYear },
      });

    it("accepts a year inside the row's own window", () => {
      expect(
        schema.safeParse(yearRow(2002, { from: 2001, to: 2006 })).success
      ).toBe(true);
    });

    it("REJECTS a year the window does not contain", () => {
      const outcome = schema.safeParse(yearRow(1972, { from: 2001, to: 2006 }));
      expect(issuePaths(outcome)).toContain("decodesTo.modelYear");
      expect(JSON.stringify(outcome)).toMatch(/repeats every thirty years/);
    });

    it("REJECTS a decoded year with no window at all", () => {
      expect(issuePaths(schema.safeParse(yearRow(2002)))).toContain(
        "decodesTo.modelYear"
      );
    });

    it("rejects a year outside anything the Montero was built in", () => {
      expect(
        schema.safeParse(yearRow(2032, { from: 2001, to: 2040 })).success
      ).toBe(false);
    });
  });
});

/**
 * The T207 review residual, closed here (T208).
 *
 * `assertNoFieldCollisions` had unit tests, but the **call** at the bottom of
 * `reference.ts` — the one that runs it against the real
 * `REFERENCE_KIND_SHAPES` — had none: delete that statement and every test in
 * this file stayed green, while the guard silently stopped guarding anything.
 * T208 is the first task to add kinds, so it is the task that owes the pin.
 *
 * Observing a call a module makes to itself is not possible under ESM, which is
 * why the guard now lives in `./reference-kind-collisions` — a seam whose only
 * purpose is to be substitutable. Both tests below go red if the call is
 * deleted, commented out, moved behind a condition that is false, or wrapped in
 * a `try`.
 */
describe("the collision guard is CALLED, not merely defined", () => {
  afterEach(() => {
    vi.doUnmock("./reference-kind-collisions");
    vi.resetModules();
  });

  it("runs the guard against the real shapes when the module loads", async () => {
    vi.resetModules();
    const spy = vi.fn();
    vi.doMock("./reference-kind-collisions", () => ({
      assertNoFieldCollisions: spy,
    }));

    const module = await import("./reference");

    expect(spy).toHaveBeenCalledTimes(1);
    // Identity, not shape: the guard must see the shapes the schema is built
    // from, not a copy that could drift from them.
    expect(spy.mock.calls[0]?.[0]).toBe(module.REFERENCE_KIND_SHAPES);
  });

  it("does not swallow the guard's failure — a collision fails the import", async () => {
    vi.resetModules();
    vi.doMock("./reference-kind-collisions", () => ({
      assertNoFieldCollisions: () => {
        throw new Error("TEST sentinel collision");
      },
    }));

    await expect(import("./reference")).rejects.toThrow(
      /TEST sentinel collision/
    );
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

/* -------------------------------------------------------------------------
 * T208 audit follow-up — the independent `[TEST]` back-fill (T901 ledger)
 *
 * Everything above this line was written by the agent that wrote
 * `src/schemas/reference.ts`. Everything below it was written by a separate
 * `test-writer` pass that read only `specs/001-foundation/spec.md`, the T207
 * and T208 tasks.md lines, and the schema module's own stated rules — the
 * AGENTS.md separation the T901 audit found unmet for this surface.
 *
 * Three findings, in the order the audit numbered them. Two of the three are
 * *coverage* gaps: the behaviour is correct today and the existing graders
 * cannot tell. They are green here and their value is the mutation battery
 * recorded on the branch, not a red run. The third (F3) is a live defect, so
 * its graders carry `it.fails` — one marker line per test, deleted by the
 * implementer as each is fixed.
 *
 * refs specs/001-foundation (REF-01, REF-02)
 * ---------------------------------------------------------------------- */

describe("F1 — the excluded-letter list is pinned, not derived from itself", () => {
  /*
   * The grader above (`it.each([...VIN_EXCLUDED_LETTERS])`) reads its own
   * table out of the constant it exists to grade. Drop `"O"` from
   * `VIN_EXCLUDED_LETTERS` and that suite does not go red — it goes *shorter*,
   * silently, from three cases to two, and a green run reports the same word
   * either way. The literal below is the whole point: ISO 3779's excluded set
   * is a fact about the standard, not about this repo's source file, so it is
   * written out by hand and only changes when someone decides to change it.
   */
  it.each(["I", "O", "Q"])(
    "REJECTS the literal letter %s in a VIN code (hard-coded, not spread)",
    (letter) => {
      const outcome = schema.safeParse(vinCodeEntry({ code: letter }));
      expect(issuePaths(outcome)).toContain("code");
      expect(JSON.stringify(outcome)).toMatch(/ISO 3779/);
    }
  );

  it("pins VIN_EXCLUDED_LETTERS itself — the constant, not its consequences", () => {
    expect([...VIN_EXCLUDED_LETTERS]).toEqual(["I", "O", "Q"]);
  });

  /*
   * Positive control for the rule as a whole: the check rejects three letters,
   * not "letters". `0` and `1` are here on purpose — they are the two
   * characters ISO 3779 excludes `O` and `I` *for*, and a rule that confused
   * the pair with the pair it protects would fail here rather than in content.
   */
  it.each(["N", "S", "Z", "0", "1"])(
    "still accepts %s, which a VIN does contain",
    (code) => {
      expect(schema.safeParse(vinCodeEntry({ code })).success, code).toBe(true);
    }
  );
});

describe("F2 — the 17-position ceiling, with no section bound masking it", () => {
  /*
   * `vinPositionsSchema.max(VIN_LENGTH)` is the only defence in exactly two
   * places, and the existing graders exercise neither:
   *
   * - **`vin-code`** has no `checkVinPositionSection` at all (it carries no
   *   `encodes`), by design — a code row is scoped by its own `positions`.
   * - **`vin-position` with `encodes: "check-digit"`** is bounded by no
   *   section on purpose (`VIN_FIELD_SECTIONS["check-digit"] === null`, so
   *   markets that place it differently are writable).
   *
   * "REJECTS a position outside the 17-character VIN" above uses the default
   * `serial` fixture, whose section (12–17) rejects `18` and `1–71` on its
   * own. Loosen `.max(VIN_LENGTH)` to `.max(99)` and that test stays green.
   * These do not: every fixture below is one the section rule cannot see.
   */
  it("REJECTS a vin-code read from position 18 — nothing else bounds it", () => {
    const outcome = schema.safeParse(vinCodeEntry({ positions: { from: 18 } }));
    expect(issuePaths(outcome)).toContain("positions.from");
    expect(issueCodes(outcome)).toContain("too_big");
  });

  it("REJECTS a vin-code range wholly past the end of the VIN (20–25)", () => {
    // The code is six characters so the position-fill rule is satisfied: if
    // the ceiling goes, nothing at all is left to reject this row.
    const outcome = schema.safeParse(
      vinCodeEntry({ positions: { from: 20, to: 25 }, code: "ZZZZZZ" })
    );
    expect(issuePaths(outcome)).toContain("positions.from");
    expect(issuePaths(outcome)).toContain("positions.to");
    expect(issueCodes(outcome)).toContain("too_big");
  });

  it("REJECTS a check-digit row at position 18 — the section bound is null", () => {
    const outcome = schema.safeParse(
      vinPositionEntry({ encodes: "check-digit", positions: { from: 18 } })
    );
    expect(issuePaths(outcome)).toContain("positions.from");
    expect(issueCodes(outcome)).toContain("too_big");
    // For the right reason: `check-digit` is deliberately unplaced, so this
    // must NOT be the ISO-3779 section message wearing a different hat.
    expect(JSON.stringify(outcome)).not.toMatch(/is encoded in positions/);
  });

  it("accepts the same three rows at the last position that exists", () => {
    expect(
      schema.safeParse(vinCodeEntry({ positions: { from: 17 } })).success,
      "vin-code at 17"
    ).toBe(true);
    expect(
      schema.safeParse(
        vinCodeEntry({ positions: { from: 12, to: 17 }, code: "ZZZZZZ" })
      ).success,
      "vin-code 12–17"
    ).toBe(true);
    expect(
      schema.safeParse(
        vinPositionEntry({ encodes: "check-digit", positions: { from: 17 } })
      ).success,
      "check-digit at 17"
    ).toBe(true);
  });
});

describe("F3 — a decoded model year needs a window that DISAMBIGUATES it", () => {
  /*
   * The rule's own error message states the requirement: "the VIN's year
   * cipher repeats every thirty years — `2002` is also 1972 and 2032 — so a
   * row that decodes a year states the window it decodes it in". A window
   * satisfies that sentence only when it can contain exactly one of a
   * thirty-apart pair. Two things follow, and `checkDecodedMeaning` enforces
   * neither:
   *
   * 1. **Both bounds are required.** `fitment.years` has `from` and `to`
   *    independently optional (`src/schemas/entry.ts`), so `{ to: 2021 }` and
   *    `{ from: 1982 }` are both writable — and both are accepted today for
   *    `1982` *and* for `2012`, which is the exact ambiguity the rule exists
   *    to refuse. `reference.ts:1298` is the branch that does it.
   * 2. **The window must be narrower than the cipher.** A closed window still
   *    fails to disambiguate once `to - from >= 30`; and
   *    `PRODUCTION_YEAR_RANGE` is 1982–2021, thirty-nine years, so "the whole
   *    production run" is a window a content author can plausibly write and
   *    that decodes nothing.
   *
   * Correct rule, derived from the message above and REF-02's intent: when
   * `decodesTo.modelYear` is stated, `fitment.years` states BOTH `from` and
   * `to`, and `to - from < 30`.
   *
   * The `it.fails` lines below are the current defect, pinned. The three
   * unmarked tests are the positive controls and pass today and after.
   */
  const yearRow = (
    modelYear: number,
    years?: Record<string, number>
  ): Record<string, unknown> =>
    vinCodeEntry({
      positions: { from: 10 },
      code: "2",
      system: "general",
      fitment: years ? { gens: ["gen3"], years } : { gens: ["gen3"] },
      decodesTo: { modelYear },
    });

  const rejects = (entry: Record<string, unknown>): void => {
    const outcome = schema.safeParse(entry);
    expect(issuePaths(outcome)).toContain("decodesTo.modelYear");
    expect(JSON.stringify(outcome)).toMatch(/thirty years/);
  };

  it.fails("REJECTS a half-open `{ to: 2021 }` window decoding 1982", () => {
    rejects(yearRow(1982, { to: 2021 }));
  });

  it.fails("REJECTS the same `{ to: 2021 }` window decoding 2012", () => {
    // Paired with the case above on purpose: one window, two readings thirty
    // years apart, both accepted — the window disambiguates nothing.
    rejects(yearRow(2012, { to: 2021 }));
  });

  it.fails(
    "REJECTS an open-ended `{ from: 1982 }` window decoding 1982",
    () => {
      rejects(yearRow(1982, { from: 1982 }));
    }
  );

  it.fails("REJECTS the same `{ from: 1982 }` window decoding 2012", () => {
    rejects(yearRow(2012, { from: 1982 }));
  });

  it.fails("REJECTS the whole production run as a window (1982–2021)", () => {
    // Thirty-nine years. Closed, in range, and still holds 1982 and 2012.
    rejects(yearRow(2002, { from: 1982, to: 2021 }));
  });

  it.fails("REJECTS a window exactly as wide as the cipher (1990–2020)", () => {
    // The boundary: `to - from === 30` holds both 1990 and 2020.
    rejects(yearRow(1990, { from: 1990, to: 2020 }));
  });

  it("accepts the widest window that still disambiguates (1990–2019)", () => {
    // `to - from === 29`: no two years in it are thirty apart. This is the
    // positive control for the width rule — it must not drift to `<= 29`
    // years of span or the rule starts refusing correct content.
    expect(
      schema.safeParse(yearRow(2002, { from: 1990, to: 2019 })).success
    ).toBe(true);
  });

  it("accepts a normal, real-shaped closed window (2001–2006)", () => {
    expect(
      schema.safeParse(yearRow(2002, { from: 2001, to: 2006 })).success
    ).toBe(true);
  });

  it("keeps rejecting a year a well-formed window does not contain", () => {
    // Positive control in the other direction: the containment half of the
    // rule must survive whatever fixes the width and both-bounds halves.
    rejects(yearRow(2012, { from: 2001, to: 2006 }));
  });
});
