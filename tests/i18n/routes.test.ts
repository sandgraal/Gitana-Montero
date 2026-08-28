/**
 * Graders — the per-locale collection route registry (I18N-01, I18N-04,
 * I18N-05) and the per-locale hreflang set it feeds.
 *
 * The bug these exist to catch is not visible in review: a page served at
 * `/es/glosario/` whose hreflang says `/es/glossary/` looks correct in the
 * diff, builds green, and points search engines and the locale switcher at a
 * URL that was never written. `check:hreflang` catches it in `dist/`; these
 * catch it a build earlier.
 *
 * refs specs/001-foundation (I18N-01, I18N-04, I18N-05, GLO-04)
 */
import { describe, expect, it } from "vitest";

import {
  COLLECTION_ROUTE_SEGMENTS,
  collectionRouteParams,
  collectionRoutePath,
  collectionRoutePaths,
} from "../../src/i18n/routes.ts";
import {
  LOCALES,
  localizedAlternateLinks,
  alternateLinks,
  sameRouteInEveryLocale,
} from "../../src/i18n/routing.ts";
import { validateSlugRegistry } from "../../src/schemas/slugs.ts";

describe("COLLECTION_ROUTE_SEGMENTS", () => {
  it("is a valid registry under the same rule entry slugs follow", () => {
    expect(
      validateSlugRegistry({ "collection-routes": COLLECTION_ROUTE_SEGMENTS })
    ).toEqual([]);
  });

  it("gives every registered collection a segment in every locale", () => {
    for (const [collection, segments] of Object.entries(
      COLLECTION_ROUTE_SEGMENTS
    )) {
      for (const locale of LOCALES) {
        expect(segments[locale], `${collection}/${locale}`).toBeTruthy();
      }
    }
  });

  it("uses url-safe lowercase segments", () => {
    for (const segments of Object.values(COLLECTION_ROUTE_SEGMENTS)) {
      for (const segment of Object.values(segments)) {
        expect(segment).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
      }
    }
  });

  it("translates the glossary segment rather than reusing the English word", () => {
    // I18N-01: neither locale is privileged, including in the URL bar.
    expect(COLLECTION_ROUTE_SEGMENTS.glossary.en).toBe("glossary");
    expect(COLLECTION_ROUTE_SEGMENTS.glossary.es).toBe("glosario");
  });
});

describe("collectionRoutePath", () => {
  it("returns a rooted, trailing-slashed, locale-independent route", () => {
    expect(collectionRoutePath("glossary", "en")).toBe("/glossary/");
    expect(collectionRoutePath("glossary", "es")).toBe("/glosario/");
  });
});

describe("collectionRoutePaths", () => {
  it("returns one route per locale", () => {
    expect(collectionRoutePaths("glossary")).toEqual({
      en: "/glossary/",
      es: "/glosario/",
    });
  });
});

describe("collectionRouteParams", () => {
  it("builds one getStaticPaths row per locale, carrying that locale's segment", () => {
    expect(collectionRouteParams("glossary", "glossarySegment")).toEqual([
      { params: { locale: "en", glossarySegment: "glossary" } },
      { params: { locale: "es", glossarySegment: "glosario" } },
    ]);
  });
});

describe("localizedAlternateLinks", () => {
  const base = "/Gitana-Montero";

  it("points each hreflang at the URL that locale is actually served at", () => {
    expect(
      localizedAlternateLinks(collectionRoutePaths("glossary"), base)
    ).toEqual([
      { hreflang: "en", href: "/Gitana-Montero/en/glossary/" },
      { hreflang: "es", href: "/Gitana-Montero/es/glosario/" },
      { hreflang: "x-default", href: "/Gitana-Montero/en/glossary/" },
    ]);
  });

  it("never emits the other locale's segment for a locale", () => {
    const hrefs = localizedAlternateLinks(
      collectionRoutePaths("glossary"),
      base
    ).map((link) => link.href);
    expect(hrefs).not.toContain("/Gitana-Montero/es/glossary/");
    expect(hrefs).not.toContain("/Gitana-Montero/en/glosario/");
  });

  it("agrees with alternateLinks when the route is the same in every locale", () => {
    expect(localizedAlternateLinks(sameRouteInEveryLocale("/"), base)).toEqual(
      alternateLinks("/", base)
    );
  });
});

describe("sameRouteInEveryLocale", () => {
  it("maps every locale to the one route", () => {
    expect(sameRouteInEveryLocale("/garage/")).toEqual({
      en: "/garage/",
      es: "/garage/",
    });
  });

  it("defaults to the site root", () => {
    expect(sameRouteInEveryLocale()).toEqual({ en: "/", es: "/" });
  });
});
