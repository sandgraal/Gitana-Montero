/**
 * Implementation-side unit tests for the `community` schema (T700).
 *
 * No `[TEST]` task grades COM-01/COM-02, so these are the tests for the
 * decisions this module makes: the CLDR-backed region and language
 * vocabularies, the tag-list rules, and — most importantly — the claim in the
 * module docstring that a directory entry needs **no relaxation** of the T104
 * base contract. That claim is load-bearing (the task offered a stop-and-ask
 * to relax `fitment`/`confidence`), so it is asserted here rather than only
 * argued in a comment.
 *
 * Fixtures follow `tests/fixtures/schema-fixtures.ts`'s conventions: the
 * `.invalid` TLD (RFC 2606) so `check:links` can never mistake one for a real
 * community, and `test-schema-` ids outside the real entry-id convention.
 *
 * refs specs/001-foundation (COM-01, COM-02, I18N-06)
 */
import { describe, expect, it } from "vitest";
import { LOCALES } from "../i18n/routing";
import {
  ACTIVITY_LEVELS,
  COMMUNITY_TYPES,
  LINK_KINDS,
  WORLDWIDE_REGION,
  communitySchema,
  isLanguageTag,
  isRegionCode,
} from "./community";

/* -------------------------------------------------------------------------
 * Fixtures + helpers
 * ---------------------------------------------------------------------- */

type Entry = Record<string, unknown>;

/** A complete, valid community entry. Every test starts from a fresh copy. */
function makeCommunity(overrides: Entry = {}): Entry {
  return {
    id: "test-schema-community-alpha",
    fitment: { gens: ["gen3"] },
    communityType: "forum",
    regions: [WORLDWIDE_REGION],
    languages: ["en"],
    activity: "active",
    activityAssessed: "2026-08-28",
    url: "https://forum.example.invalid/montero",
    confidence: "first-hand",
    sources: [],
    prose: {
      en: {
        title: "TEST fixture community",
        summary: "Synthetic fixture used by the T700 community schema tests.",
        goodFor: ["Gen-3 transfer case questions"],
      },
      es: {
        title: "Comunidad de prueba TEST",
        summary: "Ficha sintética que usan las pruebas del esquema T700.",
        goodFor: ["Consultas sobre la caja de transferencia de la Gen 3"],
      },
    },
    ...overrides,
  };
}

function paths(entry: Entry): string[] {
  const outcome = communitySchema.safeParse(entry);
  return outcome.success
    ? []
    : outcome.error.issues.map((issue) => issue.path.map(String).join("."));
}

function accepts(entry: Entry): boolean {
  return communitySchema.safeParse(entry).success;
}

/* -------------------------------------------------------------------------
 * The base contract, unrelaxed — the T700 stop-and-ask that was not needed
 * ---------------------------------------------------------------------- */

describe("the T104 base contract is intact for community entries", () => {
  it("accepts a well-formed community entry", () => {
    expect(paths(makeCommunity())).toEqual([]);
  });

  it("still demands a non-empty fitment (COM-01 'generation focus')", () => {
    expect(paths(makeCommunity({ fitment: { gens: [] } }))).toContain(
      "fitment.gens"
    );
    expect(accepts(makeCommunity({ fitment: undefined }))).toBe(false);
  });

  it("still demands a confidence tier", () => {
    expect(paths(makeCommunity({ confidence: undefined }))).toContain(
      "confidence"
    );
  });

  it(
    "lets a directory entry sit at `first-hand` with no sources — the reason " +
      "no relaxation was needed",
    () => {
      expect(accepts(makeCommunity({ confidence: "first-hand" }))).toBe(true);
      expect(
        accepts(makeCommunity({ confidence: "community-consensus" }))
      ).toBe(true);
    }
  );

  it("keeps the citation-required tiers honest even here", () => {
    expect(
      paths(makeCommunity({ confidence: "fsm-confirmed", sources: [] }))
    ).toContain("sources");
  });

  it("names an unknown field rather than stripping it (SCF-04)", () => {
    const outcome = communitySchema.safeParse(
      makeCommunity({ activityLevel: "active" })
    );
    expect(outcome.success).toBe(false);
    if (outcome.success) return;
    expect(
      outcome.error.issues.flatMap((issue) => [
        ...((issue as { keys?: string[] }).keys ?? []),
      ])
    ).toContain("activityLevel");
  });
});

/* -------------------------------------------------------------------------
 * COM-01 — the tags
 * ---------------------------------------------------------------------- */

describe("community type (COM-01)", () => {
  it.each([...COMMUNITY_TYPES])("accepts `%s`", (communityType) => {
    expect(accepts(makeCommunity({ communityType }))).toBe(true);
  });

  it("rejects a type outside the vocabulary", () => {
    expect(paths(makeCommunity({ communityType: "mailing-list" }))).toContain(
      "communityType"
    );
  });

  it("requires one", () => {
    expect(paths(makeCommunity({ communityType: undefined }))).toContain(
      "communityType"
    );
  });
});

describe("activity level (COM-01)", () => {
  it.each([...ACTIVITY_LEVELS])("accepts `%s`", (activity) => {
    expect(accepts(makeCommunity({ activity }))).toBe(true);
  });

  it("is ordered busiest-first, so index comparisons are the contract", () => {
    expect(ACTIVITY_LEVELS.indexOf("very-active")).toBeLessThan(
      ACTIVITY_LEVELS.indexOf("dormant")
    );
    expect(ACTIVITY_LEVELS.indexOf("dormant")).toBeLessThan(
      ACTIVITY_LEVELS.indexOf("archived")
    );
  });

  it("requires the as-of date, in YYYY-MM-DD", () => {
    expect(paths(makeCommunity({ activityAssessed: undefined }))).toContain(
      "activityAssessed"
    );
    expect(paths(makeCommunity({ activityAssessed: "28/08/2026" }))).toContain(
      "activityAssessed"
    );
  });
});

describe("regions (COM-01)", () => {
  it.each(["CR", "MX", "US", "ES", "JP", "013", "419", "001"])(
    "accepts the assigned code `%s`",
    (code) => {
      expect(isRegionCode(code)).toBe(true);
      expect(accepts(makeCommunity({ regions: [code] }))).toBe(true);
    }
  );

  // As with languages, the parenthetical names the gate that does the work.
  // Only the two "assignment gate" rows depend on the running Node's CLDR
  // data; the rest are decided before `Intl` is consulted.
  it.each([
    ["cr", "shape gate — wrong case"],
    ["CRI", "shape gate — alpha-3, not alpha-2"],
    ["costa-rica", "shape gate — a slug, not a code"],
    ["", "shape gate — blank"],
    ["ZZ", "excluded by name — CLDR's unknown-region placeholder"],
    ["UK", "canonicality gate — a non-canonical alias of GB"],
    ["XX", "assignment gate — unassigned"],
    ["999", "assignment gate — unassigned"],
  ])("rejects `%s` (%s)", (code) => {
    expect(isRegionCode(code)).toBe(false);
    expect(paths(makeCommunity({ regions: [code] }))).toContain("regions.0");
  });

  it("requires at least one", () => {
    expect(paths(makeCommunity({ regions: [] }))).toContain("regions");
  });

  it("names the duplicate by index rather than silently deduping", () => {
    expect(paths(makeCommunity({ regions: ["CR", "MX", "CR"] }))).toContain(
      "regions.2"
    );
  });
});

describe("languages (COM-01) — data about the community, not the site Locale", () => {
  it.each(["en", "es", "pt", "ja", "th", "ar", "es-CR", "pt-BR", "zh-Hans"])(
    "accepts the language tag `%s`",
    (tag) => {
      expect(isLanguageTag(tag)).toBe(true);
      expect(accepts(makeCommunity({ languages: [tag] }))).toBe(true);
    }
  );

  // The parenthetical names the gate that actually rejects each value, in the
  // order `isLanguageTag` applies them. Only `zz` gets as far as the
  // ICU/CLDR-backed assignment gate; everything else dies at the shape gate,
  // before any `Intl` call. That distinction is the point of the pinning: an
  // ICU upgrade can only move the `zz` row.
  it.each([
    ["EN", "shape gate — wrong case"],
    ["spanish", "shape gate — a language name, not a tag"],
    ["es_CR", "shape gate — underscore, not a hyphen"],
    ["es-cr", "shape gate — the pattern requires an uppercase region subtag"],
    ["en-US-u-ca-gregory", "shape gate — extension subtags are not a language"],
    ["", "shape gate — blank"],
    ["zz", "assignment gate — CLDR assigns no such language"],
  ])("rejects `%s` (%s)", (tag) => {
    expect(isLanguageTag(tag)).toBe(false);
    expect(paths(makeCommunity({ languages: [tag] }))).toContain("languages.0");
  });

  it("relies on the shape gate, not Intl, for the near-miss tags", () => {
    // `Intl` on its own would wave both of these through: `es-cr` canonicalises
    // to a real tag and `en-US-u-ca-gregory` names a real locale. They are
    // rejected because `LANGUAGE_TAG_PATTERN` runs first, which is what keeps
    // an ICU upgrade from being able to change the answer for either.
    for (const tag of ["es-cr", "en-US-u-ca-gregory"]) {
      expect(() => Intl.getCanonicalLocales(tag), tag).not.toThrow();
      expect(isLanguageTag(tag), tag).toBe(false);
    }
    expect(Intl.getCanonicalLocales("es-cr")[0]).toBe("es-CR");
  });

  it("requires at least one", () => {
    expect(paths(makeCommunity({ languages: [] }))).toContain("languages");
  });

  it("rejects duplicates by index", () => {
    expect(paths(makeCommunity({ languages: ["es", "es"] }))).toContain(
      "languages.1"
    );
  });

  it(
    "accepts a community in a language this site is not published in — the " +
      "vocabulary is not `Locale`",
    () => {
      expect(accepts(makeCommunity({ languages: ["ja"] }))).toBe(true);
      expect(accepts(makeCommunity({ languages: ["th", "en"] }))).toBe(true);
    }
  );

  it("still recognises every site locale as a language tag", () => {
    for (const locale of LOCALES) {
      expect(isLanguageTag(locale), locale).toBe(true);
    }
  });
});

describe("links (COM-01)", () => {
  it("requires a canonical http(s) url", () => {
    expect(paths(makeCommunity({ url: undefined }))).toContain("url");
    // The protocol check is the point: `.url()` alone parses this happily and
    // we would render it into an anchor (see `httpUrlSchema` in `entry.ts`).
    expect(paths(makeCommunity({ url: "javascript:alert(1)" }))).toContain(
      "url"
    );
    expect(paths(makeCommunity({ url: "forum.example.invalid" }))).toContain(
      "url"
    );
  });

  it("treats `links` as optional", () => {
    expect(accepts(makeCommunity())).toBe(true);
  });

  it.each([...LINK_KINDS])("accepts a `%s` link", (kind) => {
    expect(
      accepts(
        makeCommunity({
          links: [{ kind, url: "https://other.example.invalid/x" }],
        })
      )
    ).toBe(true);
  });

  it("rejects a link kind outside the vocabulary", () => {
    expect(
      paths(
        makeCommunity({
          links: [{ kind: "myspace", url: "https://x.example.invalid" }],
        })
      )
    ).toContain("links.0.kind");
  });

  it("carries no label field — link text belongs to the UI strings module", () => {
    const outcome = communitySchema.safeParse(
      makeCommunity({
        links: [
          {
            kind: "discord",
            url: "https://chat.example.invalid",
            label: "Join us",
          },
        ],
      })
    );
    expect(outcome.success).toBe(false);
  });

  it("rejects a link that repeats the canonical url, naming the index", () => {
    const url = "https://forum.example.invalid/montero";
    expect(
      paths(makeCommunity({ url, links: [{ kind: "forum", url }] }))
    ).toContain("links.0.url");
  });

  it("rejects two links sharing a url, naming the later index", () => {
    // The other half of de-duplication: neither link is the canonical `url`,
    // so only the in-array check can catch this. Same destination filed under
    // two kinds is the realistic way it arrives.
    const url = "https://chat.example.invalid/cr";
    const paths_ = paths(
      makeCommunity({
        links: [
          { kind: "discord", url },
          { kind: "whatsapp", url },
        ],
      })
    );
    expect(paths_).toContain("links.1.url");
    expect(paths_).not.toContain("links.0.url");
  });

  it("names every later duplicate, not just the first", () => {
    const url = "https://video.example.invalid/channel";
    const found = paths(
      makeCommunity({
        links: [
          { kind: "youtube", url },
          { kind: "website", url },
          { kind: "facebook", url },
        ],
      })
    );
    expect(found).toContain("links.1.url");
    expect(found).toContain("links.2.url");
  });

  it("allows a different url of the same kind", () => {
    expect(
      accepts(
        makeCommunity({
          links: [
            { kind: "youtube", url: "https://video.example.invalid/a" },
            { kind: "youtube", url: "https://video.example.invalid/b" },
          ],
        })
      )
    ).toBe(true);
  });
});

/* -------------------------------------------------------------------------
 * COM-01 prose + COM-02
 * ---------------------------------------------------------------------- */

describe("prose (COM-01 'what it's good for', I18N-06)", () => {
  it("keeps the base prose fields required", () => {
    const entry = makeCommunity();
    const prose = entry.prose as Record<string, Record<string, unknown>>;
    delete prose.en.title;
    expect(paths(entry)).toContain("prose.en.title");

    const other = makeCommunity();
    const otherProse = other.prose as Record<string, Record<string, unknown>>;
    delete otherProse.es.summary;
    expect(paths(other)).toContain("prose.es.summary");
  });

  it.each(["en", "es"])("requires `goodFor` in prose.%s", (locale) => {
    const entry = makeCommunity();
    const prose = entry.prose as Record<string, Record<string, unknown>>;
    delete prose[locale].goodFor;
    expect(paths(entry)).toContain(`prose.${locale}.goodFor`);
  });

  it.each(["en", "es"])(
    "rejects an empty `goodFor` list in prose.%s",
    (locale) => {
      const entry = makeCommunity();
      const prose = entry.prose as Record<string, Record<string, unknown>>;
      prose[locale].goodFor = [];
      expect(paths(entry)).toContain(`prose.${locale}.goodFor`);
    }
  );

  it("rejects a whitespace-only bullet — a stub is not a translation", () => {
    const entry = makeCommunity();
    const prose = entry.prose as Record<string, Record<string, unknown>>;
    prose.es.goodFor = ["   "];
    expect(paths(entry)).toContain("prose.es.goodFor.0");
  });

  it("allows the locales a different number of bullets", () => {
    const entry = makeCommunity();
    const prose = entry.prose as Record<string, Record<string, unknown>>;
    prose.en.goodFor = ["Transfer case", "Timing belt", "Rust"];
    prose.es.goodFor = ["Caja de transferencia"];
    expect(accepts(entry)).toBe(true);
  });
});

describe("COM-02 — Spanish-language and Central American entries are first-class", () => {
  const anglophone = makeCommunity({
    id: "test-schema-community-en",
    regions: ["US"],
    languages: ["en"],
  });

  const costaRican = makeCommunity({
    id: "test-schema-community-cr",
    communityType: "facebook-group",
    regions: ["CR", "013"],
    languages: ["es-CR"],
  });

  it("accepts both with no field distinguishing them structurally", () => {
    expect(paths(anglophone)).toEqual([]);
    expect(paths(costaRican)).toEqual([]);
  });

  it("has no default that would make an ES-only entry the exception", () => {
    // Both tags are required with no default, so neither entry inherits `en`
    // or a US region by omission — the appendix shape is unrepresentable.
    expect(paths(makeCommunity({ languages: undefined }))).toContain(
      "languages"
    );
    expect(paths(makeCommunity({ regions: undefined }))).toContain("regions");
  });

  it("accepts a Costa Rican shop, the vendor/shop end of COM-01", () => {
    expect(
      accepts(
        makeCommunity({
          communityType: "shop",
          regions: ["CR"],
          languages: ["es-CR"],
          activity: "very-active",
          confidence: "community-consensus",
          links: [{ kind: "map", url: "https://maps.example.invalid/taller" }],
        })
      )
    ).toBe(true);
  });
});
