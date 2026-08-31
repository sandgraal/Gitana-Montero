/**
 * The locale switcher, in a real browser (I18N-01, I18N-03).
 *
 * ## Why this exists next to `tests/locale-switcher.test.ts`
 *
 * That file grades the *markup* through Astro's container API, and it is the
 * right place for the three mutations the T102 review found (T106 note L9):
 * deleting `data-locale-choice` from the switcher, deleting it from `404.astro`,
 * and replacing the same-route `href` with `href="/"`. A rendered-HTML test
 * kills those without a browser, which is why they were not left for this
 * suite.
 *
 * What that file cannot reach is the *end* of the chain: the attribute exists
 * so a delegated click handler can persist the choice, and the href is
 * same-route so the reader does not lose their place. Both of those are
 * behaviour across a real navigation, on the built artifact, with the real
 * bundle attached — which is what is checked here. Between the two files the
 * chain is covered from the template to the reader.
 *
 * The community page is the subject on purpose: its segment is *translated*
 * (`/en/community/` ↔ `/es/comunidad/`), so a switcher that dropped the route
 * would land on a 404 rather than merely on the wrong page, and one that
 * carried the route without translating the segment would too.
 *
 * refs specs/001-foundation (I18N-01, I18N-03, I18N-05)
 */
import { expect, test } from "@playwright/test";

test("offers every locale, each tagged for the preference handler", async ({
  page,
}) => {
  await page.goto("/en/community/");

  const choices = page.locator("header a[data-locale-choice]");
  await expect(choices).toHaveCount(2);
  await expect(
    page.locator('header a[data-locale-choice="en"]')
  ).toHaveAttribute("href", "/en/community/");
  await expect(
    page.locator('header a[data-locale-choice="es"]')
  ).toHaveAttribute("href", "/es/comunidad/");
});

test("lands on the same page in the other language, not the site root", async ({
  page,
}) => {
  await page.goto("/en/community/");

  await page.click('a[data-locale-choice="es"]');

  await expect(page).toHaveURL(/\/es\/comunidad\/$/);
  await expect(page.locator("html")).toHaveAttribute("lang", "es-CR");
});

test("remembers the choice, so the root redirect honours it", async ({
  page,
}) => {
  await page.goto("/en/community/");
  await page.click('a[data-locale-choice="es"]');
  await expect(page).toHaveURL(/\/es\/comunidad\/$/);

  // The whole point of `data-locale-choice`: an explicit choice beats
  // `Accept-Language` negotiation on every later visit to `/`.
  await page.goto("/");

  await expect(page).toHaveURL(/\/es\/$/);
});

test("switches back, from the Spanish segment to the English one", async ({
  page,
}) => {
  await page.goto("/es/comunidad/");

  await page.click('a[data-locale-choice="en"]');

  await expect(page).toHaveURL(/\/en\/community\/$/);
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
});
