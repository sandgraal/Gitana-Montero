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
import { describe, expect, it } from "vitest";

import {
  CANONICAL_TERM_PROSE_FIELD,
  MIN_SCANNABLE_ALIAS_LENGTH,
  auditGlossary,
  buildGlossaryIndex,
  findAliasUsages,
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
