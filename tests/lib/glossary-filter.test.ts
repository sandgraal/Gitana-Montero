/**
 * Graders — the glossary page's filter rules (GLO-04).
 *
 * The `.astro` `<script>` around these is DOM wiring only, so everything the
 * filter actually *decides* is gradeable here without a browser. Haystacks in
 * the fixtures are pre-normalized exactly as the page renders them (through
 * `normalizeForSearch`), so a test cannot pass on a haystack the page would
 * never produce.
 *
 * refs specs/001-foundation (GLO-04, SRCH-02)
 */
import { describe, expect, it } from "vitest";

import {
  buildHaystack,
  countMatches,
  formatCount,
  matchesFilter,
} from "../../src/lib/glossary-filter.ts";
import { normalizeForSearch } from "../../src/lib/text.ts";

const card = (system: string, text: string) => ({
  system,
  haystack: normalizeForSearch(text),
});

const cards = [
  card("wheels-tires", "llanta tire goma neumático PR DO"),
  card("wheels-tires", "aro wheel rin MX CO"),
  card("brakes", "pastillas de freno brake pads balatas MX"),
];

const all = { system: "", query: "" };

describe("matchesFilter", () => {
  it("shows everything in the initial state — the set the server rendered", () => {
    expect(cards.every((entry) => matchesFilter(entry, all))).toBe(true);
  });

  it("keeps only the chosen system", () => {
    expect(countMatches(cards, { system: "brakes", query: "" })).toBe(1);
    expect(countMatches(cards, { system: "wheels-tires", query: "" })).toBe(2);
  });

  it('treats the empty system as "no filter", not as a system named ""', () => {
    expect(countMatches(cards, { system: "", query: "" })).toBe(cards.length);
  });

  it("finds a term by a regional alias (SRCH-02's shape)", () => {
    expect(countMatches(cards, { system: "", query: "rin" })).toBe(1);
    expect(countMatches(cards, { system: "", query: "balatas" })).toBe(1);
  });

  it("finds a term by its English word as well as its Spanish one", () => {
    expect(countMatches(cards, { system: "", query: "brake pads" })).toBe(1);
    expect(countMatches(cards, { system: "", query: "pastillas" })).toBe(1);
  });

  it("ignores case and accents in the query", () => {
    expect(countMatches(cards, { system: "", query: "NEUMATICO" })).toBe(1);
    expect(countMatches(cards, { system: "", query: "neumático" })).toBe(1);
  });

  it("matches mid-word, unlike the merge-blocking conformance scan", () => {
    // A person typing four letters wants results; a gate firing on four
    // letters would be a false positive. Different jobs, different rules.
    expect(countMatches(cards, { system: "", query: "neum" })).toBe(1);
  });

  it("ands the two halves together", () => {
    expect(countMatches(cards, { system: "brakes", query: "rin" })).toBe(0);
    expect(countMatches(cards, { system: "wheels-tires", query: "rin" })).toBe(
      1
    );
  });

  it("returns nothing for a query that matches nothing", () => {
    expect(countMatches(cards, { system: "", query: "carburador" })).toBe(0);
  });

  it("treats a whitespace-only query as empty", () => {
    expect(countMatches(cards, { system: "", query: "   " })).toBe(
      cards.length
    );
  });
});

describe("buildHaystack", () => {
  // T205 follow-up (SCF-06): the page no longer ships a server-rendered
  // `data-haystack` attribute — the client derives it from the rendered
  // card's own text via this function. These graders are the recall
  // guarantee that removal must not break: every alias, in every locale,
  // with every country tag, still matches.
  const source = {
    terms: ["Brake pad", "Pastilla de freno"],
    definitions: [
      "The friction material that presses on the rotor.",
      "El material de fricción que presiona el disco.",
    ],
    system: "Brakes",
    aliases: [
      { term: "balatas", countries: "MX" },
      { term: "pastillas", countries: "CR/DO" },
    ],
  };

  it("finds a country-tagged alias regardless of locale", () => {
    expect(buildHaystack(source)).toContain(normalizeForSearch("balatas"));
    expect(
      matchesFilter(
        { system: "brakes", haystack: buildHaystack(source) },
        { system: "", query: "balatas" }
      )
    ).toBe(true);
  });

  it("finds every alias's country tags, including a multi-country chip", () => {
    const haystack = buildHaystack(source);
    expect(haystack).toContain(normalizeForSearch("MX"));
    expect(haystack).toContain(normalizeForSearch("CR"));
    expect(haystack).toContain(normalizeForSearch("DO"));
  });

  it("finds a multi-country chip both as rendered and as separate tokens", () => {
    // The chip renders "CR/DO" (joined with "/", which normalizeForSearch
    // does not treat as whitespace). A query typed as the rendered text
    // and a query typed as space-separated codes must both find it.
    const haystack = buildHaystack(source);
    expect(haystack).toContain(normalizeForSearch("CR/DO"));
    expect(
      matchesFilter(
        { system: "brakes", haystack },
        { system: "", query: "CR DO" }
      )
    ).toBe(true);
  });

  it("finds both locales' term and definition text", () => {
    const haystack = buildHaystack(source);
    expect(haystack).toContain(normalizeForSearch("brake pad"));
    expect(haystack).toContain(normalizeForSearch("pastilla de freno"));
    expect(haystack).toContain(normalizeForSearch("rotor"));
    expect(haystack).toContain(normalizeForSearch("disco"));
  });

  it("finds the rendered system label", () => {
    expect(buildHaystack(source)).toContain(normalizeForSearch("Brakes"));
  });

  it("ignores case, same as the rest of the filter", () => {
    expect(buildHaystack(source)).toBe(
      buildHaystack({
        ...source,
        terms: source.terms.map((term) => term.toUpperCase()),
      })
    );
  });

  it("produces nothing for a term with no aliases", () => {
    const haystack = buildHaystack({ ...source, aliases: [] });
    expect(haystack).not.toContain("balatas");
    expect(haystack).toContain(normalizeForSearch("brake pad"));
  });
});

describe("formatCount", () => {
  it("fills both placeholders", () => {
    expect(formatCount("Showing {shown} of {total} terms", 2, 150)).toBe(
      "Showing 2 of 150 terms"
    );
  });

  it("works on the ES template, whose word order differs", () => {
    expect(formatCount("Mostrando {shown} de {total} términos", 0, 3)).toBe(
      "Mostrando 0 de 3 términos"
    );
  });

  it("leaves a template with no placeholders alone", () => {
    expect(formatCount("Sin resultados", 0, 0)).toBe("Sin resultados");
  });
});
