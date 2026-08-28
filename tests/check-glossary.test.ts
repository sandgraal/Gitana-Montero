/**
 * Graders — `check:glossary`, the real canonical-term conformance scan (T205).
 *
 * Was the T105 tripwire stub's test (`findPrematureGlossaryEntries`, which
 * only asserted that a glossary entry arriving before a real scanner failed
 * loudly). T205 is the task scoped to replace that stub, so its test is
 * replaced with it; nothing here grades a behaviour the stub had.
 *
 * Every fixture is synthetic and built by the helpers at the top rather than
 * lifted from real content: the corpus must not be chosen around the
 * implementation, so the cases are written from GLO-02's wording and from the
 * false-positive classes the module docstring names, one test each.
 *
 * refs specs/001-foundation (SCF-02, GLO-01, GLO-02)
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  CANONICAL_TERM_PROSE_FIELD,
  MIN_SCANNABLE_ALIAS_LENGTH,
  UI_STRING_EXEMPTIONS,
  auditGlossary,
  buildGlossaryIndex,
  extractUiEsStrings,
  findAliasUsages,
  findUiStringIssues,
  normalizeForSearch,
  tokenize,
} from "../scripts/check-glossary.mjs";
import { CANONICAL_TERM_PROSE_FIELD as SCHEMA_CANONICAL_TERM_FIELD } from "../src/schemas/glossary.ts";
import {
  normalizeForSearch as tsNormalizeForSearch,
  tokenize as tsTokenize,
} from "../src/lib/text.ts";

/* -------------------------------------------------------------------------
 * Fixtures
 * ---------------------------------------------------------------------- */

interface AliasFixture {
  term: string;
  locale: "en" | "es";
  countries: string[];
  falseFriend?: boolean;
}

interface TermOptions {
  id: string;
  es: string;
  en: string;
  aliases?: AliasFixture[];
  relatedTerms?: string[];
  definitionEs?: string;
  definitionEn?: string;
}

function term(options: TermOptions) {
  const {
    id,
    es,
    en,
    aliases = [],
    relatedTerms = [],
    definitionEs = "Definición de prueba.",
    definitionEn = "Test definition.",
  } = options;
  return {
    collection: "glossary",
    relativePath: `${id}.yaml`,
    file: `src/content/glossary/${id}.yaml`,
    data: {
      id,
      system: "general",
      aliases,
      relatedTerms,
      prose: {
        en: { [CANONICAL_TERM_PROSE_FIELD]: en, summary: definitionEn },
        es: { [CANONICAL_TERM_PROSE_FIELD]: es, summary: definitionEs },
      },
    },
  };
}

/** An entry in some other collection, carrying only the ES prose under test. */
function prose(es: string, collection = "problems", id = "sample") {
  return {
    collection,
    relativePath: `${id}.yaml`,
    file: `src/content/${collection}/${id}.yaml`,
    data: {
      id,
      prose: {
        en: { title: "Sample", summary: "Sample." },
        es: { title: "Ejemplo", summary: es },
      },
    },
  };
}

const llanta = term({
  id: "llanta",
  es: "llanta",
  en: "tire",
  aliases: [
    { term: "goma", locale: "es", countries: ["PR", "DO"] },
    { term: "neumático", locale: "es", countries: ["ES", "CL"] },
    { term: "tyre", locale: "en", countries: ["GB", "AU"] },
  ],
});

const messages = (entries: unknown[]): string[] =>
  auditGlossary(entries as never[]).map(
    (problem: { message: string }) => problem.message
  );

const codes = (entries: unknown[]): string[] =>
  auditGlossary(entries as never[]).map(
    (problem: { code: string }) => problem.code
  );

/* -------------------------------------------------------------------------
 * The mirrored constants and helpers
 * ---------------------------------------------------------------------- */

describe("the plain-Node mirrors match their TypeScript originals", () => {
  it("reads the canonical term from the field the schema designates", () => {
    expect(CANONICAL_TERM_PROSE_FIELD).toBe(SCHEMA_CANONICAL_TERM_FIELD);
  });

  // A general corpus, written before the implementation was: accents, ñ,
  // uppercase, punctuation, digits, whitespace runs, and the empty string.
  const corpus = [
    "",
    "   ",
    "Pastillas de Freno",
    "NEUMÁTICO",
    "año",
    "refacción.",
    "¿Cuánto torque lleva el perno?",
    "6G74 SOHC",
    "aro  de   17",
    "Añadir líquido — 2,3 L",
    "tyre/bonnet",
    "Ojo: llanta ≠ aro",
  ];

  it.each(corpus)("normalizes %j identically", (value) => {
    expect(normalizeForSearch(value)).toBe(tsNormalizeForSearch(value));
  });

  it.each(corpus)("tokenizes %j identically", (value) => {
    expect(tokenize(value)).toEqual(tsTokenize(value));
  });
});

/* -------------------------------------------------------------------------
 * Conformance (GLO-02)
 * ---------------------------------------------------------------------- */

describe("canonical-term conformance in ES prose", () => {
  it("is clean when the glossary is empty", () => {
    expect(messages([prose("Cambie las balatas del carro.")])).toEqual([]);
  });

  it("flags a regional variant, naming file, field, variant and canonical", () => {
    const problems = auditGlossary([
      llanta,
      prose("Revise la goma delantera."),
    ] as never[]);

    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({
      code: "non-canonical-term",
      file: "src/content/problems/sample.yaml",
      field: "prose.es.summary",
      term: "goma",
      canonical: "llanta",
    });
    expect(problems[0].message).toContain("GLO-02");
  });

  it("never flags the canonical term itself", () => {
    expect(messages([llanta, prose("Revise la llanta delantera.")])).toEqual(
      []
    );
  });

  it("matches case- and accent-insensitively", () => {
    expect(codes([llanta, prose("Cambie el NEUMATICO trasero.")])).toEqual([
      "non-canonical-term",
    ]);
  });

  it("matches a variant at the end of a sentence, accent and all", () => {
    // The regression the tokenizer exists for: `/\bneumático\b/` cannot match
    // here, because JavaScript's ASCII-only `\b` inverts after `o`… `ó`.
    expect(codes([llanta, prose("Hay que cambiar el neumático.")])).toEqual([
      "non-canonical-term",
    ]);
  });

  it("never matches inside a longer word", () => {
    expect(messages([llanta, prose("Compró gomaespuma y gomas.")])).toEqual([]);
  });

  it("matches a multi-word variant as a word sequence", () => {
    const pads = term({
      id: "pastillas-de-freno",
      es: "pastillas de freno",
      en: "brake pads",
      aliases: [{ term: "balatas de freno", locale: "es", countries: ["MX"] }],
    });
    expect(codes([pads, prose("Instale balatas de freno nuevas.")])).toEqual([
      "non-canonical-term",
    ]);
    expect(messages([pads, prose("Instale balatas nuevas de freno.")])).toEqual(
      []
    );
  });

  it("scans prose.es only — not prose.en, not the aliases data", () => {
    const enOnly = {
      collection: "problems",
      relativePath: "en-only.yaml",
      file: "src/content/problems/en-only.yaml",
      data: {
        id: "en-only",
        prose: {
          en: { title: "Goma", summary: "The goma is worn." },
          es: { title: "Ejemplo", summary: "La llanta está gastada." },
        },
      },
    };
    expect(messages([llanta, enOnly])).toEqual([]);
  });

  it("exempts a variant inside the prose of the entry that declares it", () => {
    // The design artboard's own `llanta` card explains that in CR usage
    // `llanta` is the tire and not the wheel, naming `neumático` to do it.
    const selfExplaining = term({
      id: "llanta",
      es: "llanta",
      en: "tire",
      aliases: [{ term: "neumático", locale: "es", countries: ["ES", "CL"] }],
      definitionEs: "En Costa Rica la llanta es el neumático, nunca el aro.",
    });
    expect(messages([selfExplaining])).toEqual([]);
  });

  it("does not exempt it in a different glossary entry's prose", () => {
    const other = term({
      id: "aro",
      es: "aro",
      en: "wheel",
      definitionEs: "La pieza metálica donde se monta el neumático.",
    });
    expect(codes([llanta, other])).toEqual(["non-canonical-term"]);
  });

  it("never scans a variant marked as a false friend", () => {
    const aro = term({
      id: "aro",
      es: "aro",
      en: "wheel",
      aliases: [
        { term: "rin", locale: "es", countries: ["MX", "CO"] },
        { term: "llanta", locale: "es", countries: ["ES"], falseFriend: true },
      ],
    });
    expect(messages([aro, prose("Golpeó la llanta contra la acera.")])).toEqual(
      []
    );
    expect(codes([aro, prose("Golpeó el rin contra la acera.")])).toEqual([
      "non-canonical-term",
    ]);
  });

  it("never scans a variant that is another entry's canonical term", () => {
    // Same collision as above but without the `falseFriend` flag: peninsular
    // `llanta` is CR's `aro`, and `llanta` is also CR's canonical word for the
    // tire. Flagging it would fire on correct prose everywhere.
    const aro = term({
      id: "aro",
      es: "aro",
      en: "wheel",
      aliases: [{ term: "llanta", locale: "es", countries: ["ES"] }],
    });
    expect(
      messages([aro, llanta, prose("Revise la llanta delantera.")])
    ).toEqual([]);
  });

  it("never scans an English-locale variant against Spanish prose", () => {
    expect(messages([llanta, prose("Pida un tyre nuevo.")])).toEqual([]);
  });

  it("never scans a variant shorter than the minimum length", () => {
    const short = term({
      id: "aceite",
      es: "aceite",
      en: "oil",
      aliases: [{ term: "ac", locale: "es", countries: ["MX"] }],
    });
    expect("ac".length).toBeLessThan(MIN_SCANNABLE_ALIAS_LENGTH);
    expect(messages([short, prose("El ac del motor.")])).toEqual([]);
  });

  it("never matches inside a hyphenated compound", () => {
    // An internal hyphen joins the token rather than splitting it. Before
    // that fix `goma-espuma` tokenized to ["goma","espuma"], so the variant
    // `goma` fired on it — a false positive in a merge-blocking gate, and a
    // direct contradiction of "cannot match inside another word".
    expect(messages([llanta, prose("Selle con goma-espuma nueva.")])).toEqual(
      []
    );
    // …and the bare word on its own is still caught, so the fix did not just
    // turn the rule off.
    expect(codes([llanta, prose("Selle con goma nueva.")])).toEqual([
      "non-canonical-term",
    ]);
  });

  it("never scans a variant with a one-character token", () => {
    // `A/C` tokenizes to ["a","c"], which would match punctuated prose such
    // as "la A. C. del taller".
    const ac = term({
      id: "aire-acondicionado",
      es: "aire acondicionado",
      en: "air conditioning",
      aliases: [{ term: "A/C", locale: "es", countries: ["MX", "CR"] }],
    });
    expect(messages([ac, prose("Revise la A. C. del taller.")])).toEqual([]);
  });

  /*
   * The no-morphological-expansion silence, pinned (C6). These are the one
   * place recall is knowingly traded away, so a future stemming change has to
   * break a test rather than silently widen a merge-blocking gate.
   */
  describe("no morphological expansion (pinned negatives)", () => {
    const pads = term({
      id: "pastillas-de-freno",
      es: "pastillas de freno",
      en: "brake pads",
      aliases: [{ term: "balatas", locale: "es", countries: ["MX"] }],
    });
    const wheel = term({
      id: "aro",
      es: "aro",
      en: "wheel",
      aliases: [{ term: "rin", locale: "es", countries: ["MX", "CO"] }],
    });

    it("a declared plural does not catch the singular", () => {
      expect(messages([pads, prose("Cambie una balata.")])).toEqual([]);
    });

    it("a declared singular does not catch the plural", () => {
      expect(messages([wheel, prose("Compró cuatro rines.")])).toEqual([]);
    });

    it("the declared form itself is still caught (control)", () => {
      expect(codes([pads, prose("Cambie las balatas.")])).toEqual([
        "non-canonical-term",
      ]);
      expect(codes([wheel, prose("Compró un rin.")])).toEqual([
        "non-canonical-term",
      ]);
    });
  });

  it("reports every occurrence in every prose field", () => {
    const entry = {
      collection: "problems",
      relativePath: "many.yaml",
      file: "src/content/problems/many.yaml",
      data: {
        id: "many",
        prose: {
          en: { title: "T", summary: "S" },
          es: { title: "La goma", summary: "Otra goma más." },
        },
      },
    };
    const fields = auditGlossary([llanta, entry] as never[]).map(
      (problem: { field: string }) => problem.field
    );
    expect(fields).toEqual(["prose.es.title", "prose.es.summary"]);
  });
});

/* -------------------------------------------------------------------------
 * Integrity (GLO-01)
 * ---------------------------------------------------------------------- */

describe("glossary integrity", () => {
  it("flags two entries claiming the same canonical term in one locale", () => {
    const twin = term({ id: "llanta-2", es: "Llanta", en: "tyre" });
    expect(codes([llanta, twin])).toContain("duplicate-canonical-term");
  });

  it("allows the same string as a canonical term in each locale", () => {
    const motor = term({ id: "motor", es: "motor", en: "motor" });
    expect(messages([motor])).toEqual([]);
  });

  it("flags an alias that repeats its own entry's canonical term", () => {
    const silly = term({
      id: "llanta",
      es: "llanta",
      en: "tire",
      aliases: [{ term: "Llanta", locale: "es", countries: ["CR"] }],
    });
    expect(codes([silly])).toEqual(["alias-equals-own-canonical"]);
  });

  it("flags one variant claimed by two entries, and stops scanning it", () => {
    const a = term({
      id: "aro",
      es: "aro",
      en: "wheel",
      aliases: [{ term: "rin", locale: "es", countries: ["MX"] }],
    });
    const b = term({
      id: "aro-de-repuesto",
      es: "aro de repuesto",
      en: "spare wheel",
      aliases: [{ term: "rin", locale: "es", countries: ["CO"] }],
    });
    const problems = auditGlossary([a, b, prose("Cambió el rin.")] as never[]);
    expect(problems.map((p: { code: string }) => p.code)).toEqual([
      "alias-claimed-twice",
    ]);
  });

  it("flags a relatedTerms id that names no glossary entry", () => {
    const orphan = term({
      id: "aro",
      es: "aro",
      en: "wheel",
      relatedTerms: ["no-such-term"],
    });
    expect(codes([orphan])).toEqual(["related-term-missing"]);
  });

  it("flags a relatedTerms self-reference", () => {
    const selfish = term({
      id: "aro",
      es: "aro",
      en: "wheel",
      relatedTerms: ["aro"],
    });
    expect(codes([selfish])).toEqual(["related-term-self"]);
  });

  it("accepts a relatedTerms id that resolves", () => {
    const aro = term({
      id: "aro",
      es: "aro",
      en: "wheel",
      relatedTerms: ["llanta"],
    });
    expect(messages([aro, llanta])).toEqual([]);
  });
});

/* -------------------------------------------------------------------------
 * The index and the matcher, directly
 * ---------------------------------------------------------------------- */

describe("buildGlossaryIndex", () => {
  it("keeps unscannable variants out of the scan list but in the glossary", () => {
    const index = buildGlossaryIndex([
      term({
        id: "llanta",
        es: "llanta",
        en: "tire",
        aliases: [
          { term: "goma", locale: "es", countries: ["PR"] },
          { term: "tyre", locale: "en", countries: ["GB"] },
        ],
      }),
    ] as never[]);

    expect(index.glossary).toHaveLength(1);
    expect(
      index.scannable.map((alias: { term: string }) => alias.term)
    ).toEqual(["goma"]);
  });

  it("ignores entries in other collections", () => {
    const index = buildGlossaryIndex([prose("Nada que ver.")] as never[]);
    expect(index.glossary).toEqual([]);
    expect(index.scannable).toEqual([]);
  });

  it("records every deliberately-unscanned variant with its reason", () => {
    // A silently dropped variant is a gate that has stopped working without
    // anyone noticing, so exclusions are data, not just an absence.
    const index = buildGlossaryIndex([
      term({
        id: "aro",
        es: "aro",
        en: "wheel",
        aliases: [
          { term: "rin", locale: "es", countries: ["MX"] },
          {
            term: "llanta",
            locale: "es",
            countries: ["ES"],
            falseFriend: true,
          },
          { term: "ll", locale: "es", countries: ["ES"] },
        ],
      }),
      llanta,
    ] as never[]);

    const skipped = Object.fromEntries(
      index.skipped.map((entry: { term: string; reason: string }) => [
        entry.term,
        entry.reason,
      ])
    );
    expect(skipped["llanta"]).toBe("marked falseFriend");
    expect(skipped["ll"]).toBe("shorter than the minimum scannable length");
    expect(index.skipped.every((e: { ownerId: string }) => e.ownerId)).toBe(
      true
    );
  });

  it("names the canonical-collision exclusions rather than only counting them", () => {
    const aro = term({
      id: "aro",
      es: "aro",
      en: "wheel",
      aliases: [{ term: "llanta", locale: "es", countries: ["ES"] }],
    });
    const index = buildGlossaryIndex([aro, llanta] as never[]);
    const collision = index.skipped.find(
      (entry: { term: string }) => entry.term === "llanta"
    );
    expect(collision).toMatchObject({
      term: "llanta",
      reason: "is also a canonical term",
      ownerId: "aro",
      ownerFile: "src/content/glossary/aro.yaml",
    });
  });
});

describe("the ES UI strings are scanned too (I18N-08 chrome is prose)", () => {
  const uiSource = (body: string) => `const es: UiStrings = {\n${body}\n};\n`;

  it("flags a regional variant in a chrome string, naming the key", () => {
    const problems = findUiStringIssues(
      uiSource('  navGoma: "Revise la goma",'),
      buildGlossaryIndex([llanta] as never[]).scannable
    );
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatchObject({
      file: "src/i18n/ui.ts",
      field: "es.navGoma",
      term: "goma",
      canonical: "llanta",
    });
  });

  it("is clean when the chrome uses canonical terms", () => {
    expect(
      findUiStringIssues(
        uiSource('  navLlanta: "Revise la llanta",'),
        buildGlossaryIndex([llanta] as never[]).scannable
      )
    ).toEqual([]);
  });

  it("exempts glossarySearchPlaceholder by name, and only it", () => {
    const scannable = buildGlossaryIndex([llanta] as never[]).scannable;
    expect(UI_STRING_EXEMPTIONS.has("glossarySearchPlaceholder")).toBe(true);
    expect(
      findUiStringIssues(
        uiSource('  glossarySearchPlaceholder: "Busque goma o neumático",'),
        scannable
      )
    ).toEqual([]);
    expect(
      findUiStringIssues(
        uiSource('  glossarySearchLabel: "Busque goma o neumático",'),
        scannable
      )
    ).not.toEqual([]);
  });

  it("gives every exemption a stated reason", () => {
    for (const [key, reason] of UI_STRING_EXEMPTIONS) {
      expect(typeof reason, key).toBe("string");
      expect(reason.trim().length, key).toBeGreaterThan(20);
    }
  });

  it("does not scan the EN block", () => {
    const source =
      'const en: UiStrings = {\n  x: "Check the goma",\n};\n' +
      uiSource('  y: "Revise la llanta",');
    expect(
      findUiStringIssues(
        source,
        buildGlossaryIndex([llanta] as never[]).scannable
      )
    ).toEqual([]);
  });
});

describe("extractUiEsStrings", () => {
  it("reads keys and values, quoted keys included", () => {
    const source =
      "const es: UiStrings = {\n" +
      '  navHome: "Inicio",\n' +
      '  "glossarySystem.brakes": "Frenos",\n' +
      "};\n";
    expect(extractUiEsStrings(source)).toEqual([
      { key: "navHome", value: "Inicio" },
      { key: "glossarySystem.brakes", value: "Frenos" },
    ]);
  });

  it("returns nothing when the block is absent", () => {
    expect(extractUiEsStrings("export const x = 1;")).toEqual([]);
  });

  it("reads the real src/i18n/ui.ts ES block", () => {
    // Guards the regex against the real file's shape drifting away from it —
    // an extractor that silently reads nothing is an audit that passes by
    // auditing nothing.
    const source = readFileSync(
      new URL("../src/i18n/ui.ts", import.meta.url),
      "utf8"
    );
    const found = extractUiEsStrings(source);
    expect(found.length).toBeGreaterThan(20);
    expect(found.map((pair) => pair.key)).toContain("glossaryHeading");
  });
});

describe("findAliasUsages", () => {
  const scannable = [
    {
      term: "balatas",
      tokens: ["balatas"],
      locale: "es",
      canonical: "pastillas de freno",
      ownerId: "pastillas-de-freno",
      ownerFile: "src/content/glossary/pastillas-de-freno.yaml",
    },
  ];

  it("returns the matched text as it was written", () => {
    const usages = findAliasUsages("Las BALATAS chillan.", scannable);
    expect(usages).toHaveLength(1);
    expect(usages[0].text).toBe("BALATAS");
    expect(usages[0].index).toBe(4);
  });

  it("returns nothing for text with no words", () => {
    expect(findAliasUsages("— 2,3 · 88", scannable)).toEqual([]);
  });
});
