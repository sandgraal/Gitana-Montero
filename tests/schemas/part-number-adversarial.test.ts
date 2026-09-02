/**
 * Part numbers, probed adversarially (T501 audit follow-up, F4).
 *
 * ## Why this file exists
 *
 * `PART_NUMBER_PATTERN` is the single definition of "the same number" for
 * three consumers (`src/schemas/parts.ts`, `src/lib/parts/index.ts`,
 * `src/integrations/validate-parts.ts`), and PRT-03's whole build-failure
 * guarantee — one OEM number is one part is one page — rests on it. Its
 * existing coverage in `src/schemas/parts.test.ts` is five trivial cases: a
 * lowercase spelling, a space, a trailing hyphen, a doubled hyphen and the
 * empty string. Nothing had ever asked it about a character a reviewer
 * **cannot see**.
 *
 * That is the interesting question, because the realistic failure is not an
 * author typing `MD 976075`. It is a number pasted out of a PDF, a web
 * catalogue or a spreadsheet carrying a zero-width space, a non-breaking
 * space, a soft hyphen, a stray CR, a fullwidth digit or a Cyrillic homoglyph
 * — none of which render, all of which make a *different string*. If any of
 * those survived validation, two entries could ship claiming what a reader
 * reads as one number, PRT-03's duplicate rule would not fire (it compares
 * strings, hyphens aside), and a reader searching that number would get two
 * pages with two fitments and two supersession chains.
 *
 * The pattern is correct today — every case below is already rejected. These
 * are live, passing graders that close a blind spot rather than a defect: the
 * point is that a future loosening of `PART_NUMBER_PATTERN` (adding a `u`
 * flag and a Unicode property class, allowing whitespace, switching to a
 * `\S`-based rule) turns this file red instead of shipping silently.
 *
 * ## Relationship to the repo-wide control-character sweep
 *
 * `tests/repo-hygiene/no-control-characters.test.ts` and
 * `scripts/lib/control-char-scan.mjs` (merged as `507079b`) generalize
 * `src/schemas/parts.test.ts`' "PR #75, r3910083246" regression into a
 * repo-wide raw-byte scan of hand-authored **source files**. This file is a
 * different layer: it grades whether *content values* carrying such a
 * character are refused, and whether the corpus-level identity comparison
 * still holds if one ever got through. The intent overlaps; no code does.
 *
 * The two meet at `src/content/**`, which that scanner also walks — so a
 * control byte in a published part number is caught twice over: as a raw
 * byte by the sweep, and as an invalid value by the rules below. That is the
 * intended overlap and not duplication; they fail with different messages at
 * different times, and only this one can speak about *identity*.
 *
 * One convention is deliberately shared with that branch, because it is the
 * right one: **no control character is written into this file as a raw
 * byte.** They are built with `String.fromCharCode` from ordinary numeric
 * literals, so nothing in this source is invisible to a diff — writing the
 * bytes directly is the exact transcription hazard the whole subject is
 * about.
 *
 * Every fixture is synthetic: `test-` ids, `TEST-`-namespaced part numbers,
 * `.invalid` URLs. Nothing here is a real Mitsubishi number.
 *
 * refs specs/001-foundation (PRT-01, PRT-03)
 */
import { describe, expect, it } from "vitest";
import { issuePaths } from "../helpers/schema-outcome.ts";
import { partsSchema } from "../../src/schemas/parts.ts";
import {
  PART_NUMBER_PATTERN,
  normalizePartNumber,
} from "../../src/lib/parts/part-numbers.ts";
import {
  buildPartsIndex,
  findPartIssues,
  supersessionChain,
  type PartIdentity,
} from "../../src/lib/parts/index.ts";

/* -------------------------------------------------------------------------
 * The invisible characters, built rather than typed
 * ---------------------------------------------------------------------- */

const char = (codePoint: number): string => String.fromCharCode(codePoint);

const NUL = char(0x00);
const DEL = char(0x7f);
const TAB = char(0x09);
const LF = char(0x0a);
const CR = char(0x0d);
const ZWSP = char(0x200b); // zero-width space
const ZWNJ = char(0x200c); // zero-width non-joiner
const BOM = char(0xfeff); // zero-width no-break space / BOM
const NBSP = char(0x00a0); // non-breaking space
const SOFT_HYPHEN = char(0x00ad);
const LINE_SEPARATOR = char(0x2028);
const UNICODE_HYPHEN = char(0x2010); // U+2010, not ASCII `-`
const FULLWIDTH_ZERO = char(0xff10); // `０`, not `0`
const FULLWIDTH_A = char(0xff21); // `Ａ`, not `A`
const CYRILLIC_CAPITAL_A = char(0x0410); // `А`, not `A`
const CYRILLIC_CAPITAL_ES = char(0x0421); // `С`, not `C`
const GREEK_CAPITAL_OMICRON = char(0x039f); // `Ο`, not `O`

/** The one spelling everything below is a corrupted twin of. */
const CLEAN = "TESTA0001";

/**
 * Every adversarial spelling, as `[label, value]`.
 *
 * Grouped by *why* it is dangerous rather than by code point range: the
 * control characters and zero-width marks are invisible, the line breaks are
 * invisible-at-the-end-of-a-line, and the confusables are visible but wrong.
 * All three groups produce a string a reviewer reads as `TESTA0001`.
 */
const ADVERSARIAL: [label: string, value: string][] = [
  // C0 controls and DEL — no glyph anywhere.
  ["NUL inside", `TEST${NUL}A0001`],
  ["NUL at the end", `${CLEAN}${NUL}`],
  ["DEL at the end", `${CLEAN}${DEL}`],
  ["tab inside", `TEST${TAB}A0001`],

  // Line breaks. `$` in a non-`m` JS regex ends at end-of-input, and these
  // pin that: a pattern ported to a flavour where `$` also matches before a
  // trailing newline (Python, PCRE with `MULTILINE`) would accept these.
  ["trailing LF", `${CLEAN}${LF}`],
  ["trailing CR", `${CLEAN}${CR}`],
  ["trailing CRLF", `${CLEAN}${CR}${LF}`],
  ["leading LF", `${LF}${CLEAN}`],
  ["LF inside", `TEST${LF}A0001`],
  ["CR inside", `TEST${CR}A0001`],
  ["U+2028 line separator at the end", `${CLEAN}${LINE_SEPARATOR}`],

  // Zero-width and invisible spacing.
  ["zero-width space inside", `TEST${ZWSP}A0001`],
  ["zero-width non-joiner inside", `TEST${ZWNJ}A0001`],
  ["BOM at the start", `${BOM}${CLEAN}`],
  ["BOM at the end", `${CLEAN}${BOM}`],
  ["non-breaking space inside", `TEST${NBSP}A0001`],
  ["soft hyphen inside", `TEST${SOFT_HYPHEN}A0001`],

  // Punctuation that looks like the hyphen the pattern does allow.
  ["U+2010 hyphen instead of ASCII", `TEST${UNICODE_HYPHEN}A0001`],

  // Confusables: visible, wrong, and indistinguishable in most faces.
  ["fullwidth digit zero", `TESTA${FULLWIDTH_ZERO}001`],
  ["fullwidth letter A", `TEST${FULLWIDTH_A}0001`],
  ["Cyrillic А homoglyph", `TEST${CYRILLIC_CAPITAL_A}0001`],
  ["Cyrillic С homoglyph", `TESTA0001${CYRILLIC_CAPITAL_ES}`],
  ["Greek Ο homoglyph", `TESTA${GREEK_CAPITAL_OMICRON}001`],
];

function makePart(overrides: Record<string, unknown> = {}) {
  return {
    id: "test-parts-adversarial",
    fitment: { gens: ["gen3"] },
    oemNumber: CLEAN,
    system: "engine",
    confidence: "community-consensus",
    sources: [
      {
        title: "TEST fixture source — not a real document",
        url: "https://example.invalid/t501-audit/source",
        archiveUrl:
          "https://web.archive.org/web/20260101000000/" +
          "https://example.invalid/t501-audit/source",
        accessed: "2026-09-01",
        kind: "vendor",
      },
    ],
    prose: {
      en: {
        title: "TEST fixture part",
        summary: "Synthetic T501-audit fixture.",
      },
      es: {
        title: "Repuesto de prueba TEST",
        summary: "Ficha sintética de la auditoría de T501.",
      },
    },
    ...overrides,
  };
}

/* -------------------------------------------------------------------------
 * The fixtures are not vacuous
 *
 * Every assertion below rests on these strings being *different strings* that
 * a person reads as the same number. A transcription slip that made one of
 * them literally equal `CLEAN` would turn its rejection test into a
 * false-negative that reads green forever.
 * ---------------------------------------------------------------------- */

describe("the adversarial corpus itself", () => {
  it.each(ADVERSARIAL)(
    "`%s` is genuinely a different string",
    (_label, value) => {
      expect(value).not.toBe(CLEAN);
    }
  );

  it("the clean spelling is accepted — the control every rejection needs", () => {
    expect(PART_NUMBER_PATTERN.test(CLEAN)).toBe(true);
    expect(partsSchema.safeParse(makePart()).success).toBe(true);
  });

  it("the hyphenated clean spelling is accepted too", () => {
    expect(
      partsSchema.safeParse(makePart({ oemNumber: "TEST-A0001" })).success
    ).toBe(true);
  });
});

/* -------------------------------------------------------------------------
 * Rejection, at the pattern and through the real schema
 * ---------------------------------------------------------------------- */

describe("part numbers refuse characters a reviewer cannot see", () => {
  it.each(ADVERSARIAL)("the pattern rejects %s", (_label, value) => {
    expect(PART_NUMBER_PATTERN.test(value)).toBe(false);
  });

  it.each(ADVERSARIAL)(
    "the schema rejects %s, naming `oemNumber`",
    (_label, value) => {
      expect(
        issuePaths(partsSchema.safeParse(makePart({ oemNumber: value })))
      ).toContain("oemNumber");
    }
  );

  it.each(ADVERSARIAL)(
    "a cross-reference number is held to the same rule (%s)",
    (_label, value) => {
      expect(
        issuePaths(
          partsSchema.safeParse(
            makePart({
              crossReferences: [
                {
                  ref: "testbrand-x1",
                  brand: "TESTBRAND",
                  partNumber: value,
                  quality: "equivalent",
                },
              ],
            })
          )
        )
      ).toContain("crossReferences.0.partNumber");
    }
  );
});

/* -------------------------------------------------------------------------
 * PRT-03 — the corpus-level identity question
 *
 * > **PRT-03** IF two parts entries claim the same OEM number with conflicting
 * > fitment, THEN THE build SHALL fail.
 *
 * The rule graded here is the *end state* (`.claude/GRADER-PRINCIPLES.md`:
 * "grade the end state, not the text"), not one layer's spelling of it: two
 * entries whose numbers differ only by an invisible or confusable character
 * must not both be able to ship. There are exactly two ways the corpus can
 * make that true —
 *
 *  · the schema refuses the corrupted spelling, so the pair never exists; or
 *  · `findPartIssues` reports the pair as a duplicate identity.
 *
 * — and the guarantee is "at least one of them fires". Today it is always the
 * first, and `normalizePartNumber` collapses hyphens and nothing else, which
 * is a deliberate and documented narrowness. Asserting the *disjunction*
 * rather than either branch is what keeps this honest: it stays green if
 * somebody hardens the comparison, and it goes red the moment
 * `PART_NUMBER_PATTERN` is loosened without the comparison being hardened to
 * match — which is the only way this class of duplicate reaches a reader.
 * ---------------------------------------------------------------------- */

function part(id: string, oemNumber: string): PartIdentity {
  return { id, oemNumber, supersededBy: null, vendors: [] };
}

/** Whether the corpus rule reports these two entries as one identity. */
function corpusReportsDuplicate(a: string, b: string): boolean {
  return findPartIssues([
    part("test-parts-alpha", a),
    part("test-parts-beta", b),
  ]).some((issue) => issue.code === "duplicate-oem-number");
}

/** Whether the schema refuses this spelling outright. */
function schemaRejects(oemNumber: string): boolean {
  return !partsSchema.safeParse(makePart({ oemNumber })).success;
}

describe("two entries cannot ship one number in two invisible spellings", () => {
  it.each(ADVERSARIAL)(
    "%s is caught by the schema or reported as a duplicate identity",
    (_label, value) => {
      expect(schemaRejects(value) || corpusReportsDuplicate(CLEAN, value)).toBe(
        true
      );
    }
  );

  /*
   * The positive control for the second half of that disjunction. Without it
   * the test above could pass forever on a `corpusReportsDuplicate` that is
   * incapable of returning `true` at all — the "a test that cannot fail"
   * trap, one level down.
   */
  it("reports a genuine duplicate — the same number punctuated two ways", () => {
    expect(corpusReportsDuplicate("TEST-A0001", "TESTA0001")).toBe(true);
  });

  it("reports a genuine duplicate — the same number written identically", () => {
    expect(corpusReportsDuplicate(CLEAN, CLEAN)).toBe(true);
  });

  it("leaves two genuinely different numbers alone", () => {
    expect(corpusReportsDuplicate("TEST-A0001", "TEST-A0002")).toBe(false);
  });
});

/* -------------------------------------------------------------------------
 * `normalizePartNumber` says what it does and nothing more
 * ---------------------------------------------------------------------- */

describe("the comparison function's documented narrowness", () => {
  it("collapses hyphens", () => {
    expect(normalizePartNumber("TEST-A-0001")).toBe("TESTA0001");
  });

  it("leaves case alone — the pattern already forbids lowercase", () => {
    expect(normalizePartNumber("testa0001")).toBe("testa0001");
  });

  /*
   * Stated, not celebrated. This is the exact dependency the disjunction
   * above exists to hold: identity comparison does *not* strip invisible
   * characters, so `PART_NUMBER_PATTERN` is the only thing keeping them out
   * of the corpus. Anyone loosening that pattern has to harden this
   * function in the same change.
   */
  it("does not strip invisible characters — the pattern is what keeps them out", () => {
    expect(normalizePartNumber(`TEST${ZWSP}A0001`)).not.toBe(CLEAN);
  });
});

/* -------------------------------------------------------------------------
 * A supersession pointer is an entry id, and entry ids are not numbers
 *
 * The same invisible-character question one field over: `supersededBy` and
 * `vendors` are matched by exact string equality in `src/lib/parts/index.ts`,
 * so a pointer carrying a zero-width space would dangle — which is a build
 * failure rather than a wrong answer, but only because `ENTRY_REFERENCE_PATTERN`
 * refuses it first. Pinned here so the two patterns stay in step.
 * ---------------------------------------------------------------------- */

describe("entry references refuse the same characters", () => {
  it.each([
    ["zero-width space", `test-parts${ZWSP}-beta`],
    ["non-breaking space", `test-parts${NBSP}beta`],
    ["NUL", `test-parts-beta${NUL}`],
    ["trailing LF", `test-parts-beta${LF}`],
    ["Cyrillic homoglyph", `test-p${CYRILLIC_CAPITAL_A}rts-beta`],
  ])("rejects a `supersededBy` carrying a %s", (_label, value) => {
    expect(
      issuePaths(partsSchema.safeParse(makePart({ supersededBy: value })))
    ).toContain("supersededBy");
  });

  it("accepts an ordinary kebab-case pointer — the positive control", () => {
    expect(
      partsSchema.safeParse(makePart({ supersededBy: "test-parts-beta" }))
        .success
    ).toBe(true);
  });

  it("a pointer that differs only invisibly would dangle, not silently match", () => {
    const index = buildPartsIndex([
      part("test-parts-alpha", "TEST-A0001"),
      {
        id: "test-parts-beta",
        oemNumber: "TEST-A0002",
        supersededBy: `test-parts${ZWSP}-alpha`,
        vendors: [],
      },
    ]);
    // `null` is the honest answer for an unresolvable chain — the same
    // distinction `tests/lib/parts/supersession-unknown-state.test.ts` grades.
    expect(supersessionChain("test-parts-beta", index)).toBeNull();
  });
});
