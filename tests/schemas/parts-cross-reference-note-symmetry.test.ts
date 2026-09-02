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
 * A locale code as a **whole word**, not as a substring.
 *
 * `message.toContain("es")` is not an assertion that a message names the ES
 * locale — it is an assertion that the message contains the letters `e` and
 * `s` adjacently, which ordinary English prose does constantly ("requires",
 * "notes", "needs"). Likewise `"en"` in "entry", "when", "evidence". A review
 * of this file proved the point by hand: a message naming *neither* locale
 * satisfied all eighteen tests (T501 review, F-A).
 *
 * `\ben\b` / `\bes\b` still matches every spelling a real message would use —
 * bare `es`, backticked `` `es` ``, parenthesised `(es)`, and the dotted
 * `prose.es` path — because none of the surrounding characters are word
 * characters. It does not match a letter pair inside an English word.
 */
function namesLocale(locale: Locale): RegExp {
  return new RegExp(`\\b${locale}\\b`);
}

/** The path an asymmetry for `ref` must be reported against. */
function notePath(locale: Locale): string {
  return `prose.${locale}.crossReferenceNotes.${REF}`;
}

/**
 * Asserts that a note present only in `presentIn` is reported against the
 * *other* locale, exactly once, and that the message **names that locale** —
 * per `.claude/GRADER-PRINCIPLES.md`, "rejected for the stated reason", not
 * just "it threw". A rejection an author cannot act on sends them reading the
 * schema instead of writing the missing sentence.
 *
 * The "exactly once" half is the module's own invariant, stated in
 * `src/schemas/parts.ts`: one mistake produces one error. A symmetry rule
 * written naively over all four qualities double-reports an `avoid` row
 * alongside `checkAvoidRowsCarryEvidence`, and a `toContain` assertion cannot
 * see that (T501 review, F-B).
 */
function expectAsymmetryReported(
  quality: CrossReferenceQuality,
  presentIn: Locale
): void {
  const missing = presentIn === "en" ? "es" : "en";
  const issues = refineIssues(partWithNoteIn(quality, [presentIn]));
  const paths = issues.map((issue) => issue.path);

  expect(paths).toContain(notePath(missing));
  // Never reported against the locale that did its job.
  expect(paths).not.toContain(notePath(presentIn));
  // One mistake, one error.
  expect(paths.filter((path) => path === notePath(missing))).toHaveLength(1);

  const reported = issues.find((issue) => issue.path === notePath(missing));
  expect(reported?.message).toMatch(namesLocale(missing));
}

/** The message reported against `missing` when only `presentIn` has the note. */
function messageFor(
  quality: CrossReferenceQuality,
  presentIn: Locale
): string | undefined {
  const missing = presentIn === "en" ? "es" : "en";
  return refineIssues(partWithNoteIn(quality, [presentIn])).find(
    (issue) => issue.path === notePath(missing)
  )?.message;
}

/* -------------------------------------------------------------------------
 * The gap (F1) — seven markers, one per case. Delete the marker on a test as
 * the schema starts enforcing that case.
 * ---------------------------------------------------------------------- */

describe("a quality note ships in both locales or in neither (F1)", () => {
  it("rejects a `lower-grade` note written only in en", () => {
    expectAsymmetryReported("lower-grade", "en");
  });

  it("rejects a `lower-grade` note written only in es", () => {
    expectAsymmetryReported("lower-grade", "es");
  });

  it("rejects an `oem-supplier` note written only in en", () => {
    expectAsymmetryReported("oem-supplier", "en");
  });

  it("rejects an `oem-supplier` note written only in es", () => {
    expectAsymmetryReported("oem-supplier", "es");
  });

  it("rejects an `equivalent` note written only in en", () => {
    expectAsymmetryReported("equivalent", "en");
  });

  it("rejects an `equivalent` note written only in es", () => {
    expectAsymmetryReported("equivalent", "es");
  });

  /*
   * The spelling-agnostic backstop for the "names the locale" requirement,
   * and the one assertion here that cannot be satisfied by prose that happens
   * to contain the right two letters (T501 review, F-A).
   *
   * The two directions are the *same* mistake mirrored, so a message that
   * names neither locale — "write the missing note", "both locales, always" —
   * is byte-for-byte identical in both. Any message that actually identifies
   * which half is missing differs. This holds whatever wording, punctuation
   * or interpolation order the fix chooses.
   */
  it("reports a different message in each direction", () => {
    const missingEs = messageFor("lower-grade", "en");
    const missingEn = messageFor("lower-grade", "es");

    expect(missingEs).toBeTypeOf("string");
    expect(missingEn).toBeTypeOf("string");
    expect(missingEs).not.toBe(missingEn);
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

    expect(paths).toContain(notePath("es"));
    expect(paths).not.toContain(notePath("en"));
  });

  it("reports the missing locale when only es carries the note", () => {
    const paths = refineIssues(
      partWithNoteIn(CROSS_REFERENCE_QUALITY_AVOID, ["es"])
    ).map((issue) => issue.path);

    expect(paths).toContain(notePath("en"));
    expect(paths).not.toContain(notePath("es"));
  });

  it("reports both locales when the note is missing from both", () => {
    const paths = refineIssues(
      partWithNoteIn(CROSS_REFERENCE_QUALITY_AVOID, [])
    ).map((issue) => issue.path);

    for (const locale of LOCALES) {
      expect(paths).toContain(notePath(locale));
    }
  });

  /*
   * One mistake, one error — `src/schemas/parts.ts`' own words, stated as a
   * module invariant on `checkAvoidRowsCarryEvidence` ("this rule reports
   * 'the note is missing' and never re-reports 'the locale is missing' …
   * one mistake should produce one error").
   *
   * Nothing enforced it. A symmetry rule written naively across all four
   * qualities fires *alongside* the avoid rule and emits two issues at one
   * path for one missing sentence; the author then gets the same complaint
   * twice, and every `toContain`-shaped assertion in this file stays green
   * (T501 review, F-B). This is the assertion that makes the invariant real,
   * and it is the one an F1 implementer should expect to see red first if
   * they take the naive route.
   */
  it.each(LOCALES)(
    "emits exactly one issue when only %s carries the note",
    (presentIn) => {
      const missing: Locale = presentIn === "en" ? "es" : "en";
      const paths = refineIssues(
        partWithNoteIn(CROSS_REFERENCE_QUALITY_AVOID, [presentIn])
      ).map((issue) => issue.path);

      expect(paths.filter((path) => path === notePath(missing))).toHaveLength(
        1
      );
    }
  );

  it("emits exactly one issue per locale when neither carries the note", () => {
    const paths = refineIssues(
      partWithNoteIn(CROSS_REFERENCE_QUALITY_AVOID, [])
    ).map((issue) => issue.path);

    for (const locale of LOCALES) {
      expect(paths.filter((path) => path === notePath(locale))).toHaveLength(1);
    }
  });

  /*
   * Deliberately *not* `toContain("locale")`, which any English sentence
   * about locales satisfies and which a generic replacement message would
   * also satisfy (T501 review, F-A, second instance).
   *
   * Note the asymmetry with F1's new rule, and why it is correct rather than
   * an oversight: this message does not name `en` or `es`, because the rule
   * is per-locale and the *path* carries the identity. F1's rule is about a
   * relationship *between* the two locales, so its message has to say which
   * one is missing. If a future round decides both should name the locale,
   * that is a one-line widening — and this assertion, not a substring match,
   * is what would have to change.
   */
  it("reports a message specific to this rule, not generic prose", () => {
    const issues = refineIssues(
      partWithNoteIn(CROSS_REFERENCE_QUALITY_AVOID, ["en"])
    );
    const reported = issues.find((issue) => issue.path === notePath("es"));

    expect(reported?.message).toBeTypeOf("string");
    // The verdict it is about, the row it is about, and the bilingual rule.
    expect(reported?.message).toContain(CROSS_REFERENCE_QUALITY_AVOID);
    expect(reported?.message).toMatch(/index 0/);
    expect(reported?.message).toMatch(/both locales/i);
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
