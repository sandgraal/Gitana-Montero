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
import { issuePaths } from "../../tests/helpers/schema-outcome.ts";
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
