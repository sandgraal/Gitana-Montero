/**
 * Graders — the per-locale slug registry.
 *
 * I18N-05: "WHERE a collection page has per-locale slugs (e.g.
 * `/en/problems/…`, `/es/problemas/…`), THE slug registry SHALL map each
 * entry to exactly one slug per locale, and a CI check SHALL fail on
 * collisions or missing mappings."
 *
 * `validateSlugRegistry` is the pure core of that check: it *returns* every
 * violation rather than throwing on the first, so the CI check (T105) can
 * report a whole bad registry in one run. The contract, including the exact
 * scope of a collision, is documented on the seam in `src/schemas/slugs.ts`.
 *
 * The three positive controls matter as much as the negatives here, because
 * an over-eager uniqueness rule is just as broken as a missing one:
 * cross-collection reuse is legal, and an entry whose EN and ES slugs are
 * identical is legal (plenty of part slugs are the same word in both
 * languages).
 *
 * ## Expected-failure convention
 *
 * `it.fails` is the marker; T104 activates a grader by deleting exactly that
 * `.fails`. Full note in
 * `tests/schemas/prose-locale-completeness.test.ts`.
 *
 * refs specs/001-foundation (I18N-05)
 */
import { describe, expect, it } from "vitest";
import { validateSlugRegistry } from "../../src/schemas/slugs.ts";
import type { SlugRegistry } from "../../src/schemas/slugs.ts";

const soundRegistry: SlugRegistry = {
  problems: {
    "test-schema-alpha": { en: "test-alpha-problem", es: "problema-alfa" },
    "test-schema-beta": { en: "test-beta-problem", es: "problema-beta" },
  },
  parts: {
    "test-schema-gamma": { en: "test-gamma-part", es: "repuesto-gama" },
  },
};

const codesOf = (registry: SlugRegistry) =>
  validateSlugRegistry(registry).map((issue) => issue.code);

describe("slug registry — positive controls", () => {
  it.fails("reports no issue for a complete, collision-free registry", () => {
    expect(validateSlugRegistry(soundRegistry)).toEqual([]);
  });

  it.fails("reports no issue for an empty registry", () => {
    expect(validateSlugRegistry({})).toEqual([]);
  });

  it.fails(
    "allows one entry to use the same slug in both locales (many part " +
      "slugs are the same word in EN and ES)",
    () => {
      expect(
        validateSlugRegistry({
          parts: {
            "test-schema-gamma": { en: "test-radiador", es: "test-radiador" },
          },
        })
      ).toEqual([]);
    }
  );

  it.fails(
    "allows two collections to reuse a slug — the collection segment " +
      "disambiguates /en/parts/x from /en/problems/x",
    () => {
      expect(
        validateSlugRegistry({
          problems: {
            "test-schema-alpha": { en: "test-shared", es: "test-compartido" },
          },
          parts: {
            "test-schema-gamma": { en: "test-shared", es: "test-compartido" },
          },
        })
      ).toEqual([]);
    }
  );
});

describe("slug registry — missing mappings (I18N-05)", () => {
  it.fails.each([
    ["es", { en: "test-alpha-problem" }],
    ["en", { es: "problema-alfa" }],
  ])("flags an entry with no %s slug", (locale, slugs) => {
    const issues = validateSlugRegistry({
      problems: { "test-schema-alpha": slugs },
    });

    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      code: "missing-slug",
      collection: "problems",
      entryId: "test-schema-alpha",
      locale,
    });
  });

  it.fails(
    "flags an entry with no slugs at all as two missing mappings",
    () => {
      const issues = validateSlugRegistry({
        problems: { "test-schema-alpha": {} },
      });

      expect(issues).toHaveLength(2);
      expect(issues.map((issue) => issue.locale).sort()).toEqual(["en", "es"]);
    }
  );

  it.fails.each(["", "   ", "\t"])(
    "treats the blank slug %j as missing, not as a slug",
    (slug) => {
      const issues = validateSlugRegistry({
        problems: { "test-schema-alpha": { en: slug, es: "problema-alfa" } },
      });

      expect(issues).toHaveLength(1);
      expect(issues[0]).toMatchObject({
        code: "missing-slug",
        locale: "en",
        entryId: "test-schema-alpha",
      });
    }
  );
});

describe("slug registry — collisions (I18N-05)", () => {
  it.fails.each(["en", "es"])(
    "flags two entries claiming the same %s slug in one collection",
    (locale) => {
      const clash = "test-colision";
      const issues = validateSlugRegistry({
        problems: {
          "test-schema-alpha": {
            en: locale === "en" ? clash : "test-alpha-problem",
            es: locale === "es" ? clash : "problema-alfa",
          },
          "test-schema-beta": {
            en: locale === "en" ? clash : "test-beta-problem",
            es: locale === "es" ? clash : "problema-beta",
          },
        },
      });

      expect(issues).toHaveLength(1);
      expect(issues[0]).toMatchObject({
        code: "duplicate-slug",
        collection: "problems",
        locale,
      });
      expect([issues[0]?.entryId, issues[0]?.conflictsWith].sort()).toEqual([
        "test-schema-alpha",
        "test-schema-beta",
      ]);
    }
  );

  it.fails(
    "does not treat a cross-locale slug repeat as a collision — " +
      "/en/x and /es/x are different URLs",
    () => {
      expect(
        codesOf({
          problems: {
            "test-schema-alpha": { en: "test-alfa", es: "test-beta" },
            "test-schema-beta": { en: "test-beta", es: "test-alfa" },
          },
        })
      ).toEqual([]);
    }
  );
});

describe("slug registry — locale keys (spec §2)", () => {
  it.fails("flags a locale key outside en/es", () => {
    const issues = validateSlugRegistry({
      problems: {
        "test-schema-alpha": {
          en: "test-alpha-problem",
          es: "problema-alfa",
          pt: "problema-alfa-pt",
        },
      },
    });

    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({
      code: "unknown-locale",
      collection: "problems",
      entryId: "test-schema-alpha",
      locale: "pt",
    });
  });
});

describe("slug registry — reporting", () => {
  it.fails(
    "returns every violation in one pass rather than the first one",
    () => {
      const issues = validateSlugRegistry({
        problems: {
          "test-schema-alpha": { en: "test-colision" },
          "test-schema-beta": { en: "test-colision", es: "" },
        },
      });

      expect(issues.length).toBeGreaterThanOrEqual(3);
      expect(new Set(issues.map((issue) => issue.code))).toEqual(
        new Set(["missing-slug", "duplicate-slug"])
      );
    }
  );

  it.fails("names the collection and entry on every issue it reports", () => {
    const issues = validateSlugRegistry({
      problems: { "test-schema-alpha": { en: "test-alpha-problem" } },
      parts: { "test-schema-gamma": { es: "repuesto-gama" } },
    });

    expect(issues).toHaveLength(2);
    for (const issue of issues) {
      expect(issue.collection).toMatch(/^(problems|parts)$/);
      expect(issue.entryId).toMatch(/^test-schema-/);
      expect(issue.message).toEqual(expect.any(String));
      expect(issue.message.length).toBeGreaterThan(0);
    }
  });
});
