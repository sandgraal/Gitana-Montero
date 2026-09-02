/**
 * Implementation-side unit tests for the `parts` collection schema (T501).
 *
 * What this schema alone can decide, within one entry: is the part number
 * well-formed, does a supersession pointer look like an entry id rather than a
 * number, are the cross-reference handles unique, does a "known-bad" verdict
 * carry the evidence PRT-01 asks for, and can an author demote a brake part
 * out of the safety notice.
 *
 * Cross-entry questions — is this OEM number unique (PRT-03), does the
 * pointer resolve, does the chain terminate — belong to `src/lib/parts/` and
 * are graded in `tests/lib/parts/parts-graph.test.ts`. The "is this figure
 * cited at all" gate is `check:citations` and is graded in
 * `tests/check-citations.test.ts`.
 *
 * Every fixture is synthetic in the same sense as
 * `tests/fixtures/schema-fixtures.ts`: `.invalid` URLs, `test-`-prefixed ids,
 * and part numbers in the reserved `TEST-` namespace. AGENTS.md treats an
 * invented part number as the highest-consequence hallucination in this
 * domain, and a plausible-looking Mitsubishi number in a fixture is exactly
 * the thing that leaks into content later. **Nothing here is a real part
 * number.**
 *
 * refs specs/001-foundation (PRT-01, PRT-02, PRT-03)
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { issuePaths } from "../../tests/helpers/schema-outcome.ts";
import {
  CROSS_REFERENCE_QUALITY,
  PART_NUMBER_MAX_LENGTH,
  checkPartsEntry,
  normalizePartNumber,
  partsProse,
  partsSchema,
  partsShared,
} from "./parts";
import { defineEntrySchema } from "./entry";

function source() {
  return {
    title: "TEST fixture source — not a real document",
    url: "https://example.invalid/t501/source",
    archiveUrl:
      "https://web.archive.org/web/20260101000000/" +
      "https://example.invalid/t501/source",
    accessed: "2026-09-01",
    kind: "vendor",
  };
}

interface TestPart {
  [field: string]: unknown;
}

/** A minimal, valid parts entry. Overrides are shallow-merged. */
function makePart(overrides: TestPart = {}): TestPart {
  return {
    id: "test-parts-alpha",
    fitment: { gens: ["gen3"] },
    oemNumber: "TEST-A0001",
    system: "engine",
    confidence: "community-consensus",
    sources: [source()],
    prose: {
      en: { title: "TEST fixture part", summary: "Synthetic T501 fixture." },
      es: {
        title: "Repuesto de prueba TEST",
        summary: "Ficha sintética de T501.",
      },
    },
    ...overrides,
  };
}

/** The issues `checkPartsEntry` alone reports, without the base envelope. */
function refineIssues(entry: unknown): { path: string; message: string }[] {
  const collected: { path: string; message: string }[] = [];
  checkPartsEntry(entry, {
    addIssue(issue) {
      collected.push({
        path: issue.path.map(String).join("."),
        message: issue.message,
      });
    },
  });
  return collected;
}

describe("the parts entry envelope", () => {
  it("accepts a minimal, well-formed part", () => {
    expect(partsSchema.safeParse(makePart()).success).toBe(true);
  });

  it("requires the OEM number — a part with no number is not a part", () => {
    const entry = makePart();
    delete entry.oemNumber;
    expect(issuePaths(partsSchema.safeParse(entry))).toContain("oemNumber");
  });

  it("requires both prose locales (I18N-06)", () => {
    const entry = makePart({
      prose: {
        en: { title: "TEST fixture part", summary: "Synthetic T501 fixture." },
      },
    });
    expect(issuePaths(partsSchema.safeParse(entry))).toContain("prose.es");
  });

  it("names an unknown field instead of stripping it (SCF-04)", () => {
    const outcome = partsSchema.safeParse(makePart({ priceBand: "cheap" }));
    expect(outcome.success).toBe(false);
  });
});

describe("part numbers", () => {
  it.each([
    ["md976075", "lowercase would be a second row for one part"],
    ["TEST A0001", "a space is never inside a catalogue number"],
    ["TEST-", "a trailing hyphen separates nothing"],
    ["TEST--A", "an empty group between hyphens"],
    ["", "blank"],
  ])("rejects `%s` (%s)", (oemNumber) => {
    expect(
      issuePaths(partsSchema.safeParse(makePart({ oemNumber })))
    ).toContain("oemNumber");
  });

  it.each(["TESTA0001", "TEST-A0001", "TEST-A-0001", "1234TEST"])(
    "accepts `%s`",
    (oemNumber) => {
      expect(partsSchema.safeParse(makePart({ oemNumber })).success).toBe(true);
    }
  );

  it("caps the length, so a description cannot be stored as a number", () => {
    const tooLong = "T".repeat(PART_NUMBER_MAX_LENGTH + 1);
    expect(
      issuePaths(partsSchema.safeParse(makePart({ oemNumber: tooLong })))
    ).toContain("oemNumber");
  });

  it("treats a hyphen as punctuation when comparing, never when storing", () => {
    expect(normalizePartNumber("TEST-A0001")).toBe("TESTA0001");
    expect(normalizePartNumber("TESTA0001")).toBe("TESTA0001");
    // The stored value is untouched — comparison is the only consumer.
    const entry = makePart({ oemNumber: "TEST-A0001" });
    const outcome = partsSchema.safeParse(entry);
    expect(outcome.success && outcome.data.oemNumber).toBe("TEST-A0001");
  });
});

describe("supersession pointers (PRT-02)", () => {
  it("accepts an entry-id-shaped pointer", () => {
    expect(
      partsSchema.safeParse(makePart({ supersededBy: "test-parts-beta" }))
        .success
    ).toBe(true);
  });

  it("rejects a part number in the pointer — the likeliest mistake", () => {
    const outcome = partsSchema.safeParse(
      makePart({ supersededBy: "TEST-A0002" })
    );
    expect(issuePaths(outcome)).toContain("supersededBy");
  });

  it("rejects a part that supersedes itself", () => {
    const issues = refineIssues(
      makePart({ id: "test-parts-alpha", supersededBy: "test-parts-alpha" })
    );
    expect(issues.map((issue) => issue.path)).toContain("supersededBy");
  });

  it("treats an absent pointer as `this is the current number`", () => {
    const entry = makePart();
    expect("supersededBy" in entry).toBe(false);
    expect(partsSchema.safeParse(entry).success).toBe(true);
  });
});

/**
 * PR #75, r3910083246. The cross-reference dedup key used a NUL (U+0000) as
 * its brand/number delimiter — the standard guaranteed-safe-separator trick,
 * and a correct one — but it went into the source as a **raw byte** rather
 * than an escape sequence. It was therefore invisible in every editor and
 * every diff, and neither Prettier nor ESLint objected; it survived a full
 * review round and two rebases unnoticed.
 *
 * The key is a nested map now, so there is no delimiter to get wrong. These
 * two pin both halves: the shape cannot conflate two distinct pairs, and the
 * source cannot carry an invisible control character again.
 */
describe("the cross-reference pair key (PR #75, r3910083246)", () => {
  const OWNED = [
    "./parts.ts",
    "../lib/parts/index.ts",
    "../lib/parts/filter.ts",
    "../lib/parts/part-numbers.ts",
    "../integrations/validate-parts.ts",
  ];

  it.each(OWNED)(
    "keeps %s free of invisible control characters",
    (relative) => {
      const source = readFileSync(
        fileURLToPath(new URL(relative, import.meta.url)),
        "utf8"
      );
      // NUL and the C0 range, minus tab/newline/carriage return.
      // eslint-disable-next-line no-control-regex
      expect(source).not.toMatch(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/);
    }
  );

  it("does not conflate two pairs that differ only at the brand/number boundary", () => {
    const issues = refineIssues(
      makePart({
        crossReferences: [
          {
            ref: "a",
            brand: "TESTBRAND",
            partNumber: "X1",
            quality: "equivalent",
          },
          {
            ref: "b",
            brand: "TESTBRANDX",
            partNumber: "1",
            quality: "equivalent",
          },
        ],
      })
    );
    // Two different brands, two different numbers, two legitimate rows. A key
    // built by joining the halves with a character either half may contain
    // would report these as duplicates of each other.
    expect(issues).toEqual([]);
  });

  it("still catches a genuine duplicate pair", () => {
    const issues = refineIssues(
      makePart({
        crossReferences: [
          {
            ref: "a",
            brand: "TESTBRAND",
            partNumber: "TEST-X0001",
            quality: "equivalent",
          },
          {
            ref: "b",
            brand: "testbrand",
            partNumber: "TESTX0001",
            quality: "equivalent",
          },
        ],
      })
    );
    // Same brand modulo case, same number modulo hyphens.
    expect(issues.map((issue) => issue.path)).toContain("crossReferences.1");
  });
});

describe("aftermarket cross-references (PRT-01)", () => {
  function crossReference(overrides: Record<string, unknown> = {}) {
    return {
      ref: "testbrand-x1",
      brand: "TESTBRAND",
      partNumber: "TEST-X0001",
      quality: "equivalent",
      ...overrides,
    };
  }

  it("accepts a well-formed cross-reference", () => {
    expect(
      partsSchema.safeParse(makePart({ crossReferences: [crossReference()] }))
        .success
    ).toBe(true);
  });

  it("offers every verdict in the closed vocabulary and nothing else", () => {
    for (const quality of CROSS_REFERENCE_QUALITY) {
      const entry = makePart({
        crossReferences: [crossReference({ quality })],
        prose: {
          en: {
            title: "TEST fixture part",
            summary: "Synthetic T501 fixture.",
            crossReferenceNotes: { "testbrand-x1": "TEST note." },
          },
          es: {
            title: "Repuesto de prueba TEST",
            summary: "Ficha sintética de T501.",
            crossReferenceNotes: { "testbrand-x1": "Nota TEST." },
          },
        },
      });
      expect(partsSchema.safeParse(entry).success, quality).toBe(true);
    }

    expect(
      partsSchema.safeParse(
        makePart({ crossReferences: [crossReference({ quality: "great" })] })
      ).success
    ).toBe(false);
  });

  it("rejects two cross-references sharing one `ref`", () => {
    const issues = refineIssues(
      makePart({
        crossReferences: [
          crossReference(),
          crossReference({ partNumber: "TEST-X0002" }),
        ],
      })
    );
    expect(issues.map((issue) => issue.path)).toContain(
      "crossReferences.1.ref"
    );
  });

  it("rejects the same brand and number listed twice", () => {
    const issues = refineIssues(
      makePart({
        crossReferences: [
          crossReference(),
          crossReference({ ref: "testbrand-x1-again" }),
        ],
      })
    );
    expect(issues.map((issue) => issue.path)).toContain("crossReferences.1");
  });

  it("rejects a cross-reference to the entry's own number, hyphens ignored", () => {
    const issues = refineIssues(
      makePart({
        oemNumber: "TEST-A0001",
        crossReferences: [crossReference({ partNumber: "TESTA0001" })],
      })
    );
    expect(issues.map((issue) => issue.path)).toContain(
      "crossReferences.0.partNumber"
    );
  });

  it("rejects a note keyed to no cross-reference", () => {
    const issues = refineIssues(
      makePart({
        crossReferences: [crossReference()],
        prose: {
          en: {
            title: "TEST fixture part",
            summary: "Synthetic T501 fixture.",
            crossReferenceNotes: { "testbrand-x9": "TEST note." },
          },
          es: { title: "Repuesto TEST", summary: "Ficha TEST." },
        },
      })
    );
    expect(issues.map((issue) => issue.path)).toContain(
      "prose.en.crossReferenceNotes.testbrand-x9"
    );
  });
});

describe("known-bad brands carry evidence (PRT-01)", () => {
  const avoided = {
    ref: "testbrand-bad",
    brand: "TESTBRAND",
    partNumber: "TEST-X0009",
    quality: "avoid",
  };

  it("requires a note in both locales", () => {
    const issues = refineIssues(
      makePart({
        crossReferences: [avoided],
        prose: {
          en: {
            title: "TEST fixture part",
            summary: "Synthetic T501 fixture.",
            crossReferenceNotes: { "testbrand-bad": "TEST failure report." },
          },
          es: { title: "Repuesto TEST", summary: "Ficha TEST." },
        },
      })
    );
    expect(issues.map((issue) => issue.path)).toContain(
      "prose.es.crossReferenceNotes.testbrand-bad"
    );
    expect(issues.map((issue) => issue.path)).not.toContain(
      "prose.en.crossReferenceNotes.testbrand-bad"
    );
  });

  it("requires at least one source — naming a brand as bad is a claim", () => {
    const issues = refineIssues(
      makePart({
        crossReferences: [avoided],
        confidence: "anecdotal",
        sources: [],
        prose: {
          en: {
            title: "TEST fixture part",
            summary: "Synthetic T501 fixture.",
            crossReferenceNotes: { "testbrand-bad": "TEST failure report." },
          },
          es: {
            title: "Repuesto TEST",
            summary: "Ficha TEST.",
            crossReferenceNotes: { "testbrand-bad": "Reporte TEST." },
          },
        },
      })
    );
    expect(issues.map((issue) => issue.path)).toContain("sources");
  });

  it("asks nothing extra of the other three verdicts", () => {
    const issues = refineIssues(
      makePart({
        confidence: "anecdotal",
        sources: [],
        crossReferences: [{ ...avoided, quality: "lower-grade" }],
      })
    );
    expect(issues).toEqual([]);
  });
});

describe("the safety flag promotes and never demotes", () => {
  it("refuses `safetyCritical: false` on a safety-critical system", () => {
    const issues = refineIssues(
      makePart({ system: "brakes", safetyCritical: false })
    );
    expect(issues.map((issue) => issue.path)).toContain("safetyCritical");
  });

  it("allows `safetyCritical: true` on a system the list does not catch", () => {
    expect(
      partsSchema.safeParse(
        makePart({ system: "electrical", safetyCritical: true })
      ).success
    ).toBe(true);
  });
});

describe("vendors", () => {
  it("rejects the same vendor listed twice", () => {
    const issues = refineIssues(
      makePart({ vendors: ["test-shop-one", "test-shop-one"] })
    );
    expect(issues.map((issue) => issue.path)).toContain("vendors.1");
  });

  it("rejects a vendor id that is shaped like a part number", () => {
    expect(
      issuePaths(partsSchema.safeParse(makePart({ vendors: ["TEST-SHOP"] })))
    ).toContain("vendors.0");
  });
});

describe("the data/prose split (AGENTS.md)", () => {
  it("builds cleanly from the shapes this module actually ships", () => {
    expect(() => defineEntrySchema(partsShared, partsProse)).not.toThrow();
  });

  it("refuses the figure if anyone ever moves it into prose", () => {
    // The numeric-prose guard, probed with *this collection's own* figure:
    // `quantityPerVehicle` is legal in shared data and a build-time throw in
    // prose, before any content is parsed (AGENTS.md, T106-review note on the
    // T501 line).
    expect(() =>
      defineEntrySchema(partsShared, {
        ...partsProse,
        quantityPerVehicle: partsShared.quantityPerVehicle,
      })
    ).toThrow(/numbers are never translated/);
  });

  it("puts the one figure in shared data, where check:citations walks it", () => {
    const outcome = partsSchema.safeParse(makePart({ quantityPerVehicle: 6 }));
    expect(outcome.success && outcome.data.quantityPerVehicle).toBe(6);
  });

  it("refuses a quantity that is not a whole positive count", () => {
    for (const quantityPerVehicle of [0, -1, 1.5]) {
      expect(
        issuePaths(partsSchema.safeParse(makePart({ quantityPerVehicle })))
      ).toContain("quantityPerVehicle");
    }
  });
});
