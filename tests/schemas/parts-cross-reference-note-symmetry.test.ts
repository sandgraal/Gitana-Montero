/**
 * Cross-reference quality notes ship in both locales or in neither
 * (T501 audit follow-up, F1).
 *
 * ## The gap this file grades
 *
 * `src/schemas/parts.ts`' `checkAvoidRowsCarryEvidence` requires a bilingual
 * note **only for `avoid` rows**, because that is where PRT-01's "known-bad
 * brands *with evidence*" lives. That rule is right and stays. What nothing
 * checks is the other three verdicts: an `oem-supplier`, `equivalent` or
 * `lower-grade` row may today carry a `crossReferenceNotes` entry in `en` and
 * nothing in `es` (or the reverse), and the entry parses clean. The ES reader
 * then gets an empty cell in the "What we know" column of the cross-reference
 * table — a *silently* shorter page in one language.
 *
 * AGENTS.md draws no exception for "only part of the page": *no page ships in
 * one language, both or neither*. `defineEntrySchema` enforces that for
 * `title`/`summary`; `crossReferenceNotes` is the one per-locale field on this
 * collection that escaped it, and the escape is quality-shaped rather than
 * field-shaped, which is why no locale grader saw it.
 *
 * ## The rule these graders encode
 *
 * Two rules, not one — they differ in whether a note is *required*:
 *
 *  1. **`avoid`** — a non-blank note is REQUIRED in every locale the entry
 *     declares. Already implemented; the positive controls below keep it
 *     working and this file must not weaken it.
 *  2. **`oem-supplier` / `equivalent` / `lower-grade`** — a note is OPTIONAL,
 *     but **symmetric**: if any declared locale carries a non-blank note for a
 *     `ref`, every declared locale must carry one for that same `ref`.
 *
 * Both-or-neither, per `ref`. The `it.fails` markers below are the second
 * rule; delete one marker per test as the schema starts enforcing it.
 *
 * Every fixture is synthetic in `tests/fixtures/schema-fixtures.ts`' sense —
 * `.invalid` URLs, `test-` ids, `TEST-`-namespaced part numbers. AGENTS.md
 * treats an invented part number as the highest-consequence hallucination in
 * this domain, and a plausible one in a fixture is how it leaks into content.
 *
 * refs specs/001-foundation (PRT-01, I18N-06)
 */
import { describe, expect, it } from "vitest";
import {
  CROSS_REFERENCE_QUALITY,
  CROSS_REFERENCE_QUALITY_AVOID,
  checkPartsEntry,
  type CrossReferenceQuality,
} from "../../src/schemas/parts.ts";

type Locale = "en" | "es";

const LOCALES: readonly Locale[] = ["en", "es"];

/** The three verdicts whose note is optional-but-symmetric (rule 2 above). */
const OPTIONAL_NOTE_QUALITIES = CROSS_REFERENCE_QUALITY.filter(
  (quality) => quality !== CROSS_REFERENCE_QUALITY_AVOID
);

const REF = "testbrand-x1";

function source() {
  return {
    title: "TEST fixture source — not a real document",
    url: "https://example.invalid/t501-audit/source",
    archiveUrl:
      "https://web.archive.org/web/20260101000000/" +
      "https://example.invalid/t501-audit/source",
    accessed: "2026-09-01",
    kind: "vendor",
  };
}

const NOTES: Record<Locale, string> = {
  en: "TEST note — synthetic, says what we know about this brand.",
  es: "Nota TEST — sintética, dice lo que sabemos de esta marca.",
};

const TITLES: Record<Locale, { title: string; summary: string }> = {
  en: { title: "TEST fixture part", summary: "Synthetic T501-audit fixture." },
  es: {
    title: "Repuesto de prueba TEST",
    summary: "Ficha sintética de la auditoría de T501.",
  },
};

/**
 * A parts entry with one cross-reference at `quality`, whose note is present
 * in exactly the locales in `noteIn`.
 */
function partWithNoteIn(
  quality: CrossReferenceQuality,
  noteIn: readonly Locale[]
): Record<string, unknown> {
  return {
    id: "test-parts-symmetry",
    fitment: { gens: ["gen3"] },
    oemNumber: "TEST-A0001",
    system: "engine",
    confidence: "community-consensus",
    sources: [source()],
    crossReferences: [
      {
        ref: REF,
        brand: "TESTBRAND",
        partNumber: "TEST-X0001",
        quality,
      },
    ],
    prose: Object.fromEntries(
      LOCALES.map((locale) => [
        locale,
        {
          ...TITLES[locale],
          ...(noteIn.includes(locale)
            ? { crossReferenceNotes: { [REF]: NOTES[locale] } }
            : {}),
        },
      ])
    ),
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

/**
 * Asserts that a note present only in `presentIn` is reported against the
 * *other* locale, and that the message **names that locale** — per
 * `.claude/GRADER-PRINCIPLES.md`, "rejected for the stated reason", not just
 * "it threw". A rejection an author cannot act on sends them reading the
 * schema instead of writing the missing sentence.
 */
function expectAsymmetryReported(
  quality: CrossReferenceQuality,
  presentIn: Locale
): void {
  const missing = presentIn === "en" ? "es" : "en";
  const issues = refineIssues(partWithNoteIn(quality, [presentIn]));
  const paths = issues.map((issue) => issue.path);

  expect(paths).toContain(`prose.${missing}.crossReferenceNotes.${REF}`);
  // Never reported against the locale that did its job.
  expect(paths).not.toContain(`prose.${presentIn}.crossReferenceNotes.${REF}`);

  const reported = issues.find(
    (issue) => issue.path === `prose.${missing}.crossReferenceNotes.${REF}`
  );
  expect(reported?.message).toContain(missing);
}

/* -------------------------------------------------------------------------
 * The gap (F1) — six markers, one per case. Delete the marker on a test as
 * the schema starts enforcing that case.
 * ---------------------------------------------------------------------- */

describe("a quality note ships in both locales or in neither (F1)", () => {
  it.fails("rejects a `lower-grade` note written only in en", () => {
    expectAsymmetryReported("lower-grade", "en");
  });

  it.fails("rejects a `lower-grade` note written only in es", () => {
    expectAsymmetryReported("lower-grade", "es");
  });

  it.fails("rejects an `oem-supplier` note written only in en", () => {
    expectAsymmetryReported("oem-supplier", "en");
  });

  it.fails("rejects an `oem-supplier` note written only in es", () => {
    expectAsymmetryReported("oem-supplier", "es");
  });

  it.fails("rejects an `equivalent` note written only in en", () => {
    expectAsymmetryReported("equivalent", "en");
  });

  it.fails("rejects an `equivalent` note written only in es", () => {
    expectAsymmetryReported("equivalent", "es");
  });
});

/* -------------------------------------------------------------------------
 * Positive controls
 *
 * Without these the rule above could ship as "reject every cross-reference
 * note" and stay green — the drift `.claude/GRADER-PRINCIPLES.md` describes,
 * where an over-strict rule flags correct content for months and then gets
 * deleted out of frustration instead of fixed.
 * ---------------------------------------------------------------------- */

describe("what a symmetric entry is still allowed to do", () => {
  it.each(CROSS_REFERENCE_QUALITY)(
    "accepts a `%s` row whose note is in both locales",
    (quality) => {
      expect(refineIssues(partWithNoteIn(quality, LOCALES))).toEqual([]);
    }
  );

  it.each(OPTIONAL_NOTE_QUALITIES)(
    "accepts a `%s` row with no note in either locale — a note is optional here",
    (quality) => {
      expect(refineIssues(partWithNoteIn(quality, []))).toEqual([]);
    }
  );
});

/* -------------------------------------------------------------------------
 * The `avoid` rule this file must not weaken
 *
 * `avoid` is stricter than symmetry: the note is *required*, so "neither
 * locale" is a violation there and a violation in both locales. These are
 * live today and must stay live after F1's fix — a fix that replaced the
 * required-note rule with a symmetry rule would silently let an unevidenced
 * "avoid Brand X" ship, which is an unsourced claim about a named business.
 * ---------------------------------------------------------------------- */

describe("`avoid` still demands the note outright (existing rule)", () => {
  it("reports the missing locale when only en carries the note", () => {
    const paths = refineIssues(
      partWithNoteIn(CROSS_REFERENCE_QUALITY_AVOID, ["en"])
    ).map((issue) => issue.path);

    expect(paths).toContain(`prose.es.crossReferenceNotes.${REF}`);
    expect(paths).not.toContain(`prose.en.crossReferenceNotes.${REF}`);
  });

  it("reports the missing locale when only es carries the note", () => {
    const paths = refineIssues(
      partWithNoteIn(CROSS_REFERENCE_QUALITY_AVOID, ["es"])
    ).map((issue) => issue.path);

    expect(paths).toContain(`prose.en.crossReferenceNotes.${REF}`);
    expect(paths).not.toContain(`prose.es.crossReferenceNotes.${REF}`);
  });

  it("reports both locales when the note is missing from both", () => {
    const paths = refineIssues(
      partWithNoteIn(CROSS_REFERENCE_QUALITY_AVOID, [])
    ).map((issue) => issue.path);

    for (const locale of LOCALES) {
      expect(paths).toContain(`prose.${locale}.crossReferenceNotes.${REF}`);
    }
  });

  it("names the locale in the message it reports", () => {
    const issues = refineIssues(
      partWithNoteIn(CROSS_REFERENCE_QUALITY_AVOID, ["en"])
    );
    const reported = issues.find(
      (issue) => issue.path === `prose.es.crossReferenceNotes.${REF}`
    );
    expect(reported?.message).toBeTypeOf("string");
    expect(reported?.message).toContain("locale");
  });
});

/* -------------------------------------------------------------------------
 * A blank note is not a note
 *
 * Whatever shape F1's fix takes, "present" has to mean "says something".
 * `nonBlankString()` already refuses `""` at the field level, but a
 * whitespace-only note reaching the symmetry rule must not count as the ES
 * half of a bilingual pair. Live for `avoid` today; the same expectation is
 * what the widened rule inherits.
 * ---------------------------------------------------------------------- */

describe("a whitespace-only note does not satisfy a locale", () => {
  it("still reports es when the ES note is only spaces (`avoid`)", () => {
    const entry = partWithNoteIn(CROSS_REFERENCE_QUALITY_AVOID, ["en", "es"]);
    const prose = entry["prose"] as Record<
      string,
      { crossReferenceNotes: Record<string, string> }
    >;
    prose["es"]!.crossReferenceNotes[REF] = "   ";

    expect(refineIssues(entry).map((issue) => issue.path)).toContain(
      `prose.es.crossReferenceNotes.${REF}`
    );
  });
});
