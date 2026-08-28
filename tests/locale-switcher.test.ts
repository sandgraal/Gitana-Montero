/**
 * Rendered-markup contract for the locale switcher (I18N-03), and for the two
 * other places the site forks by language: the 404 page and the root redirect
 * shim (I18N-02, I18N-08).
 *
 * ## Why this file exists (T102 review, finding L9)
 *
 * `src/i18n/routing.ts` and `src/i18n/locale-preference.ts` are unit-tested
 * thoroughly, but every one of those tests calls a function. Three mutations
 * survived that suite because they live in the `.astro` markup, between the
 * tested functions:
 *
 *   1. deleting `data-locale-choice` from `LocaleSwitcher.astro`,
 *   2. deleting it from `404.astro`,
 *   3. replacing `href={localeHref(option, routePath)}` with `href="/"`.
 *
 * The first two silently disable preference persistence — `rememberLocaleFromClick`
 * finds nothing to bind to, so a visitor's explicit language choice is
 * forgotten and `/` keeps re-negotiating. The third silently turns the
 * switcher into a "go home" button: from `/es/repuestos/…` you land on the
 * root shim instead of the same page in English, which is the single worst
 * bug a bilingual site can ship — the reader loses their place every time
 * they switch language.
 *
 * These are rendered through Astro's container API rather than Playwright:
 * the whole contract (attribute present, href points at the *same route* in
 * the other locale) is in the emitted HTML, so a browser adds a browser
 * download and a server to the CI critical path and asserts nothing extra.
 * The behaviour that does need a DOM — the click handler writing the stored
 * preference — is already covered against jsdom in
 * `src/i18n/locale-preference.dom.test.ts`. Rendering also beats parsing
 * `dist/`: these tests run inside `vitest run`, which `npm run verify`
 * executes *before* `astro build`, so a `dist/`-parsing test would grade a
 * stale build or none at all.
 *
 * refs specs/001-foundation (I18N-02, I18N-03, I18N-08)
 */
import { experimental_AstroContainer as AstroContainer } from "astro/container";
// JSDOM is constructed explicitly instead of switching this file to Vitest's
// jsdom *environment*: that environment turns on Vite's `browser` export
// condition, Astro's container then resolves a client build with no server
// renderer, and every render here dies with `NoMatchingRenderer`. Rendering
// must happen in the node environment; only parsing the result needs a DOM.
// (Do not write the environment pragma in a comment either — Vitest greps
// the whole file for it, so even a mention switches the environment on.)
import { JSDOM } from "jsdom";
import { beforeAll, describe, expect, it } from "vitest";

import LocaleSwitcher from "../src/components/LocaleSwitcher.astro";
import NotFoundPage from "../src/pages/404.astro";
import RootRedirectPage from "../src/pages/index.astro";
import { LOCALES, localeHref } from "../src/i18n/routing";

let container: AstroContainer;

beforeAll(async () => {
  container = await AstroContainer.create();
});

function parse(html: string): Document {
  return new JSDOM(html).window.document;
}

/** Every `<a data-locale-choice="…">` in the markup, keyed by locale. */
function localeChoiceLinks(document: Document): Map<string, HTMLAnchorElement> {
  const links = new Map<string, HTMLAnchorElement>();
  for (const anchor of document.querySelectorAll<HTMLAnchorElement>(
    "a[data-locale-choice]"
  )) {
    links.set(anchor.getAttribute("data-locale-choice") ?? "", anchor);
  }
  return links;
}

describe("LocaleSwitcher.astro", () => {
  // A nested route, not "/": with `routePath: "/"` a hardcoded `href="/"`
  // would coincidentally look right for one locale and the mutation would
  // survive.
  const routePath = "/problemas/transferencia-no-engrana/";

  it("offers every locale, each tagged with data-locale-choice", async () => {
    const html = await container.renderToString(LocaleSwitcher, {
      props: { locale: "en", routePath },
    });
    const links = localeChoiceLinks(parse(html));

    expect([...links.keys()].sort()).toEqual([...LOCALES].sort());
  });

  it("links every locale to the same route, not to the site root", async () => {
    for (const current of LOCALES) {
      const html = await container.renderToString(LocaleSwitcher, {
        props: { locale: current, routePath },
      });
      const links = localeChoiceLinks(parse(html));

      for (const target of LOCALES) {
        const href = links.get(target)?.getAttribute("href");
        expect(href, `${current} switcher → ${target}`).toBe(
          localeHref(target, routePath)
        );
        // Belt and braces against the specific `href="/"` mutation: the route
        // has to survive into the href, whatever `localeHref` does with base.
        expect(href).toContain("/problemas/transferencia-no-engrana/");
      }
    }
  });

  it("marks the current locale with aria-current and leaves the others alone", async () => {
    const html = await container.renderToString(LocaleSwitcher, {
      props: { locale: "es", routePath },
    });
    const links = localeChoiceLinks(parse(html));

    expect(links.get("es")?.getAttribute("aria-current")).toBe("true");
    for (const other of LOCALES.filter((locale) => locale !== "es")) {
      expect(links.get(other)?.hasAttribute("aria-current")).toBe(false);
    }
  });
});

describe("404.astro", () => {
  it("offers a home link per locale, each tagged with data-locale-choice", async () => {
    const html = await container.renderToString(NotFoundPage);
    const links = localeChoiceLinks(parse(html));

    expect([...links.keys()].sort()).toEqual([...LOCALES].sort());
    for (const locale of LOCALES) {
      expect(links.get(locale)?.getAttribute("href")).toBe(
        localeHref(locale, "/")
      );
    }
  });
});

describe("index.astro (root redirect shim)", () => {
  it("offers a manual choice per locale, each tagged with data-locale-choice", async () => {
    const html = await container.renderToString(RootRedirectPage);
    const links = localeChoiceLinks(parse(html));

    expect([...links.keys()].sort()).toEqual([...LOCALES].sort());
    for (const locale of LOCALES) {
      expect(links.get(locale)?.getAttribute("href")).toBe(
        localeHref(locale, "/")
      );
    }
  });
});
