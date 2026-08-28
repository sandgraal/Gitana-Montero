/**
 * Graders — the glossary collection schema (GLO-01).
 *
 * The fixtures are synthetic (`test-glossary-…` ids, `.invalid` URLs) for the
 * same reasons `tests/fixtures/schema-fixtures.ts` gives: nothing here may
 * look like a real part number or a real source.
 *
 * refs specs/001-foundation (GLO-01, GLO-02, GLO-04)
 */
import { describe, expect, it } from "vitest";

import {
  CANONICAL_TERM_PROSE_FIELD,
  GLOSSARY_SYSTEMS,
  TERM_MAX_LENGTH,
  canonicalTermIssue,
  canonicalTermOf,
  glossaryEntrySchema,
} from "../../src/schemas/glossary.ts";
import { issuePaths, issuesOf } from "../helpers/schema-outcome.ts";

interface GlossaryFixture {
  id?: string;
  fitment?: unknown;
  system?: unknown;
  aliases?: unknown;
  relatedTerms?: unknown;
  confidence?: string;
  sources?: unknown[];
  prose?: unknown;
  [extra: string]: unknown;
}

function makeGlossaryEntry(): GlossaryFixture {
  return {
    id: "test-glossary-alpha",
    fitment: { gens: ["gen3"] },
    system: "wheels-tires",
    aliases: [{ term: "goma", locale: "es", countries: ["PR", "DO"] }],
    relatedTerms: ["test-glossary-beta"],
    confidence: "community-consensus",
    sources: [],
    prose: {
      en: { title: "tire", summary: "The rubber tire mounted on the wheel." },
      es: {
        title: "llanta",
        summary: "La llanta de caucho montada en el aro.",
      },
    },
  };
}

const parse = (entry: unknown) => glossaryEntrySchema.safeParse(entry);

describe("glossary entry schema", () => {
  it("accepts a well-formed entry", () => {
    const outcome = parse(makeGlossaryEntry());
    expect(issuesOf(outcome)).toEqual([]);
  });

  it("requires a system (GLO-04's filter has to have something to filter on)", () => {
    const entry = makeGlossaryEntry();
    delete entry.system;
    expect(issuePaths(parse(entry))).toContain("system");
  });

  it("rejects a system outside the taxonomy", () => {
    const entry = makeGlossaryEntry();
    entry.system = "flux-capacitor";
    expect(issuePaths(parse(entry))).toContain("system");
  });

  it.each(GLOSSARY_SYSTEMS)("accepts the `%s` system", (system) => {
    const entry = makeGlossaryEntry();
    entry.system = system;
    entry.relatedTerms = [];
    expect(issuesOf(parse(entry))).toEqual([]);
  });

  it("defaults aliases and relatedTerms to empty lists", () => {
    const entry = makeGlossaryEntry();
    delete entry.aliases;
    delete entry.relatedTerms;
    const outcome = parse(entry);
    expect(outcome.success).toBe(true);
    if (outcome.success) {
      expect(outcome.data.aliases).toEqual([]);
      expect(outcome.data.relatedTerms).toEqual([]);
    }
  });

  it("keeps both prose locales required (inherited from the entry factory)", () => {
    const entry = makeGlossaryEntry();
    entry.prose = { en: { title: "tire", summary: "…" } };
    expect(issuePaths(parse(entry))).toContain("prose.es");
  });

  it("keeps fitment required — a term with no fitment is still a fact", () => {
    const entry = makeGlossaryEntry();
    delete entry.fitment;
    expect(issuePaths(parse(entry))).toContain("fitment");
  });

  it("keeps the confidence/citation contract — fsm-confirmed must cite", () => {
    const entry = makeGlossaryEntry();
    entry.confidence = "fsm-confirmed";
    entry.sources = [];
    expect(issuePaths(parse(entry))).toContain("sources");
  });

  it("names an unknown top-level field instead of dropping it", () => {
    const entry = makeGlossaryEntry();
    entry.definition = "should have been `summary`";
    const codes = issuesOf(parse(entry)).map((issue) => issue.code);
    expect(codes).toContain("unrecognized_keys");
  });
});

describe("aliases (GLO-01, GLO-03)", () => {
  const withAliases = (aliases: unknown) => {
    const entry = makeGlossaryEntry();
    entry.aliases = aliases;
    entry.relatedTerms = [];
    return parse(entry);
  };

  it("requires at least one country tag — an untagged variant is a rumor", () => {
    expect(
      issuePaths(withAliases([{ term: "goma", locale: "es", countries: [] }]))
    ).toContain("aliases.0.countries");
  });

  it("requires uppercase ISO 3166-1 alpha-2 country codes", () => {
    expect(
      issuePaths(
        withAliases([{ term: "goma", locale: "es", countries: ["mx"] }])
      )
    ).toContain("aliases.0.countries.0");
    expect(
      issuePaths(
        withAliases([{ term: "goma", locale: "es", countries: ["MEX"] }])
      )
    ).toContain("aliases.0.countries.0");
  });

  it("requires an explicit locale, with no default", () => {
    expect(
      issuePaths(withAliases([{ term: "tyre", countries: ["GB"] }]))
    ).toContain("aliases.0.locale");
  });

  it("rejects a locale outside en/es", () => {
    expect(
      issuePaths(
        withAliases([{ term: "pneu", locale: "fr", countries: ["FR"] }])
      )
    ).toContain("aliases.0.locale");
  });

  it("accepts the falseFriend flag", () => {
    const outcome = withAliases([
      { term: "llanta", locale: "es", countries: ["ES"], falseFriend: true },
    ]);
    expect(issuesOf(outcome)).toEqual([]);
  });

  it("names an unknown alias field", () => {
    const codes = issuesOf(
      withAliases([
        { term: "goma", locale: "es", countries: ["PR"], note: "ojo" },
      ])
    ).map((issue) => issue.code);
    expect(codes).toContain("unrecognized_keys");
  });

  it("holds an alias to the same bare-term format as a canonical term", () => {
    expect(
      issuePaths(
        withAliases([
          { term: "goma (de llanta)", locale: "es", countries: ["PR"] },
        ])
      )
    ).toContain("aliases.0.term");
  });
});

describe("canonicalTermIssue", () => {
  it.each([
    "llanta",
    "aro",
    "pastillas de freno",
    "Super Select 4WD II",
    "6G74 SOHC",
    "GDI",
  ])("accepts the bare term %j", (value) => {
    expect(canonicalTermIssue(value)).toBeNull();
  });

  it.each([
    ["", "blank"],
    ["   ", "whitespace only"],
    [" llanta", "leading space"],
    ["llanta ", "trailing space"],
    ["llanta\nrueda", "two lines"],
    ["pastillas  de freno", "double space"],
    ["llanta.", "sentence punctuation"],
    ["aro (rin)", "parenthetical"],
    ["aro / rin", "two forms in one field"],
    ["aro|rin", "two forms in one field"],
    ["123", "no letters"],
  ])("rejects %j (%s)", (value) => {
    expect(canonicalTermIssue(value)).not.toBeNull();
  });

  it("rejects a term longer than the maximum", () => {
    expect(canonicalTermIssue("a".repeat(TERM_MAX_LENGTH))).toBeNull();
    expect(canonicalTermIssue("a".repeat(TERM_MAX_LENGTH + 1))).not.toBeNull();
  });

  it("is enforced by the schema on the canonical term field", () => {
    const entry = makeGlossaryEntry();
    (entry.prose as Record<string, Record<string, string>>).es[
      CANONICAL_TERM_PROSE_FIELD
    ] = "llanta (goma)";
    expect(issuePaths(parse(entry))).toContain(
      `prose.es.${CANONICAL_TERM_PROSE_FIELD}`
    );
  });
});

describe("canonicalTermOf", () => {
  it("reads the canonical term for each locale", () => {
    const entry = makeGlossaryEntry();
    const outcome = parse(entry);
    expect(outcome.success).toBe(true);
    if (!outcome.success) return;
    expect(canonicalTermOf(outcome.data, "es")).toBe("llanta");
    expect(canonicalTermOf(outcome.data, "en")).toBe("tire");
  });
});
