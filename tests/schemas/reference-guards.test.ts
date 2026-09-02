/**
 * Graders — the three gaps an independent audit found in T207/T208's
 * `reference` schema, written before the fix exists.
 *
 * T207 and T208 shipped as a conductor-authorized deviation with **no paired
 * `[TEST]` task** (`specs/001-foundation/tasks.md`, T207 review disposition
 * F4). T901's closing audit ledgered an independent `[TEST]` back-fill for
 * that surface; this file is part of it. Nothing here was derived from
 * `src/schemas/reference.ts`'s current behaviour — every expectation comes
 * from the spec, from AGENTS.md, or from the module's own stated rule where
 * the code contradicts it.
 *
 * ## The three findings
 *
 * **F1 — the dimension sign rule leaks across unit families.**
 * `quantitySchema`'s own comment says the sign rule "varies by unit family"
 * (`src/schemas/reference.ts`, `QuantityOptions`: "a zero torque or a negative
 * capacity is always an error. Alignment figures (camber, caster, toe) are
 * legitimately signed, so `dimension` turns it on"). But `dimension` turns it
 * on for *all* of `DIMENSION_UNITS` — length, mass and angle in one list —
 * so a wheelbase of `-2725 mm` and a kerb mass of `0 kg` both parse. Only the
 * angle family is legitimately signed; a length or a mass is a magnitude.
 *
 * **F2 — the anti-reproduction cap reads only half of the prose object.**
 * `checkFsmSectionSummaryLength` caps `prose.<locale>.summary` at
 * {@link FSM_SUMMARY_MAX_LENGTH} because "a field that cannot hold a procedure
 * cannot be used to paste one" (AGENTS.md, "Safety and legal": "Cite the
 * Factory Service Manual, never reproduce it. Section references only. It is
 * copyrighted."). `prose.<locale>.title` sits on the same object, is written
 * by the same author, is under no cap at all, and holds a whole procedure
 * today. This is the identical copyright-reproduction defect T207's own review
 * already fixed once in a different field (F1 of that review: a 9,626-char
 * verbatim procedure that reached the site through an unvalidated Markdown
 * body).
 *
 * **F3 — the safety-critical corpus has no ratchet.** AGENTS.md's
 * safety-critical list names SRS/airbags, towing, and jacking/lifting points;
 * `GLOSSARY_SYSTEMS` has no id for any of the three, so `isSafetyCritical()`
 * cannot derive them from `system` and `src/lib/safety.ts` says so in its own
 * docstring. The only thing making today's five such entries correct is an
 * author having remembered `safetyCritical: true` by hand — "which is the
 * exact remembering-dependence `src/lib/safety.ts` names as the failure mode a
 * derived default exists to remove" (tasks.md, T207 review F3). Nothing
 * catches the sixth entry that forgets.
 *
 * Widening `GLOSSARY_SYSTEMS` is a taxonomy change and an AGENTS.md
 * stop-and-ask; it is deliberately **not** what these graders ask for.
 *
 * ## Expected-failure convention (read before editing)
 *
 * The graders for behaviour that does not exist yet are declared
 * `it.fails(...)` / `it.fails.each(...)`, the convention
 * `tests/schemas/prose-locale-completeness.test.ts` established. The marker is
 * the literal text `.fails` on the `it` line and nothing else: the implementer
 * activates a grader by **deleting exactly that `.fails`**. Leaving one on
 * after the fix lands turns the suite red ("expected test to fail"), so
 * activation cannot be forgotten silently.
 *
 * Every `it.fails` here has a positive control beside it that is green today
 * and must stay green after the fix — the legitimate case the rule must not
 * catch. F3's corpus sweep is green today on purpose: it is a ratchet over
 * real shipped content, and a ratchet that starts red is a finding, not a
 * gate. It carries its own anti-vacuity control (the sweep must match the
 * five known entries) and its own regression control (the sweep, run over a
 * synthetic corpus with the flag removed, reports it).
 *
 * Implementers must not otherwise edit this file (AGENTS.md separation rule,
 * audited by T901).
 *
 * ## Fixtures
 *
 * Every synthetic id and code is in the reserved `TEST-` namespace, every URL
 * is `.invalid`, and no figure below is a specification anyone should tighten,
 * fill, tow or lift anything to. The only real data this file reads is the
 * shipped corpus under `src/content/reference/`, and it only ever reads it.
 *
 * refs specs/001-foundation (REF-01, REF-02; AGENTS.md "Facts", "Safety and legal")
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { z } from "astro/zod";
import { issuePaths } from "../helpers/schema-outcome.ts";
import {
  ANGLE_UNITS,
  DIMENSION_UNITS,
  FSM_SUMMARY_MAX_LENGTH,
  LENGTH_UNITS,
  MASS_UNITS,
  referenceEntrySchema,
} from "../../src/schemas/reference.ts";

const schema = referenceEntrySchema({
  title: z.string(),
  summary: z.string(),
});

/** Distinct issue paths — the flatten-then-reparse shape reports each twice. */
const pathsOf = (outcome: unknown): string[] => [
  ...new Set(issuePaths(outcome)),
];

function testSource(kind = "manufacturer"): Record<string, unknown> {
  return {
    title: "TEST fixture source — not a real document",
    url: "https://example.invalid/t207-audit/source",
    archiveUrl:
      "https://web.archive.org/web/20260101000000id_/" +
      "https://example.invalid/t207-audit/source",
    accessed: "2026-09-01",
    kind,
  };
}

function testProse(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    en: { title: "TEST reference row", summary: "Synthetic audit fixture." },
    es: {
      title: "Fila de referencia de prueba",
      summary: "Ficha sintética de prueba.",
    },
    ...overrides,
  };
}

function testEnvelope(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    id: "TEST-reference-audit-row",
    fitment: { gens: ["gen3"] },
    confidence: "fsm-confirmed",
    sources: [testSource()],
    prose: testProse(),
    ...overrides,
  };
}

/* =========================================================================
 * F1 — the dimension sign rule varies by unit family, not by kind
 * ====================================================================== */

/**
 * The units a `dimension` may carry that are **magnitudes**: a wheelbase, a
 * ground clearance, a kerb mass, a braked towing limit. Derived from the
 * exported vocabularies rather than listed by hand, so a new unit family added
 * to `DIMENSION_UNITS` joins this table automatically instead of quietly
 * inheriting the angle family's licence to be negative.
 */
const SIGNED_DIMENSION_UNITS: readonly string[] = ANGLE_UNITS;
const MAGNITUDE_DIMENSION_UNITS: readonly string[] = DIMENSION_UNITS.filter(
  (unit) => !SIGNED_DIMENSION_UNITS.includes(unit)
);

function dimensionEntry(
  dimension: unknown,
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return testEnvelope({
    kind: "dimension",
    system: "body",
    dimension,
    ...overrides,
  });
}

describe("F1 — a dimension's sign rule follows its unit family", () => {
  it("has magnitude units and signed units, and they do not overlap", () => {
    // Anti-vacuity: every it.each table below is empty if this is wrong, and
    // an empty table is a suite that passes having asserted nothing.
    expect(MAGNITUDE_DIMENSION_UNITS.length).toBeGreaterThan(0);
    expect(SIGNED_DIMENSION_UNITS.length).toBeGreaterThan(0);
    expect([...LENGTH_UNITS, ...MASS_UNITS].sort()).toEqual(
      [...MAGNITUDE_DIMENSION_UNITS].sort()
    );
  });

  it.fails(
    "REJECTS a negative length — the audit's repro, a -2725 mm wheelbase",
    () => {
      const outcome = schema.safeParse(
        dimensionEntry({ value: -2725, unit: "mm" })
      );
      expect(outcome.success).toBe(false);
      // Exactly one field is wrong, and it is the one the author must change:
      // the twin below proves the rest of the entry is well-formed, so this
      // cannot be red for an unrelated reason.
      expect(pathsOf(outcome)).toEqual(["dimension.value"]);
    }
  );

  it.fails(
    "REJECTS a zero mass — the audit's repro, a 0 kg kerb weight",
    () => {
      const outcome = schema.safeParse(
        dimensionEntry({ value: 0, unit: "kg" })
      );
      expect(outcome.success).toBe(false);
      expect(pathsOf(outcome)).toEqual(["dimension.value"]);
    }
  );

  it.fails.each([...MAGNITUDE_DIMENSION_UNITS])(
    "REJECTS a negative dimension in %s",
    (unit) => {
      const outcome = schema.safeParse(dimensionEntry({ value: -12, unit }));
      expect(outcome.success).toBe(false);
      expect(pathsOf(outcome)).toEqual(["dimension.value"]);
    }
  );

  it.fails.each([...MAGNITUDE_DIMENSION_UNITS])(
    "REJECTS a zero dimension in %s",
    (unit) => {
      const outcome = schema.safeParse(dimensionEntry({ value: 0, unit }));
      expect(outcome.success).toBe(false);
      expect(pathsOf(outcome)).toEqual(["dimension.value"]);
    }
  );

  it.fails("REJECTS a negative band bound, not only a negative nominal", () => {
    // The rule belongs to the number factory inside `quantitySchema`, which
    // builds `value`, `min` and `max` from one call: a fix applied to
    // `value` alone would leave "-10 to 5 mm" spellable.
    const outcome = schema.safeParse(
      dimensionEntry({ min: -10, max: 5, unit: "mm" })
    );
    expect(outcome.success).toBe(false);
    expect(pathsOf(outcome)).toContain("dimension.min");
  });

  /* --- positive controls: green today, and green after the fix ---------- */

  it("ACCEPTS a negative angle — camber, caster and toe are signed", () => {
    expect(
      schema.safeParse(
        dimensionEntry(
          { value: -0.5, unit: "deg" },
          { system: "suspension", safetyCritical: true }
        )
      ).success
    ).toBe(true);
  });

  it.each([...SIGNED_DIMENSION_UNITS])(
    "ACCEPTS a negative dimension in %s",
    (unit) => {
      expect(
        schema.safeParse(dimensionEntry({ value: -1.5, unit })).success
      ).toBe(true);
    }
  );

  it.each([...SIGNED_DIMENSION_UNITS])(
    "ACCEPTS a zero dimension in %s — zero toe is a specification",
    (unit) => {
      expect(schema.safeParse(dimensionEntry({ value: 0, unit })).success).toBe(
        true
      );
    }
  );

  it.each([...DIMENSION_UNITS])(
    "ACCEPTS a positive dimension in %s",
    (unit) => {
      expect(
        schema.safeParse(dimensionEntry({ value: 12, unit })).success
      ).toBe(true);
    }
  );

  it("ACCEPTS the same wheelbase and mass with the sign corrected", () => {
    // The twin of the two audit repros: identical entries, positive figures.
    // Without this pair, "rejected" above could be rejection for any reason.
    expect(
      schema.safeParse(dimensionEntry({ value: 2725, unit: "mm" })).success
    ).toBe(true);
    expect(
      schema.safeParse(dimensionEntry({ value: 2135, unit: "kg" })).success
    ).toBe(true);
  });

  it("does not break any dimension figure in the shipped corpus", () => {
    // The fix must be a no-op for real content. Every `dimension` entry on
    // main states a positive figure, angles included, so nothing here is
    // load-bearing for the corpus and the rule can be tightened freely.
    const nonPositive = referenceCorpus()
      .filter((entry) => entry.data.kind === "dimension")
      .flatMap((entry) => {
        const figure = (entry.data.dimension ?? {}) as Record<string, unknown>;
        return (["value", "min", "max"] as const)
          .filter(
            (key) =>
              typeof figure[key] === "number" && (figure[key] as number) <= 0
          )
          .map(
            (key) => `${entry.id}.dimension.${key} = ${String(figure[key])}`
          );
      });
    expect(nonPositive).toEqual([]);
  });
});

/* =========================================================================
 * F2 — the anti-reproduction cap covers the whole prose object
 * ====================================================================== */

/**
 * The audit's repro length: a 9,720-character verbatim FSM procedure, the same
 * order of magnitude as the 9,626-character body that T207's own review found
 * bypassing the summary cap. Nothing about this number is a proposed
 * threshold — it is "unmistakably a procedure, not a heading".
 */
const PROCEDURE_LENGTH = 9720;

/**
 * The longest title the graders require to keep parsing. The shipped corpus's
 * longest `reference` title is 93 characters (an ES `dimension` heading), so
 * this leaves better than 2× headroom and pins only that the cap the
 * implementer chooses is not so tight it breaks real content. **The exact
 * title cap is deliberately not pinned here**: the audit left the number as a
 * content/schema-design decision for the fix to make and record, and a grader
 * that invented one would be legislating from the test suite.
 */
const TITLE_LENGTH_THAT_MUST_STAY_LEGAL = 200;

function fsmSectionEntry(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return testEnvelope({
    kind: "fsm-section",
    system: "engine",
    sources: [testSource("fsm")],
    manual: "TEST Service Manual, Vol. 2 — not a real document",
    section: "Group 00 — TEST",
    ...overrides,
  });
}

describe("F2 — cite the FSM, never reproduce it, in the title as well", () => {
  it.fails.each(["en", "es"])(
    "REJECTS an fsm-section entry whose %s title is a whole procedure",
    (locale) => {
      const outcome = schema.safeParse(
        fsmSectionEntry({
          prose: testProse({
            [locale]: {
              title: "a".repeat(PROCEDURE_LENGTH),
              summary: "Synthetic audit fixture.",
            },
          }),
        })
      );
      expect(outcome.success).toBe(false);
      expect(pathsOf(outcome)).toContain(`prose.${locale}.title`);
      // Same reason, so the same word: this is the copyright rule, not a
      // style rule, and the message must say which one it is.
      expect(JSON.stringify(outcome)).toMatch(/copyrighted/);
    }
  );

  it.fails(
    "REJECTS a procedure pasted into BOTH locale titles, naming both",
    () => {
      const long = "a".repeat(PROCEDURE_LENGTH);
      const outcome = schema.safeParse(
        fsmSectionEntry({
          prose: {
            en: { title: long, summary: "Synthetic audit fixture." },
            es: { title: long, summary: "Ficha sintética de prueba." },
          },
        })
      );
      expect(outcome.success).toBe(false);
      expect(pathsOf(outcome)).toContain("prose.en.title");
      expect(pathsOf(outcome)).toContain("prose.es.title");
    }
  );

  /* --- positive controls: green today, and green after the fix ---------- */

  it("ACCEPTS an ordinary section pointer", () => {
    expect(schema.safeParse(fsmSectionEntry()).success).toBe(true);
  });

  it.each(["en", "es"])(
    "ACCEPTS a %s title of 200 characters — well past anything real",
    (locale) => {
      expect(
        schema.safeParse(
          fsmSectionEntry({
            prose: testProse({
              [locale]: {
                title: "a".repeat(TITLE_LENGTH_THAT_MUST_STAY_LEGAL),
                summary: "Synthetic audit fixture.",
              },
            }),
          })
        ).success
      ).toBe(true);
    }
  );

  it("keeps every shipped title inside the length that must stay legal", () => {
    // The measured headroom, asserted rather than remembered: if content ever
    // grows a title past this, the floor above stops being safe and the two
    // move together deliberately.
    const longest = referenceCorpus().flatMap((entry) =>
      ["en", "es"].map((locale) => {
        const prose = (entry.data.prose ?? {}) as Record<string, unknown>;
        const localeProse = (prose[locale] ?? {}) as Record<string, unknown>;
        const title = localeProse.title;
        return {
          where: `${entry.id}.prose.${locale}.title`,
          length: typeof title === "string" ? title.length : 0,
        };
      })
    );
    const over = longest.filter(
      (row) => row.length > TITLE_LENGTH_THAT_MUST_STAY_LEGAL
    );
    expect(over).toEqual([]);
    expect(Math.max(...longest.map((row) => row.length))).toBeGreaterThan(0);
  });

  it("still caps the summary — the half of the rule that already works", () => {
    // A control on the mechanism itself: if this ever goes green-by-accident,
    // the fixture above stopped reaching the fsm-section rules at all and the
    // title graders would be failing for the wrong reason.
    const outcome = schema.safeParse(
      fsmSectionEntry({
        prose: testProse({
          en: {
            title: "TEST section pointer",
            summary: "a".repeat(FSM_SUMMARY_MAX_LENGTH + 1),
          },
        }),
      })
    );
    expect(outcome.success).toBe(false);
    expect(pathsOf(outcome)).toContain("prose.en.summary");
    expect(JSON.stringify(outcome)).toMatch(/copyrighted/);
  });
});

/* =========================================================================
 * F3 — the safety-critical ratchet over the shipped corpus
 * ====================================================================== */

/**
 * AGENTS.md's safety-critical categories that `GLOSSARY_SYSTEMS` has no id
 * for, as the words a row about one of them actually uses — in both locales,
 * because a corpus that only recognised the English would be a gate that half
 * the site walks around.
 *
 * Written as enumerated word forms rather than bare prefixes: `\btow\w*`
 * matches `toward` and `\blift\w*` matches `lifter` (a valve lifter is an
 * engine part, not a hoist). ES stems are unambiguous enough to prefix-match.
 * The ES terms are the glossary's canonical Costa Rican ones — `gata`,
 * `soportes de seguridad`, `bolsa de aire` — not the regional variants, which
 * the glossary keeps in `aliases`.
 */
const SAFETY_SUBJECT_TERMS: readonly { label: string; pattern: RegExp }[] = [
  { label: "towing (en)", pattern: /\btow(s|ing|ed|ball|balls|bar|bars)?\b/ },
  { label: "jacking (en)", pattern: /\bjack(s|ing)?\b/ },
  { label: "lifting (en)", pattern: /\blift(s|ing|ed)?\b/ },
  { label: "srs (en)", pattern: /\bsrs\b/ },
  { label: "airbag (en)", pattern: /\bairbags?\b/ },
  { label: "remolque (es)", pattern: /\bremol(c|qu)\w*\b/ },
  { label: "gata (es)", pattern: /\bgat[ao]s?\b/ },
  { label: "elevador (es)", pattern: /\belevador(es)?\b/ },
  { label: "puntos de apoyo (es)", pattern: /\bpuntos? de apoyo\b/ },
  { label: "bolsa de aire (es)", pattern: /\bbolsas? de aire\b/ },
  { label: "levantar (es)", pattern: /\blevant\w*\b/ },
];

/**
 * The five entries on `main` that AGENTS.md's system list cannot reach and
 * that carry the manual flag today. Pinned by id so that a keyword table which
 * silently stops matching is a red test rather than a sweep over nothing — the
 * "unknown is not zero" rule applied to a grader's own corpus.
 */
const KNOWN_SAFETY_CRITICAL_BY_HAND: readonly string[] = [
  "dimension-gen3-au-towball-download",
  "dimension-gen3-au-towing-braked",
  "dimension-gen3-au-towing-unbraked",
  "fsm-gen3-00-lifting-jacking",
  "fsm-gen3-52-interior-srs",
];

interface CorpusEntry {
  readonly id: string;
  readonly file: string;
  readonly data: Record<string, unknown>;
}

const REFERENCE_CONTENT_DIR = fileURLToPath(
  new URL("../../src/content/reference/", import.meta.url)
);

/** Every shipped `reference` data file, read from disk exactly as it ships. */
function referenceCorpus(dir: string = REFERENCE_CONTENT_DIR): CorpusEntry[] {
  const entries: CorpusEntry[] = [];
  for (const name of readdirSync(dir).sort()) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      entries.push(...referenceCorpus(full));
      continue;
    }
    if (!name.endsWith(".json")) continue;
    entries.push({
      id: name.replace(/\.json$/, ""),
      file: path.relative(REFERENCE_CONTENT_DIR, full),
      data: JSON.parse(readFileSync(full, "utf8")) as Record<string, unknown>,
    });
  }
  return entries;
}

/** Lowercase, diacritic-free, so `\b` behaves on `vehículo` and `sintética`. */
const fold = (value: string): string =>
  value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * The fields that say what an entry is *about*: its id and its title in each
 * locale.
 *
 * **Scope note, in the spirit of GRADER-PRINCIPLES' "a known-pages sweep is
 * only as complete as its list":** summaries are deliberately out of scope,
 * and the sweep is therefore silent on an entry whose subject is something
 * else but whose summary discusses jacking in passing. Two shipped entries are
 * exactly that case and are correctly unflagged —
 * `dimension-gen3-us-ground-clearance` (a *suspension lift* changes ground
 * clearance) and `fsm-gen3-00-general` (its contents list names the lifting
 * and jacking sub-section, which has its own flagged entry). Widening this to
 * summaries means adopting an exception list for those two; that is a content
 * decision, not a grader's to make silently.
 */
function subjectFields(entry: CorpusEntry): string[] {
  const prose = (entry.data.prose ?? {}) as Record<string, unknown>;
  const titles = ["en", "es"].map((locale) => {
    const localeProse = (prose[locale] ?? {}) as Record<string, unknown>;
    return typeof localeProse.title === "string" ? localeProse.title : "";
  });
  return [entry.id, ...titles].map(fold);
}

/** Which safety-critical categories an entry's *subject* names, if any. */
function safetySubjectMatches(entry: CorpusEntry): string[] {
  const fields = subjectFields(entry);
  return SAFETY_SUBJECT_TERMS.filter((term) =>
    fields.some((field) => term.pattern.test(field))
  ).map((term) => term.label);
}

/** Entries whose subject names a safety-critical category and that say so. */
function safetyRatchetViolations(corpus: readonly CorpusEntry[]): string[] {
  return corpus
    .filter((entry) => safetySubjectMatches(entry).length > 0)
    .filter((entry) => entry.data.safetyCritical !== true)
    .map(
      (entry) =>
        `${entry.file}: subject names ${safetySubjectMatches(entry).join(", ")} ` +
        `but safetyCritical is ${String(entry.data.safetyCritical)}`
    );
}

describe("F3 — the safety-critical ratchet over shipped reference content", () => {
  it("reads a corpus at all — a sweep over nothing proves nothing", () => {
    const corpus = referenceCorpus();
    expect(corpus.length).toBeGreaterThan(50);
    expect(corpus.every((entry) => typeof entry.data.kind === "string")).toBe(
      true
    );
  });

  it("matches the five entries the system list cannot reach", () => {
    // Anti-vacuity and drift control together: if a keyword stops matching,
    // the sweep below would pass having examined nothing.
    const matched = referenceCorpus()
      .filter((entry) => safetySubjectMatches(entry).length > 0)
      .map((entry) => entry.id)
      .sort();
    expect(matched).toEqual(
      expect.arrayContaining([...KNOWN_SAFETY_CRITICAL_BY_HAND])
    );
  });

  it("RATCHET: every safety-critical subject in the corpus is flagged", () => {
    // Green today (the five are all flagged by hand) and the point of the
    // file: the sixth entry that forgets is a red test, not a silent omission
    // of the standing bilingual safety notice AGENTS.md requires.
    expect(safetyRatchetViolations(referenceCorpus())).toEqual([]);
  });

  it("REPORTS a clone of a shipped entry with the flag removed", () => {
    // The sweep's own mutation control: without this, "no violations" could
    // mean the rule cannot report one.
    const towing = referenceCorpus().find(
      (entry) => entry.id === "dimension-gen3-au-towing-braked"
    );
    expect(towing).toBeDefined();
    const withoutFlag = { ...(towing as CorpusEntry).data };
    delete withoutFlag.safetyCritical;
    const mutated: CorpusEntry = {
      id: "TEST-dimension-gen9-towing-braked",
      file: "TEST-dimension-gen9-towing-braked.json",
      data: withoutFlag,
    };
    const violations = safetyRatchetViolations([mutated]);
    expect(violations).toHaveLength(1);
    expect(violations[0]).toMatch(/TEST-dimension-gen9-towing-braked/);
    expect(violations[0]).toMatch(/towing \(en\)/);
  });

  it("REPORTS a clone whose subject is only Spanish", () => {
    // The bilingual half of the rule, mutation-controlled the same way: a gate
    // that only reads English is a gate half the site walks around.
    const mutated: CorpusEntry = {
      id: "TEST-fsm-gen9-52-interior",
      file: "TEST-fsm-gen9-52-interior.json",
      data: {
        kind: "fsm-section",
        system: "interior",
        prose: {
          en: { title: "TEST occupant restraint section", summary: "TEST." },
          es: { title: "Sección de bolsa de aire de prueba", summary: "TEST." },
        },
      },
    };
    expect(safetyRatchetViolations([mutated])).toHaveLength(1);
  });

  it("does not flag an entry whose subject is not safety-critical", () => {
    // Positive control on the rule's precision: an over-strict ratchet gets
    // deleted out of frustration rather than fixed.
    const ordinary: CorpusEntry = {
      id: "TEST-torque-gen9-oil-drain-plug",
      file: "TEST-torque-gen9-oil-drain-plug.json",
      data: {
        kind: "torque",
        system: "engine",
        prose: {
          en: { title: "TEST oil drain plug torque", summary: "TEST." },
          es: {
            title: "Apriete del tapón de drenaje de prueba",
            summary: "T.",
          },
        },
      },
    };
    expect(safetySubjectMatches(ordinary)).toEqual([]);
    expect(safetyRatchetViolations([ordinary])).toEqual([]);
  });

  it("does not mistake a valve lifter or a town for a hoist or a tow", () => {
    // The word-boundary half of the rule, asserted directly: prefix matching
    // would flag both of these and teach authors to write around the gate.
    const nearMiss: CorpusEntry = {
      id: "TEST-torque-gen9-valve-lifter",
      file: "TEST-torque-gen9-valve-lifter.json",
      data: {
        kind: "torque",
        system: "engine",
        prose: {
          en: {
            title: "TEST valve lifter torque, toward the front of the engine",
            summary: "TEST.",
          },
          es: { title: "Apriete del buzo de prueba", summary: "TEST." },
        },
      },
    };
    expect(safetySubjectMatches(nearMiss)).toEqual([]);
  });

  /* --- the gap itself: nothing but an author's memory enforces this ----- */

  function unflaggedTowingEntry(
    overrides: Record<string, unknown> = {}
  ): Record<string, unknown> {
    return testEnvelope({
      id: "TEST-dimension-gen9-towing-braked",
      kind: "dimension",
      // `general` is the system these five real entries carry: AGENTS.md's
      // towing / jacking / SRS categories have no GLOSSARY_SYSTEMS id, which
      // is the whole finding. Widening that vocabulary is a taxonomy change
      // and an AGENTS.md stop-and-ask, so it is not what this asks for.
      system: "general",
      dimension: { value: 3000, unit: "kg" },
      prose: {
        en: {
          title: "TEST braked towing capacity",
          summary: "Synthetic audit fixture — not a real towing limit.",
        },
        es: {
          title: "Capacidad de remolque con freno de prueba",
          summary: "Ficha sintética — no es un límite real de remolque.",
        },
      },
      ...overrides,
    });
  }

  it.fails("REJECTS a towing row that never says safetyCritical: true", () => {
    // AGENTS.md, "Safety and legal": towing "gets […] a standing bilingual
    // safety notice on the page […] regardless of how small the diff is."
    // With no system id to derive it from, the flag is the only thing that
    // renders that notice — so an unflagged towing row ships the figure
    // without the warning, and nothing today says a word about it.
    const outcome = schema.safeParse(unflaggedTowingEntry());
    expect(outcome.success).toBe(false);
    expect(pathsOf(outcome)).toContain("safetyCritical");
  });

  it.fails("REJECTS an unflagged jacking-points row the same way", () => {
    const outcome = schema.safeParse(
      testEnvelope({
        id: "TEST-fsm-gen9-00-lifting-jacking",
        kind: "fsm-section",
        system: "general",
        sources: [testSource("fsm")],
        manual: "TEST Service Manual, Vol. 1 — not a real document",
        section: "Group 00 — TEST",
        prose: {
          en: {
            title: "TEST support locations for lifting and jacking",
            summary: "Synthetic audit fixture.",
          },
          es: {
            title: "Puntos de apoyo de prueba para levantar el vehículo",
            summary: "Ficha sintética de prueba.",
          },
        },
      })
    );
    expect(outcome.success).toBe(false);
    expect(pathsOf(outcome)).toContain("safetyCritical");
  });

  /* --- positive controls: green today, and green after the fix ---------- */

  it("ACCEPTS the same towing row once it is flagged", () => {
    expect(
      schema.safeParse(unflaggedTowingEntry({ safetyCritical: true })).success
    ).toBe(true);
  });

  it("ACCEPTS an ordinary row that names no safety-critical subject", () => {
    // The rule must not become "every reference entry states the flag".
    expect(
      schema.safeParse(
        testEnvelope({
          kind: "torque",
          system: "engine",
          torque: { value: 88, unit: "nm" },
        })
      ).success
    ).toBe(true);
  });

  it("ACCEPTS a brakes row with no flag — the system already derives it", () => {
    // `src/lib/safety.ts` derives brakes from `system`; requiring the manual
    // flag there would reintroduce the remembering-dependence the derived
    // default exists to remove.
    expect(
      schema.safeParse(
        testEnvelope({
          kind: "torque",
          system: "brakes",
          torque: { value: 88, unit: "nm" },
        })
      ).success
    ).toBe(true);
  });
});
