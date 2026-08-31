/**
 * The vehicle selector, in a real browser (FIT-03).
 *
 * > **FIT-03** WHEN a visitor selects a vehicle (gen + market + year +
 * > engine), THE site SHALL filter any collection listing to entries whose
 * > fitment matches, and SHALL persist the selection across pages and locales.
 *
 * Everything asserted here needs a browser and cannot be faked: storage that
 * survives a navigation, two independent script bundles agreeing about one
 * selection, and a page that arrives with JavaScript switched off. The rules
 * themselves — what matches, what a stored value may contain — are unit-tested
 * in `tests/lib/`.
 *
 * refs specs/001-foundation (FIT-03, I18N-01)
 */
import { expect, test, type Page } from "@playwright/test";

/** Gitana Blanca herself: Gen 3, US market, 2002, 6G74 SOHC (AGENTS.md). */
const TRUCK = {
  gen: "gen3",
  market: "us",
  year: "2002",
  engine: "6g74-sohc",
  chip: "Gen 3 · US · 2002 · 6G74 SOHC",
};

/** The Costa Rican club: `markets: ["cr"]`, so a US truck does not fit it. */
const CR_ONLY_CARD = "#community-club-mitsubishi-montero-costa-rica-4x4";

test.beforeEach(async ({ page }) => {
  // A shared origin means a leftover selection would leak between tests. The
  // page has to exist before `localStorage` does, hence the visit first.
  await page.goto("/en/");
  await page.evaluate(() => window.localStorage.clear());
});

/** Drive the panel end to end and press "Set vehicle". */
async function chooseTruck(page: Page): Promise<void> {
  await page.click("[data-vs-toggle]");
  await page.click(`[data-vs-generation="${TRUCK.gen}"]`);
  await page.selectOption("#vs-market", TRUCK.market);
  await page.selectOption("#vs-year", TRUCK.year);
  await page.selectOption("#vs-engine", TRUCK.engine);
  await page.click("[data-vs-apply]");
}

test("starts idle and offers to select a vehicle", async ({ page }) => {
  await expect(page.locator("[data-vs-idle]")).toBeVisible();
  await expect(page.locator("[data-vs-chip]")).toBeHidden();
  await expect(page.locator("[data-vs-toggle]")).toHaveAttribute(
    "aria-expanded",
    "false"
  );
});

test("records the chosen truck as a chip", async ({ page }) => {
  await chooseTruck(page);

  await expect(page.locator("[data-vs-chip]")).toBeVisible();
  await expect(page.locator("[data-vs-chip-text]")).toHaveText(TRUCK.chip);
  await expect(page.locator("[data-vs-idle]")).toBeHidden();
  // The panel closes on apply and hands focus back to the control that
  // opened it — the keyboard contract of a disclosure.
  await expect(page.locator("[data-vs-panel]")).toBeHidden();
  await expect(page.locator("[data-vs-toggle]")).toBeFocused();
});

test("keeps the selection across a navigation to another page", async ({
  page,
}) => {
  await chooseTruck(page);

  await page.goto("/en/community/");

  await expect(page.locator("[data-vs-chip-text]")).toHaveText(TRUCK.chip);
});

test("keeps the selection across the locale switch", async ({ page }) => {
  await chooseTruck(page);
  await page.goto("/en/community/");

  await page.click('a[data-locale-choice="es"]');

  // The same route in the other locale, not the site root (I18N-03), and the
  // truck came with us. The chip is shared `data` — a generation label is the
  // one translated word in it, so it reads "Generación 3" here.
  await expect(page).toHaveURL(/\/es\/comunidad\/$/);
  await expect(page.locator("[data-vs-chip-text]")).toHaveText(
    TRUCK.chip.replace("Gen 3", "Generación 3")
  );
});

test("filters the listing without hiding anything", async ({ page }) => {
  await page.goto("/en/community/");
  const cards = page.locator(".entry");
  const total = await cards.count();

  await chooseTruck(page);

  // Every card is still on the page — the Selector artboard's "never hidden
  // silently" — and the ones that do not fit say so in words, not by opacity.
  await expect(cards).toHaveCount(total);
  const crOnly = page.locator(CR_ONLY_CARD);
  await expect(crOnly).toHaveAttribute("data-fits", "false");
  await expect(crOnly).toBeVisible();
  await expect(crOnly.locator("[data-entry-fit]")).toBeVisible();

  // And the count line reports the split.
  await expect(page.locator("[data-community-fit]")).toBeVisible();
  await expect(page.locator("[data-community-fit]")).not.toHaveText("");
});

test("marks a provisional match and says which facets are missing", async ({
  page,
}) => {
  await page.goto("/en/community/");
  await chooseTruck(page);

  /*
   * The binding condition on T203's permissive semantics (T203 review, F8):
   * an entry that matched partly because the reader has not named a transfer
   * case has to say so. The community corpus may or may not carry such an
   * entry on any given day, so this asserts the *mechanism* rather than a
   * count: every visible provisional marker names its facets.
   */
  const marks = page.locator("[data-entry-provisional]:visible");
  for (const mark of await marks.all()) {
    await expect(
      mark.locator("[data-entry-provisional-detail]")
    ).not.toHaveText("");
  }
  if ((await marks.count()) > 0) {
    await expect(
      page.locator("[data-community-provisional-note]")
    ).toBeVisible();
  }
});

test("forgets the vehicle when the chip is cleared", async ({ page }) => {
  await page.goto("/en/community/");
  await chooseTruck(page);
  await expect(page.locator("[data-vs-chip]")).toBeVisible();

  await page.click("[data-vs-clear]");

  await expect(page.locator("[data-vs-idle]")).toBeVisible();
  await expect(page.locator("[data-community-vehicle]")).toBeHidden();
  await expect(page.locator(CR_ONLY_CARD)).not.toHaveAttribute(
    "data-fits",
    "false"
  );

  // And it stays forgotten on the next page.
  await page.goto("/en/");
  await expect(page.locator("[data-vs-chip]")).toBeHidden();
});

test("closes the panel on Escape and returns focus", async ({ page }) => {
  await page.click("[data-vs-toggle]");
  await expect(page.locator("[data-vs-panel]")).toBeVisible();

  await page.keyboard.press("Escape");

  await expect(page.locator("[data-vs-panel]")).toBeHidden();
  await expect(page.locator("[data-vs-toggle]")).toBeFocused();
});

test.describe("without JavaScript", () => {
  test.use({ javaScriptEnabled: false });

  test("renders the whole listing and no dead control", async ({ page }) => {
    await page.goto("/en/community/");

    // The selector is chrome that cannot work, so it is not shown at all.
    await expect(page.locator("[data-vehicle-selector]")).toBeHidden();
    // Neither is the facet toolbar, which is T703a's own enhancement.
    await expect(page.locator("[data-community-toolbar]")).toBeHidden();
    // The content, however, is all there — filtering is an enhancement over a
    // complete page, never a precondition for reading one.
    await expect(page.locator(".entry")).not.toHaveCount(0);
    await expect(page.locator(CR_ONLY_CARD)).toBeVisible();
  });
});
