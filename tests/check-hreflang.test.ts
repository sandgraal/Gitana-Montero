import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { auditDist, parseAlternates } from "../scripts/check-hreflang.mjs";

const SITE = "https://sandgraal.github.io";
const BASE = "/Gitana-Montero";
const LOCALES = ["en", "es"];

const created: string[] = [];

afterEach(async () => {
  await Promise.all(
    created.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))
  );
});

interface PageSpec {
  /** Absolute hrefs keyed by hreflang value. */
  alternates?: Record<string, string>;
  canonical?: string;
  lang?: string;
}

function page({ alternates = {}, canonical, lang = "en" }: PageSpec): string {
  const links = Object.entries(alternates)
    .map(
      ([hreflang, href]) =>
        `<link rel="alternate" hreflang="${hreflang}" href="${href}">`
    )
    .join("");
  const canonicalTag = canonical
    ? `<link rel="canonical" href="${canonical}">`
    : "";
  return `<!DOCTYPE html><html lang="${lang}"><head>${canonicalTag}${links}</head><body></body></html>`;
}

const EN_URL = `${SITE}${BASE}/en/`;
const ES_URL = `${SITE}${BASE}/es/`;

function healthyPair(): Record<string, string> {
  return { en: EN_URL, es: ES_URL, "x-default": EN_URL };
}

async function buildDist(files: Record<string, string>): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "hreflang-"));
  created.push(dir);
  for (const [relative, html] of Object.entries(files)) {
    const full = path.join(dir, relative);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, html, "utf8");
  }
  return dir;
}

async function audit(files: Record<string, string>): Promise<string[]> {
  const distDir = await buildDist(files);
  return auditDist({ distDir, base: BASE, site: SITE, locales: LOCALES });
}

const ROOT_SHIM = `<!DOCTYPE html><html lang="en"><head></head><body></body></html>`;
const NOT_FOUND = `<!DOCTYPE html><html lang="en"><head></head><body></body></html>`;

function siteWith(
  overrides: Record<string, string> = {}
): Record<string, string> {
  return {
    "index.html": ROOT_SHIM,
    "404.html": NOT_FOUND,
    "en/index.html": page({
      alternates: healthyPair(),
      canonical: EN_URL,
      lang: "en",
    }),
    "es/index.html": page({
      alternates: healthyPair(),
      canonical: ES_URL,
      lang: "es-CR",
    }),
    ...overrides,
  };
}

describe("parseAlternates", () => {
  it("reads rel=alternate links and ignores everything else", () => {
    const html = page({ alternates: healthyPair(), canonical: EN_URL });
    expect(parseAlternates(html)).toEqual([
      { hreflang: "en", href: EN_URL },
      { hreflang: "es", href: ES_URL },
      { hreflang: "x-default", href: EN_URL },
    ]);
  });
});

describe("auditDist (I18N-04)", () => {
  it("passes a site whose pages carry a symmetric pair plus x-default", async () => {
    expect(await audit(siteWith())).toEqual([]);
  });

  it("fails when a page has no hreflang links at all", async () => {
    const problems = await audit(
      siteWith({ "es/index.html": page({ canonical: ES_URL, lang: "es-CR" }) })
    );
    expect(problems.join("\n")).toMatch(
      /dist\/es\/index\.html: no hreflang links/
    );
  });

  it("fails when one locale is missing from the set", async () => {
    const partial = { en: EN_URL, "x-default": EN_URL };
    const problems = await audit(
      siteWith({
        "en/index.html": page({ alternates: partial, canonical: EN_URL }),
        "es/index.html": page({
          alternates: partial,
          canonical: ES_URL,
          lang: "es-CR",
        }),
      })
    );
    expect(problems.join("\n")).toMatch(
      /missing hreflang alternate for the "es" locale/
    );
  });

  it("fails when x-default is missing", async () => {
    const noDefault = { en: EN_URL, es: ES_URL };
    const problems = await audit(
      siteWith({
        "en/index.html": page({ alternates: noDefault, canonical: EN_URL }),
        "es/index.html": page({
          alternates: noDefault,
          canonical: ES_URL,
          lang: "es-CR",
        }),
      })
    );
    expect(problems.join("\n")).toMatch(/missing the x-default hreflang link/);
  });

  it("fails when the pair is asymmetric", async () => {
    const problems = await audit(
      siteWith({
        "es/index.html": page({
          alternates: { en: EN_URL, es: ES_URL, "x-default": ES_URL },
          canonical: ES_URL,
          lang: "es-CR",
        }),
      })
    );
    expect(problems.join("\n")).toMatch(/asymmetric hreflang/);
  });

  it("fails when an alternate points at a page that was never built", async () => {
    const dangling = {
      en: EN_URL,
      es: `${SITE}${BASE}/es/nope/`,
      "x-default": EN_URL,
    };
    const problems = await audit(
      siteWith({
        "en/index.html": page({ alternates: dangling, canonical: EN_URL }),
        "es/index.html": page({
          alternates: dangling,
          canonical: ES_URL,
          lang: "es-CR",
        }),
      })
    );
    expect(problems.join("\n")).toMatch(/which was not built/);
  });

  it("fails when the hreflang labels are swapped", async () => {
    const swapped = { en: ES_URL, es: EN_URL, "x-default": ES_URL };
    const problems = await audit(
      siteWith({
        "en/index.html": page({ alternates: swapped, canonical: EN_URL }),
        "es/index.html": page({
          alternates: swapped,
          canonical: ES_URL,
          lang: "es-CR",
        }),
      })
    );
    expect(problems.join("\n")).toMatch(
      /declares hreflang="en" but points at the "es" locale/
    );
  });

  it("fails when a page does not reference itself", async () => {
    const otherEn = `${SITE}${BASE}/en/otra/`;
    const notSelf = { en: otherEn, es: ES_URL, "x-default": otherEn };
    const problems = await audit(
      siteWith({
        "en/otra/index.html": page({ alternates: notSelf, canonical: otherEn }),
        "en/index.html": page({ alternates: notSelf, canonical: EN_URL }),
        "es/index.html": page({
          alternates: notSelf,
          canonical: ES_URL,
          lang: "es-CR",
        }),
      })
    );
    expect(problems.join("\n")).toMatch(
      /hreflang sets must be self-referencing/
    );
  });

  it("fails when hrefs are relative even though site is configured", async () => {
    const relative = {
      en: `${BASE}/en/`,
      es: `${BASE}/es/`,
      "x-default": `${BASE}/en/`,
    };
    const problems = await audit(
      siteWith({
        "en/index.html": page({ alternates: relative, canonical: EN_URL }),
        "es/index.html": page({
          alternates: relative,
          canonical: ES_URL,
          lang: "es-CR",
        }),
      })
    );
    expect(problems.join("\n")).toMatch(/href is relative/);
  });

  it("fails when the canonical link does not point at the page itself", async () => {
    const problems = await audit(
      siteWith({
        "es/index.html": page({
          alternates: healthyPair(),
          canonical: EN_URL,
          lang: "es-CR",
        }),
      })
    );
    expect(problems.join("\n")).toMatch(
      /canonical is .* which is not this page/
    );
  });

  it("fails when a new page is added outside any locale prefix", async () => {
    const problems = await audit(
      siteWith({
        "about/index.html": page({ canonical: `${SITE}${BASE}/about/` }),
      })
    );
    expect(problems.join("\n")).toMatch(/which is under no locale prefix/);
  });

  it("fails when a locale ships no pages at all — both or neither", async () => {
    const enOnly = { en: EN_URL, es: ES_URL, "x-default": EN_URL };
    const distDir = await buildDist({
      "index.html": ROOT_SHIM,
      "404.html": NOT_FOUND,
      "en/index.html": page({ alternates: enOnly, canonical: EN_URL }),
    });
    const problems = await auditDist({
      distDir,
      base: BASE,
      site: SITE,
      locales: LOCALES,
    });
    expect(problems.join("\n")).toMatch(
      /no pages were built for the "es" locale/
    );
  });

  it("exempts the root shim and 404 page, but only while they emit no alternates", async () => {
    const problems = await audit(
      siteWith({
        "404.html": page({ alternates: healthyPair(), lang: "en" }),
      })
    );
    expect(problems.join("\n")).toMatch(/exempt from hreflang/);
  });

  it("fails when a page has no lang attribute", async () => {
    const problems = await audit({
      ...siteWith(),
      "index.html": `<!DOCTYPE html><html><head></head><body></body></html>`,
    });
    expect(problems.join("\n")).toMatch(/<html> has no lang attribute/);
  });

  it("accepts a region-tagged label, matching on the primary subtag", async () => {
    const regional = { en: EN_URL, "es-CR": ES_URL, "x-default": EN_URL };
    const problems = await audit(
      siteWith({
        "en/index.html": page({ alternates: regional, canonical: EN_URL }),
        "es/index.html": page({
          alternates: regional,
          canonical: ES_URL,
          lang: "es-CR",
        }),
      })
    );
    expect(problems).toEqual([]);
  });

  it("fails hard when astro.config.mjs has no site (I18N-04 says SHALL fail)", async () => {
    const distDir = await buildDist(siteWith());
    const problems = await auditDist({
      distDir,
      base: BASE,
      site: null,
      locales: LOCALES,
    });
    expect(problems.join("\n")).toMatch(/has no `site`/);
  });

  it("reports a missing dist directory instead of passing vacuously", async () => {
    const problems = await auditDist({
      distDir: path.join(tmpdir(), "definitely-not-built-hreflang"),
      base: BASE,
      site: SITE,
      locales: LOCALES,
    });
    expect(problems.join("\n")).toMatch(/dist directory not found/);
  });
});
