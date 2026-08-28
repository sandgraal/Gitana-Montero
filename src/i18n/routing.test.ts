import { describe, expect, it } from "vitest";
import {
  DEFAULT_LOCALE,
  LOCALES,
  acceptLanguageFromNavigator,
  absoluteUrl,
  alternateLinks,
  baseHref,
  isLocale,
  localeHref,
  negotiateLocale,
  normalizeBase,
  parseAcceptLanguage,
  splitLocalePath,
  withBase,
} from "./routing";

const BASE = "/Gitana-Montero";

describe("locale set", () => {
  it("is exactly en and es (spec: never any other value)", () => {
    expect([...LOCALES]).toEqual(["en", "es"]);
    expect(DEFAULT_LOCALE).toBe("en");
  });

  it("recognizes only real locales", () => {
    expect(isLocale("en")).toBe(true);
    expect(isLocale("es")).toBe(true);
    expect(isLocale("es-CR")).toBe(false);
    expect(isLocale("fr")).toBe(false);
    expect(isLocale(undefined)).toBe(false);
  });
});

describe("base path handling", () => {
  it("normalizes every spelling of the site root to an empty prefix", () => {
    expect(normalizeBase("/")).toBe("");
    expect(normalizeBase("")).toBe("");
  });

  it("normalizes a project-pages base to a leading-slash, no-trailing-slash prefix", () => {
    expect(normalizeBase("/Gitana-Montero")).toBe(BASE);
    expect(normalizeBase("/Gitana-Montero/")).toBe(BASE);
    expect(normalizeBase("Gitana-Montero")).toBe(BASE);
  });

  it("prefixes paths with the base", () => {
    expect(withBase("/en/", BASE)).toBe("/Gitana-Montero/en/");
    expect(withBase("en/", BASE)).toBe("/Gitana-Montero/en/");
    expect(withBase("/en/", "/")).toBe("/en/");
    expect(baseHref(BASE)).toBe("/Gitana-Montero/");
  });
});

describe("localeHref", () => {
  it("builds locale-prefixed hrefs under the base path", () => {
    expect(localeHref("en", "/", BASE)).toBe("/Gitana-Montero/en/");
    expect(localeHref("es", "/", BASE)).toBe("/Gitana-Montero/es/");
    expect(localeHref("es", "/problemas/", BASE)).toBe(
      "/Gitana-Montero/es/problemas/"
    );
  });

  it("works with no base path, so moving to a custom domain changes nothing else", () => {
    expect(localeHref("en", "/", "/")).toBe("/en/");
    expect(localeHref("es", "/garage/", "/")).toBe("/es/garage/");
  });

  it("gives neither locale a shorter path than the other (I18N-01)", () => {
    const en = localeHref("en", "/", BASE);
    const es = localeHref("es", "/", BASE);
    expect(en.replace("/en/", "/xx/")).toBe(es.replace("/es/", "/xx/"));
  });
});

describe("splitLocalePath", () => {
  it("splits a served path into locale and locale-independent route", () => {
    expect(splitLocalePath("/Gitana-Montero/en/", BASE)).toEqual({
      locale: "en",
      routePath: "/",
    });
    expect(splitLocalePath("/Gitana-Montero/es/problemas/", BASE)).toEqual({
      locale: "es",
      routePath: "/problemas/",
    });
  });

  it("works whether or not the pathname carries the base", () => {
    expect(splitLocalePath("/en/garage/", BASE).routePath).toBe("/garage/");
    expect(splitLocalePath("/en/garage/", "/").routePath).toBe("/garage/");
  });

  it("reports no locale for paths outside a locale prefix", () => {
    expect(splitLocalePath("/Gitana-Montero/", BASE)).toEqual({
      locale: null,
      routePath: "/",
    });
    expect(splitLocalePath("/Gitana-Montero/404.html", BASE).locale).toBeNull();
  });
});

describe("alternateLinks (I18N-04)", () => {
  it("emits one link per locale plus x-default", () => {
    expect(alternateLinks("/", BASE)).toEqual([
      { hreflang: "en", href: "/Gitana-Montero/en/" },
      { hreflang: "es-CR", href: "/Gitana-Montero/es/" },
      { hreflang: "x-default", href: "/Gitana-Montero/en/" },
    ]);
  });

  it("keeps the pair symmetric for any route", () => {
    const links = alternateLinks("/problems/x/", BASE);
    const hrefs = Object.fromEntries(links.map((l) => [l.hreflang, l.href]));
    expect(hrefs["en"]).toBe("/Gitana-Montero/en/problems/x/");
    expect(hrefs["es-CR"]).toBe("/Gitana-Montero/es/problems/x/");
    expect(hrefs["x-default"]).toBe(hrefs["en"]);
  });
});

describe("absoluteUrl", () => {
  it("resolves against the configured site", () => {
    expect(
      absoluteUrl("/Gitana-Montero/es/", "https://sandgraal.github.io")
    ).toBe("https://sandgraal.github.io/Gitana-Montero/es/");
  });

  it("falls back to the relative href when site is unset", () => {
    expect(absoluteUrl("/Gitana-Montero/es/", undefined)).toBe(
      "/Gitana-Montero/es/"
    );
  });
});

describe("parseAcceptLanguage", () => {
  it("orders by descending q, ties by source order", () => {
    expect(
      parseAcceptLanguage("de;q=0.5, es-CR;q=0.9, en;q=0.9").map((e) => e.tag)
    ).toEqual(["es-cr", "en", "de"]);
  });

  it("drops q=0 entries, which mean 'not acceptable'", () => {
    expect(parseAcceptLanguage("es;q=0, en").map((e) => e.tag)).toEqual(["en"]);
  });
});

describe("negotiateLocale (I18N-02)", () => {
  it.each([
    ["es-CR,es;q=0.9,en;q=0.8", "es"],
    ["es-419,es;q=0.9", "es"],
    ["es", "es"],
    ["en-US,en;q=0.9", "en"],
    ["en-GB", "en"],
    ["fr-FR,fr;q=0.9,es;q=0.8", "es"],
  ] as const)("negotiates %s to %s", (header, expected) => {
    expect(negotiateLocale(header)).toBe(expected);
  });

  it.each([
    ["", "no header value"],
    ["*", "wildcard only"],
    ["de-DE,de;q=0.9", "no supported language"],
    ["zz", "nonsense tag"],
  ] as const)("falls back to /en/ for %s (%s)", (header, reason) => {
    expect(negotiateLocale(header), reason).toBe("en");
  });

  it("falls back to /en/ when there is no header at all", () => {
    expect(negotiateLocale(null)).toBe("en");
    expect(negotiateLocale(undefined)).toBe("en");
  });

  it("prefers the higher-quality language, not the first one listed", () => {
    expect(negotiateLocale("en;q=0.2, es;q=0.8")).toBe("es");
  });

  it("ignores case", () => {
    expect(negotiateLocale("ES-cr")).toBe("es");
  });
});

describe("acceptLanguageFromNavigator", () => {
  it("turns navigator.languages into a header the same negotiator can read", () => {
    const header = acceptLanguageFromNavigator(["es-CR", "es", "en-US"]);
    expect(header).toBe("es-CR,es;q=0.9,en-US;q=0.8");
    expect(negotiateLocale(header)).toBe("es");
  });

  it("falls back to navigator.language when the list is empty", () => {
    expect(negotiateLocale(acceptLanguageFromNavigator([], "es-CR"))).toBe(
      "es"
    );
  });

  it("never emits q=0, which would drop a language the visitor listed", () => {
    const many = Array.from({ length: 15 }, (_, i) => `x${i}`);
    const header = acceptLanguageFromNavigator([...many, "es"]);
    expect(header).not.toMatch(/q=0\.0/);
  });

  it("yields the default locale when the browser reports nothing", () => {
    expect(negotiateLocale(acceptLanguageFromNavigator(undefined))).toBe(
      DEFAULT_LOCALE
    );
  });
});
