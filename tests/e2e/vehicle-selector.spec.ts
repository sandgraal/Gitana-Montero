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
  await expect(page.locator("[data-vehicle-fit]")).toBeVisible();
  await expect(page.locator("[data-vehicle-fit]")).not.toHaveText("");
});

test("filters the glossary too — FIT-03 says any collection listing", async ({
  page,
}) => {
  await page.goto("/en/glossary/");
  const terms = page.locator(".term");
  const total = await terms.count();

  await chooseTruck(page);

  // `marchamo` is the Costa Rican road tax: `markets: ["cr"]`, so it does not
  // apply to a US truck. It stays on the page, dimmed and tagged — a glossary
  // that silently withheld a word would be worse than one that greys it.
  const marchamo = page.locator("#term-all-general-marchamo");
  await expect(marchamo).toHaveAttribute("data-fits", "false");
  await expect(marchamo).toBeVisible();
  await expect(marchamo.locator("[data-entry-fit]")).toBeVisible();

  // `carburador` is Gen 1–2 only; a Gen 3 truck never had one.
  await expect(page.locator("#term-all-fuel-carburador")).toHaveAttribute(
    "data-fits",
    "false"
  );
  // `motor` applies to every truck ever built.
  await expect(page.locator("#term-all-engine-motor")).toHaveAttribute(
    "data-fits",
    "true"
  );

  await expect(terms).toHaveCount(total);
  await expect(page.locator("[data-vehicle-fit]")).not.toHaveText("");
});

/**
 * The binding condition on T203's permissive semantics (T203 review, F8): an
 * entry that matched partly because the reader has not named a transfer case
 * has to say so.
 *
 * **No entry in the corpus can currently produce this.** Every one restricts
 * only `gens` and `markets`, and a selection always states both — so a test
 * that waited for a real provisional row would assert nothing, for ever, while
 * looking like coverage (T204 review, F1).
 *
 * So the fixture is injected into the *served HTML*, before any script runs:
 * the page's fitment table gains one row naming a transfer case, and the first
 * card is pointed at it. Everything downstream — the shared painter, the
 * runtime-built markers, the summary block, the locale's own template — is the
 * shipping code path, unmodified.
 *
 * Rewriting the response rather than the live DOM is what makes this real: the
 * listing reads its fitment table once, when its script initializes, so a
 * `page.evaluate` after load would be changing an attribute nobody reads again.
 *
 * The per-facet text is graded exhaustively and in both locales against JSDOM
 * in `tests/lib/vehicle-listing.dom.test.ts`; this is the page wiring.
 */
const PROVISIONAL_FITMENT = {
  gens: ["gen1", "gen2", "gen2-5", "gen3", "gen4"],
  transferCases: ["super-select-ii"],
};

/** Attribute values arrive HTML-escaped; `"` is the only character that matters here. */
const unescapeAttribute = (value: string): string =>
  value.replaceAll("&quot;", '"').replaceAll("&amp;", "&");
const escapeAttribute = (value: string): string =>
  value.replaceAll("&", "&amp;").replaceAll('"', "&quot;");

/**
 * Serve `path` with one extra fitment in the page's table and the first card
 * pointing at it.
 *
 * @param cardAttribute the `data-fitment="…"` occurrence to repoint — the
 *   first one in document order, which is the first card in the listing.
 */
async function injectFitment(
  page: Page,
  path: string,
  fitment: unknown
): Promise<void> {
  await page.route(`**${path}`, async (route) => {
    const response = await route.fetch();
    let html = await response.text();

    const table = /data-fitments="([^"]*)"/.exec(html);
    if (table === null) throw new Error(`no fitment table on ${path}`);
    const rows: unknown[] = JSON.parse(unescapeAttribute(table[1] ?? "[]"));
    rows.push(fitment);
    html = html.replace(
      table[0],
      `data-fitments="${escapeAttribute(JSON.stringify(rows))}"`
    );

    html = html.replace(
      /data-fitment="\d+"/,
      `data-fitment="${rows.length - 1}"`
    );

    await route.fulfill({ response, body: html });
  });
}

for (const listing of [
  {
    name: "community",
    en: "/en/community/",
    es: "/es/comunidad/",
    card: ".entry",
  },
  { name: "glossary", en: "/en/glossary/", es: "/es/glosario/", card: ".term" },
] as const) {
  for (const locale of ["en", "es"] as const) {
    test(`marks a provisional match on the ${listing.name} listing (${locale})`, async ({
      page,
    }) => {
      await injectFitment(page, listing[locale], PROVISIONAL_FITMENT);
      await page.goto(listing[locale]);

      await chooseTruck(page);

      const mark = page
        .locator(`${listing.card}:first-of-type [data-entry-provisional]`)
        .first();
      await expect(mark).toBeVisible();

      // The sentence is filled in, in this page's language, with the
      // placeholder resolved — not the raw template.
      const detail = mark.locator("[data-entry-provisional-detail]");
      await expect(detail).not.toHaveText("");
      await expect(detail).not.toContainText("{facets}");

      // And the standing warning above the listing comes with it.
      await expect(
        page.locator("[data-vehicle-provisional-note]")
      ).toBeVisible();
    });
  }
}

test("clears the provisional mark once the drive is named", async ({
  page,
}) => {
  // A fitment restricting the one optional facet the selector *can* answer.
  await injectFitment(page, "/en/community/", {
    gens: ["gen3"],
    drive: ["4wd"],
  });
  await page.goto("/en/community/");

  await chooseTruck(page);
  const mark = page.locator(".entry:first-of-type [data-entry-provisional]");
  await expect(mark).toBeVisible();

  // "Narrowing the selection is what removes the indicator" (T203 review),
  // through the real control rather than through the storage API.
  await page.click("[data-vs-toggle]");
  await page.selectOption("#vs-drive", "4wd");
  await page.click("[data-vs-apply]");

  await expect(mark).toBeHidden();
});

test("forgets the vehicle when the chip is cleared", async ({ page }) => {
  await page.goto("/en/community/");
  await chooseTruck(page);
  await expect(page.locator("[data-vs-chip]")).toBeVisible();

  await page.click("[data-vs-clear]");

  await expect(page.locator("[data-vs-idle]")).toBeVisible();
  await expect(page.locator("[data-vehicle-summary]")).toBeHidden();
  await expect(page.locator(CR_ONLY_CARD)).not.toHaveAttribute(
    "data-fits",
    "false"
  );

  // And it stays forgotten on the next page.
  await page.goto("/en/");
  await expect(page.locator("[data-vs-chip]")).toBeHidden();
});

test("gives the chip's clear button a real tap target", async ({ page }) => {
  await chooseTruck(page);

  // WCAG 2.5.5 and the design handoff's "mobile tap targets >= 44px". The
  // control that throws away the reader's selection is the last place to
  // shave a target down (T204 review, F6).
  const box = await page.locator("[data-vs-clear]").boundingBox();
  expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
});

test("skips past the selector, not into it", async ({ page }) => {
  await page.goto("/en/community/");

  // The skip link exists to bypass navigation. T204 put a filter control
  // inside `<main>`, so landing on the landmark would drop the reader at the
  // top of the very thing they asked to skip (T204 review, F7).
  const target = await page
    .locator(".skip-link")
    .evaluate((link) => (link as HTMLAnchorElement).hash);
  expect(target).toBe("#content");

  const selectorIsInsideTarget = await page.evaluate(() =>
    document
      .querySelector("#content")
      ?.contains(document.querySelector("[data-vehicle-selector]"))
  );
  expect(selectorIsInsideTarget).toBe(false);

  // And the landmark is still the landmark.
  await expect(page.locator("main")).toHaveCount(1);
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
