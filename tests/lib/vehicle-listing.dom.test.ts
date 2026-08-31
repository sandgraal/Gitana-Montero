/**
 * The vehicle filter's **rendering** path (T204 review, F1).
 *
 * ## Why this file exists
 *
 * The rules were already graded — `matchesVehicle`,
 * `provisionalMatchFacets` — but nothing graded the code that turns their
 * answers into something a reader sees, and the e2e suite could not: **every
 * entry in the corpus today restricts only `gens` and `markets`**, both of
 * which a selection always states. So no real row can ever be a provisional
 * match, the browser test's locator set is always empty, and deleting the
 * provisional branch of the painter kept the whole suite green. A mark that
 * only appears for content nobody has written yet is a mark nobody has ever
 * seen render.
 *
 * These tests supply the content the corpus does not: a card whose fitment
 * names a transfer case, which is exactly the case T203's decision (a) waves
 * through and the T203 review (F8) made T204 responsible for showing.
 *
 * ## Both locales, with the real strings
 *
 * The templates come from `src/i18n/ui.ts` rather than from fixtures, and both
 * locales are asserted. The failure this guards against is not "the English
 * sentence is wrong" — it is a page that wires the EN template and forgets the
 * ES one, which is the specific bilingual failure AGENTS.md exists to prevent
 * and which no English-only test can see.
 *
 * refs specs/001-foundation (FIT-01, FIT-03, I18N-06, I18N-08)
 */
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";

import { LOCALES, LOCALE_BCP47, type Locale } from "../../src/i18n/routing.ts";
import { fitmentFacetLabel, t } from "../../src/i18n/ui.ts";
import {
  OPTIONAL_SELECTION_FACETS,
  buildTaxonomy,
  type VehicleSelection,
} from "../../src/lib/fitment/index.ts";
import {
  applyVehicleToListing,
  createVehicleListingView,
  paintCardFitment,
  buildFitmentTable,
  readCardFitment,
  readFacetLabels,
  readFitmentTable,
  type VehicleListingConfig,
} from "../../src/lib/vehicle-listing.ts";

const taxonomy = buildTaxonomy([
  { id: "gen2", kind: "generation", production: { from: 1991, to: 1999 } },
  {
    id: "gen2-5",
    kind: "generation",
    production: { from: 1997, to: 1999 },
    parentGeneration: "gen2",
  },
  { id: "gen3", kind: "generation", production: { from: 1999, to: 2006 } },
]);

/** Gitana Blanca as FIT-03 lets a visitor describe her: the quadruple only. */
const GITANA: VehicleSelection = {
  gen: "gen3",
  market: "us",
  year: 2002,
  engine: "6g74-sohc",
};

/** Every fitment these fixtures use, and the table a page would emit. */
const FITMENTS = {
  /** Fits Gitana outright. `markets` is always stated, so never provisional. */
  fits: { gens: ["gen3"], markets: ["us"] },
  /** A Costa-Rica-only entry: a US truck does not fit it. */
  crOnly: { gens: ["gen3"], markets: ["cr"] },
  /** Wrong generation *and* a facet the reader never stated. */
  miss: { gens: ["gen2"], transferCases: ["easy-select"] },
  /** The case no content entry produces — the reason this file exists. */
  superSelect: { gens: ["gen3"], transferCases: ["super-select-ii"] },
  /** Several unanswered facets at once. */
  multi: {
    gens: ["gen3"],
    transmissions: ["automatic-5-speed"],
    drive: ["4wd"],
  },
  /** One unanswered facet the selector *can* answer. */
  driveScoped: { gens: ["gen3"], drive: ["4wd"] },
  /** A Gen 2 fitment, for the parentGeneration path. */
  gen2: { gens: ["gen2"], trims: ["gls"] },
} as const;

const fitmentTable = buildFitmentTable(Object.values(FITMENTS));

/**
 * A card as a page ships it: an index into the page's fitment table, and
 * nothing else. The marker rows are built by the painter, on the rows that
 * need them — see the module docstring for why they are not server-rendered.
 */
function cardHtml(id: string, fitment: unknown): string {
  return `<li class="entry" id="${id}" data-fitment="${fitmentTable.indexOf(
    fitment
  )}"></li>`;
}

function configFor(locale: Locale): VehicleListingConfig {
  const strings = t(locale);
  return {
    taxonomy,
    fitTemplate: strings.vehicleFitCountTemplate,
    provisionalTemplate: strings.vehicleProvisionalDetailTemplate,
    facetLabels: Object.fromEntries(
      OPTIONAL_SELECTION_FACETS.map((facet) => [
        facet,
        fitmentFacetLabel(strings, facet),
      ])
    ),
    listFormat: new Intl.ListFormat(LOCALE_BCP47[locale], {
      style: "long",
      type: "conjunction",
    }),
    filteredTag: strings.vehicleFilteredTag,
    doesNotFitLabel: strings.vehicleDoesNotFitLabel,
    provisionalLabel: strings.vehicleProvisionalLabel,
    fitments: fitmentTable.table,
  };
}

function cardFrom(html: string): Element {
  const dom = new JSDOM(`<!doctype html><ul>${html}</ul>`);
  const card = dom.window.document.querySelector("li");
  if (card === null) throw new Error("fixture card did not parse");
  return card;
}

function detailOf(card: Element): string {
  return (
    card.querySelector("[data-entry-provisional-detail]")?.textContent ?? ""
  );
}

function hidden(card: Element, selector: string): boolean {
  return (card.querySelector(selector) as HTMLElement | null)?.hidden ?? true;
}

describe("paintCardFitment — a row that fits outright", () => {
  it("marks nothing", () => {
    // `markets` is a facet the selection always states, which is why every
    // entry in the corpus today lands here and why F1 exists.
    const card = cardFrom(cardHtml("fits", FITMENTS.fits));

    const painted = paintCardFitment(card, GITANA, configFor("en"));

    expect(painted).toEqual({ fits: true, provisional: false });
    expect(card.getAttribute("data-fits")).toBe("true");
    expect(hidden(card, "[data-entry-fit]")).toBe(true);
    expect(hidden(card, "[data-entry-provisional]")).toBe(true);
  });
});

describe("paintCardFitment — a row that does not fit", () => {
  it("dims and tags it, and never hides it", () => {
    const card = cardFrom(cardHtml("cr-only", FITMENTS.crOnly));

    const painted = paintCardFitment(card, GITANA, configFor("en"));

    expect(painted.fits).toBe(false);
    expect(card.getAttribute("data-fits")).toBe("false");
    expect(hidden(card, "[data-entry-fit]")).toBe(false);
    // The artboard's rule, asserted rather than assumed: the row stays.
    expect((card as HTMLElement).hidden).toBe(false);
  });

  it("does not call a non-fitting row provisional", () => {
    const card = cardFrom(cardHtml("miss", FITMENTS.miss));

    const painted = paintCardFitment(card, GITANA, configFor("en"));

    expect(painted).toEqual({ fits: false, provisional: false });
    expect(hidden(card, "[data-entry-provisional]")).toBe(true);
  });
});

describe("paintCardFitment — the provisional mark", () => {
  /**
   * The case no content entry produces: a fitment restricting a facet FIT-03's
   * quadruple leaves unanswered. This is the row T203's decision (a) shows
   * anyway, and the row the T203 review requires be labelled.
   */
  const superSelect = FITMENTS.superSelect;

  it.each(LOCALES)("renders in %s, naming the missing facet", (locale) => {
    const card = cardFrom(cardHtml("provisional", superSelect));

    const painted = paintCardFitment(card, GITANA, configFor(locale));

    expect(painted).toEqual({ fits: true, provisional: true });
    expect(hidden(card, "[data-entry-provisional]")).toBe(false);

    const strings = t(locale);
    // The sentence is the locale's own template with the placeholder gone …
    expect(detailOf(card)).not.toContain("{facets}");
    expect(detailOf(card)).toBe(
      strings.vehicleProvisionalDetailTemplate.replace(
        "{facets}",
        fitmentFacetLabel(strings, "transferCase")
      )
    );
    // … and it names the facet in that locale's own words.
    expect(detailOf(card)).toContain(
      fitmentFacetLabel(strings, "transferCase")
    );
  });

  it("renders a different sentence in each locale", () => {
    // Guards the failure a single-locale test cannot see: a page that wires
    // the EN template and forgets the ES one would pass every assertion above
    // if both locales resolved to the same string.
    const rendered = LOCALES.map((locale) => {
      const card = cardFrom(cardHtml("provisional", superSelect));
      paintCardFitment(card, GITANA, configFor(locale));
      return detailOf(card);
    });

    expect(new Set(rendered).size).toBe(LOCALES.length);
    for (const text of rendered) expect(text.trim()).not.toBe("");
  });

  it.each(LOCALES)("lists several missing facets in %s grammar", (locale) => {
    const card = cardFrom(cardHtml("multi", FITMENTS.multi));

    paintCardFitment(card, GITANA, configFor(locale));

    const strings = t(locale);
    expect(detailOf(card)).toContain(
      fitmentFacetLabel(strings, "transmission")
    );
    expect(detailOf(card)).toContain(fitmentFacetLabel(strings, "drive"));
  });

  it("clears once the reader narrows the selection", () => {
    // "Narrowing the selection is what removes the indicator" (T203 review).
    const card = cardFrom(cardHtml("drive-scoped", FITMENTS.driveScoped));
    const config = configFor("en");

    expect(paintCardFitment(card, GITANA, config).provisional).toBe(true);
    expect(
      paintCardFitment(card, { ...GITANA, drive: "4wd" }, config).provisional
    ).toBe(false);
    expect(hidden(card, "[data-entry-provisional]")).toBe(true);
  });

  it("resets every mark when the vehicle is cleared", () => {
    const card = cardFrom(cardHtml("provisional", superSelect));
    const config = configFor("en");

    paintCardFitment(card, GITANA, config);
    paintCardFitment(card, null, config);

    expect(card.hasAttribute("data-fits")).toBe(false);
    expect(hidden(card, "[data-entry-fit]")).toBe(true);
    expect(hidden(card, "[data-entry-provisional]")).toBe(true);
  });
});

describe("paintCardFitment — a card with no readable fitment", () => {
  it("leaves it alone rather than accusing it of not fitting", () => {
    // `matchesVehicle(null, …)` is false, so the naive path would dim a row
    // because of a *rendering* bug. That is the wrong failure direction.
    const dom = new JSDOM(`<!doctype html><ul><li></li></ul>`);
    const card = dom.window.document.querySelector("li")!;

    const painted = paintCardFitment(card, GITANA, configFor("en"));

    expect(painted).toEqual({ fits: true, provisional: false });
    expect(card.hasAttribute("data-fits")).toBe(false);
    expect(card.querySelector("[data-entry-fit]")).toBeNull();
  });

  it("treats unparseable JSON the same way", () => {
    const dom = new JSDOM(
      `<!doctype html><ul><li data-fitment="{oops"></li></ul>`
    );
    const card = dom.window.document.querySelector("li")!;

    expect(readCardFitment(card, fitmentTable.table)).toBeNull();
    expect(paintCardFitment(card, GITANA, configFor("en")).fits).toBe(true);
  });
});

/**
 * The markers are built in the browser rather than rendered into every card,
 * because server-rendering them cost the glossary ~98 KB and five points of
 * SCF-06 performance budget (T204 review, F3). These are the properties that
 * reversal has to keep true.
 */
describe("paintCardFitment — building the markers on demand", () => {
  it("adds no elements to a card that fits cleanly", () => {
    const card = cardFrom(cardHtml("fits", FITMENTS.fits));

    paintCardFitment(card, GITANA, configFor("en"));

    // The common case, and the reason the whole page does not pay for this.
    expect(card.children).toHaveLength(0);
  });

  it("builds them once, however many times it is painted", () => {
    const card = cardFrom(cardHtml("cr", FITMENTS.crOnly));
    const config = configFor("en");

    paintCardFitment(card, GITANA, config);
    paintCardFitment(card, GITANA, config);
    paintCardFitment(card, null, config);
    paintCardFitment(card, GITANA, config);

    expect(card.querySelectorAll("[data-entry-fit]")).toHaveLength(1);
    expect(card.querySelectorAll("[data-entry-provisional]")).toHaveLength(1);
  });

  it("puts the qualification before the thing it qualifies", () => {
    const card = cardFrom(
      `<li data-fitment="${fitmentTable.indexOf(
        FITMENTS.crOnly
      )}"><h2>Marchamo</h2></li>`
    );

    paintCardFitment(card, GITANA, configFor("en"));

    expect(card.firstElementChild?.hasAttribute("data-entry-fit")).toBe(true);
  });

  it.each(LOCALES)("labels them from ui.ts in %s", (locale) => {
    const card = cardFrom(cardHtml("cr", FITMENTS.crOnly));
    const strings = t(locale);

    paintCardFitment(card, GITANA, configFor(locale));

    const row = card.querySelector("[data-entry-fit]");
    expect(row?.textContent).toContain(strings.vehicleFilteredTag);
    expect(row?.textContent).toContain(strings.vehicleDoesNotFitLabel);
  });

  it("gives the tags the classes the global stylesheet targets", () => {
    // The markers cannot carry Astro's scoped-style attribute, so these class
    // names are the whole contract with `src/styles/vehicle-fit.css`.
    const card = cardFrom(cardHtml("prov", FITMENTS.superSelect));

    paintCardFitment(card, GITANA, configFor("en"));

    expect(card.querySelector("[data-entry-fit]")?.className).toBe(
      "vehicle-fit"
    );
    expect(
      card
        .querySelector("[data-entry-provisional] .vehicle-fit__tag")
        ?.classList.contains("vehicle-fit__tag--provisional")
    ).toBe(true);
  });
});

describe("applyVehicleToListing", () => {
  const listing = [
    cardHtml("a", FITMENTS.fits),
    cardHtml("b", FITMENTS.crOnly),
    cardHtml("c", FITMENTS.superSelect),
  ].join("");

  function cardsFrom(html: string): Element[] {
    const dom = new JSDOM(`<!doctype html><ul>${html}</ul>`);
    return [...dom.window.document.querySelectorAll("li")];
  }

  it("counts what fits, and notices any provisional row", () => {
    const cards = cardsFrom(listing);

    const counts = applyVehicleToListing(cards, GITANA, configFor("en"));

    expect(counts).toEqual({ fitting: 2, visible: 3, anyProvisional: true });
  });

  it("does not count rows another filter has hidden", () => {
    // The two counters on the page have to agree about what "the list" is.
    const cards = cardsFrom(listing);
    (cards[0] as HTMLElement).hidden = true;

    const counts = applyVehicleToListing(cards, GITANA, configFor("en"));

    expect(counts.visible).toBe(2);
    expect(counts.fitting).toBe(1);
  });

  it("still paints a hidden row, so it is right when it comes back", () => {
    const cards = cardsFrom(listing);
    (cards[1] as HTMLElement).hidden = true;

    applyVehicleToListing(cards, GITANA, configFor("en"));

    expect(cards[1]?.getAttribute("data-fits")).toBe("false");
  });
});

describe("createVehicleListingView", () => {
  /** The markup `VehicleFitSummary.astro` renders, per locale. */
  function summaryHtml(locale: Locale): string {
    const strings = t(locale);
    const facetLabels = Object.fromEntries(
      OPTIONAL_SELECTION_FACETS.map((facet) => [
        facet,
        fitmentFacetLabel(strings, facet),
      ])
    );
    return `<div data-vehicle-summary hidden
        data-fit-template="${strings.vehicleFitCountTemplate}"
        data-provisional-template="${strings.vehicleProvisionalDetailTemplate.replace(
          /"/g,
          "&quot;"
        )}"
        data-facet-labels='${JSON.stringify(facetLabels)}'
        data-fitments='${JSON.stringify(fitmentTable.table)}'
        data-filtered-tag="${strings.vehicleFilteredTag}"
        data-does-not-fit="${strings.vehicleDoesNotFitLabel}"
        data-provisional-label="${strings.vehicleProvisionalLabel}">
        <p data-vehicle-fit></p>
        <p data-vehicle-provisional-note hidden></p>
      </div>`;
  }

  function pageFor(locale: Locale) {
    const dom = new JSDOM(
      `<!doctype html><html lang="${LOCALE_BCP47[locale]}"><body><section>` +
        `${summaryHtml(locale)}<ul>` +
        cardHtml("fits", FITMENTS.fits) +
        cardHtml("misses", FITMENTS.crOnly) +
        cardHtml("provisional", FITMENTS.superSelect) +
        `</ul></section></body></html>`
    );
    const root = dom.window.document.querySelector("section")!;
    const view = createVehicleListingView({
      root,
      cards: [...root.querySelectorAll("li")],
      taxonomy,
      lang: dom.window.document.documentElement.lang,
    });
    return { dom, root, view };
  }

  it.each(LOCALES)("fills the count line in %s", (locale) => {
    const { root, view } = pageFor(locale);

    view!.apply(GITANA);

    const summary = root.querySelector("[data-vehicle-summary]") as HTMLElement;
    const fit = root.querySelector("[data-vehicle-fit]");
    expect(summary.hidden).toBe(false);
    expect(fit?.textContent).toBe(
      t(locale)
        .vehicleFitCountTemplate.replace("{shown}", "2")
        .replace("{total}", "3")
    );
  });

  it.each(LOCALES)("shows the standing provisional warning in %s", (locale) => {
    const { root, view } = pageFor(locale);

    view!.apply(GITANA);

    const note = root.querySelector(
      "[data-vehicle-provisional-note]"
    ) as HTMLElement;
    expect(note.hidden).toBe(false);
  });

  it("hides the whole readout when the vehicle is cleared", () => {
    const { root, view } = pageFor("en");

    view!.apply(GITANA);
    view!.apply(null);

    const summary = root.querySelector("[data-vehicle-summary]") as HTMLElement;
    const note = root.querySelector(
      "[data-vehicle-provisional-note]"
    ) as HTMLElement;
    expect(summary.hidden).toBe(true);
    expect(note.hidden).toBe(true);
  });

  it("is null on a listing that has not opted in", () => {
    const dom = new JSDOM("<!doctype html><section><ul></ul></section>");
    const root = dom.window.document.querySelector("section")!;

    expect(
      createVehicleListingView({ root, cards: [], taxonomy, lang: "en" })
    ).toBeNull();
  });
});

describe("buildFitmentTable", () => {
  it("stores one row per distinct fitment, in first-seen order", () => {
    const a = { gens: ["gen3"] };
    const b = { gens: ["gen1"] };
    const { table } = buildFitmentTable([a, b, { gens: ["gen3"] }, a]);

    expect(table).toEqual([a, b]);
  });

  it("gives equal fitments the same index whatever object they came from", () => {
    // The saving depends entirely on this: 142 glossary terms declare the same
    // fitment as 142 separate objects.
    const { indexOf } = buildFitmentTable([
      { gens: ["gen3"] },
      { gens: ["gen1"] },
    ]);

    expect(indexOf({ gens: ["gen3"] })).toBe("0");
    expect(indexOf({ gens: ["gen1"] })).toBe("1");
  });

  it("reports -1 for a fitment that is not in the table", () => {
    const { indexOf } = buildFitmentTable([{ gens: ["gen3"] }]);

    // Which `readCardFitment` then reads as "no fitment", so the row is left
    // alone rather than dimmed by a page bug.
    expect(indexOf({ gens: ["gen9"] })).toBe("-1");
  });
});

describe("readCardFitment", () => {
  const table = [{ gens: ["gen3"] }, { gens: ["gen1"] }];

  it("resolves an index against the table", () => {
    const card = cardFrom(`<li data-fitment="1"></li>`);
    expect(readCardFitment(card, table)).toEqual({ gens: ["gen1"] });
  });

  it.each([
    ["no attribute", `<li></li>`],
    ["a non-numeric index", `<li data-fitment="nope"></li>`],
    ["a negative index", `<li data-fitment="-1"></li>`],
    ["an out-of-range index", `<li data-fitment="9"></li>`],
  ])("reads %s as no fitment", (_label, html) => {
    expect(readCardFitment(cardFrom(html), table)).toBeNull();
  });
});

describe("readFitmentTable", () => {
  it("reads the array the summary block carries", () => {
    expect(readFitmentTable('[{"gens":["gen3"]}]')).toEqual([
      { gens: ["gen3"] },
    ]);
  });

  it.each([
    ["nothing", undefined],
    ["null", null],
    ["unparseable JSON", "{oops"],
    ["a non-array", '{"gens":[]}'],
  ])("falls back to an empty table for %s", (_label, raw) => {
    expect(readFitmentTable(raw)).toEqual([]);
  });
});

describe("readFacetLabels", () => {
  it("reads the map the summary block carries", () => {
    expect(readFacetLabels('{"drive":"la tracción"}')).toEqual({
      drive: "la tracción",
    });
  });

  it.each([
    ["nothing", undefined],
    ["null", null],
    ["unparseable JSON", "{oops"],
    ["an array", "[1,2]"],
    ["a bare string", '"nope"'],
  ])("falls back to an empty map for %s", (_label, raw) => {
    expect(readFacetLabels(raw)).toEqual({});
  });
});
