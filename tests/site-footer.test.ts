/**
 * Rendered-markup contract for the site footer, and specifically for MIG-05's
 * "independent enthusiast site, not affiliated with Mitsubishi Motors" notice.
 *
 * ## Why this file exists (T2-102 review; a positive control for a regression
 * that already escaped once)
 *
 * MIG-05 says the notice ships "in the footer from the rename onward" — every
 * page, both locales. T2-101 added it to `SiteFooter.astro` and shipped, and
 * nothing was wrong with `SiteFooter.astro`. What shipped wrong was
 * `src/pages/404.astro`, which has no footer at all: it is the one page that
 * cannot use `BaseLayout` (the layout's job is a single locale's canonical and
 * hreflang set, and a 404 has no locale — it is served for URLs that may carry
 * no usable locale, so it renders every locale at once). The notice was
 * therefore absent from exactly the page nobody looks at, and every check in
 * the repository was green: the a11y sweep does audit `/404.html`, but a
 * missing footer is not a WCAG violation, and no test asserted the notice was
 * anywhere in particular.
 *
 * So the grader is deliberately shaped around the escape, not around the
 * component. It asserts the *page-level* contract that was violated:
 *
 *   1. the 404 has exactly one `contentinfo` landmark — one `<footer>`, at
 *      body level, not nested in `<main>`/`<section>`/`<article>`;
 *   2. that footer carries one block per locale, each `lang`-marked with the
 *      locale's BCP-47 tag, so a screen reader announces each in its own
 *      language (the whole page is built this way, and the footer was the
 *      part that was not);
 *   3. `footerNotAffiliated` is present for **both** locales, compared against
 *      `src/i18n/ui.ts` rather than a copy of the sentence — a grader with the
 *      string written into it grades itself.
 *
 * Point 1 has teeth beyond tidiness: the obvious fix for the missing footer is
 * to drop a whole `<SiteFooter>` into each of the page's per-locale sections,
 * which yields two `<footer>` elements and, at body level, two `contentinfo`
 * landmarks — an a11y defect swapped in for an a11y omission. This test fails
 * on that fix.
 *
 * Rendered through Astro's container API, like `tests/locale-switcher.test.ts`
 * and for the same reason: the contract lives entirely in the emitted HTML, and
 * `vitest run` executes *before* `astro build` inside `npm run verify`, so a
 * test that parsed `dist/` would grade a stale build or no build at all.
 *
 * refs specs/002-montero-garage (MIG-05), specs/001-foundation (I18N-08)
 */
import { experimental_AstroContainer as AstroContainer } from "astro/container";
// JSDOM is constructed explicitly rather than switching this file to Vitest's
// DOM environment — see the note in `tests/locale-switcher.test.ts`: that
// environment turns on Vite's `browser` export condition and Astro's container
// then renders with no server renderer at all.
import { JSDOM } from "jsdom";
import { beforeAll, describe, expect, it } from "vitest";

import SiteFooter from "../src/components/SiteFooter.astro";
import NotFoundPage from "../src/pages/404.astro";
import { LOCALES, LOCALE_BCP47, type Locale } from "../src/i18n/routing";
import { t } from "../src/i18n/ui";

let container: AstroContainer;

beforeAll(async () => {
  container = await AstroContainer.create();
});

function parse(html: string): Document {
  return new JSDOM(html).window.document;
}

/**
 * Every `<footer>` that is a `contentinfo` landmark.
 *
 * Per the HTML-AAM mapping, a `<footer>` scoped to `<article>`, `<aside>`,
 * `<main>`, `<nav>` or `<section>` is *not* `contentinfo` — only one scoped to
 * the body is. Counting `<footer>` elements alone would therefore both
 * over-report (a legitimately nested footer) and miss the point, so the scope
 * is what is checked.
 */
function contentinfoLandmarks(document: Document): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>("footer")].filter(
    (footer) => footer.closest("article, aside, main, nav, section") === null
  );
}

describe("SiteFooter.astro", () => {
  it.each(LOCALES)(
    "renders one contentinfo landmark carrying MIG-05's notice (%s)",
    async (locale: Locale) => {
      const document = parse(
        await container.renderToString(SiteFooter, { props: { locale } })
      );
      const footers = contentinfoLandmarks(document);

      expect(footers).toHaveLength(1);
      expect(footers[0].textContent).toContain(t(locale).footerNotAffiliated);
    }
  );
});

describe("404.astro — the page that shipped without a footer (MIG-05)", () => {
  let document: Document;

  beforeAll(async () => {
    document = parse(await container.renderToString(NotFoundPage));
  });

  it("has exactly one contentinfo landmark", () => {
    // Both halves matter: 0 is the T2-101 regression, 2+ is the naive fix for
    // it (one `<SiteFooter>` per locale section at body level).
    expect(contentinfoLandmarks(document)).toHaveLength(1);
  });

  it("marks one block per locale with that locale's BCP-47 tag", () => {
    const [footer] = contentinfoLandmarks(document);
    const tags = [...footer.querySelectorAll<HTMLElement>("[lang]")].map(
      (element) => element.getAttribute("lang")
    );

    for (const locale of LOCALES) {
      expect(tags, `footer block for ${locale}`).toContain(
        LOCALE_BCP47[locale]
      );
    }
  });

  it("carries the not-affiliated notice in every locale", () => {
    const [footer] = contentinfoLandmarks(document);

    for (const locale of LOCALES) {
      const block = footer.querySelector<HTMLElement>(
        `[lang="${LOCALE_BCP47[locale]}"]`
      );
      expect(block, `footer block for ${locale}`).not.toBeNull();
      // Compared against the strings module, never against a copy of the
      // sentence: a grader that restates the text grades its own restatement.
      expect(block?.textContent).toContain(t(locale).footerNotAffiliated);
    }
  });
});
