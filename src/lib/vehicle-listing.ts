/**
 * Applying the reader's vehicle to a collection listing (FIT-03).
 *
 * > **FIT-03** … THE site SHALL filter **any collection listing** to entries
 * > whose fitment matches …
 *
 * "Any" is why this is a module and not a copy of the same forty lines in
 * every page. The community directory and the glossary both use it today;
 * problems, parts and procedures will use it unchanged. One implementation
 * means one answer to "does this fit", one rendering of "it does not", and one
 * place to fix either.
 *
 * ## It decides nothing about fitment
 *
 * Every question here is asked of `src/lib/fitment/` (FIT-01): `matchesVehicle`
 * for whether a row fits, `provisionalMatchFacets` for whether the match
 * leaned on something the reader has not said. This module reads DOM
 * attributes, calls those two, and writes DOM attributes back.
 *
 * ## The rendering rule: dim, tag, and never hide
 *
 * A facet pill hides what does not match, because that is the reader
 * narrowing on purpose. A *fitment* mismatch is the site deciding something is
 * not for them, and the site owes them the chance to disagree — so the row
 * stays, at 55% opacity, carrying a "filtered" tag that says in words what the
 * opacity says in pixels. That is the Selector artboard's third state
 * ("non-fitting rows at 55% opacity with 'filtered' tag, never hidden
 * silently") and it is also the only version that works for a reader who
 * cannot see opacity at all.
 *
 * ## The markup contract
 *
 * A listing renders `VehicleFitSummary.astro` once, passing it the page's
 * {@link buildFitmentTable} result, and gives each card a `data-fitment`
 * attribute holding that card's **index into the table**. That is the whole
 * contract. The fitments come from the collection and are never re-derived
 * here; the indirection exists because listings repeat themselves and an
 * escaped JSON blob per card is expensive (see {@link buildFitmentTable}).
 *
 * This module sets `data-fits="true|false"` on each card and **builds the two
 * marker rows itself**, on the cards that need them.
 *
 * ### Why the markers are built here and not rendered by the page
 *
 * They were, at first: a `VehicleFitMarkers.astro` component rendered both
 * rows, hidden, into every card. On the glossary that is 154 term cards, and
 * it added ~98 KB to the served HTML — about 40% of the page — costing five
 * points of SCF-06's performance budget to ship markup that only ever becomes
 * visible for a reader who has JavaScript *and* has chosen a vehicle. Since
 * this module is the only thing that ever unhides them, and it only runs in
 * that exact case, building them on demand costs a listing nothing and a
 * reader nothing.
 *
 * Their text still comes from `src/i18n/ui.ts` in both locales: the strings
 * ride on the summary block's data attributes, so nothing here contains a
 * hard-coded word (I18N-08). Their styles are `src/styles/vehicle-fit.css`,
 * global because a runtime-built element cannot carry Astro's scoped-style
 * attribute.
 *
 * refs specs/001-foundation (FIT-01, FIT-03, I18N-08, SCF-06)
 */

import {
  matchesVehicle,
  provisionalMatchFacets,
  type Taxonomy,
  type VehicleSelection,
} from "./fitment/index.ts";
import { formatCount } from "./glossary-filter.ts";

/** Everything locale- or page-specific the painter needs, resolved once. */
export interface VehicleListingConfig {
  readonly taxonomy: Taxonomy;
  /** `{shown}` / `{total}` — the green fit-count line. */
  readonly fitTemplate: string;
  /** `{facets}` — the per-row sentence naming what the reader has not said. */
  readonly provisionalTemplate: string;
  /** `fitmentFacet.*` in the page locale, keyed by facet name. */
  readonly facetLabels: Readonly<Record<string, string>>;
  /** Joins the facet names in the page locale's own grammar. */
  readonly listFormat: Intl.ListFormat;
  /** The short "filtered" chip on a row that does not fit. */
  readonly filteredTag: string;
  /** The sentence beside it. */
  readonly doesNotFitLabel: string;
  /** The short chip on a row whose match leaned on silence. */
  readonly provisionalLabel: string;
  /** The page fitment table each card indexes into — see `buildFitmentTable`. */
  readonly fitments: readonly unknown[];
}

/** What painting one card decided. */
export interface CardFitment {
  readonly fits: boolean;
  /** Only ever true for a card that fits — see `provisionalMatchFacets`. */
  readonly provisional: boolean;
}

/** What painting a whole listing decided. */
export interface ListingFitment {
  /** Rows that fit, among those the other filters left visible. */
  readonly fitting: number;
  /** Rows the other filters left visible — the denominator. */
  readonly visible: number;
  readonly anyProvisional: boolean;
}

/* -------------------------------------------------------------------------
 * The fitment table
 * ---------------------------------------------------------------------- */

/**
 * De-duplicated fitments plus the index each card should carry.
 *
 * Listings repeat themselves: 142 of the glossary's 154 terms declare the
 * identical `{"gens":["gen1","gen2","gen2-5","gen3","gen4"]}`. Writing that
 * into every card's `data-fitment` attribute cost about 19 KB of served HTML —
 * worse than the raw JSON suggests, because an HTML attribute escapes every
 * `"` to `&quot;`, six characters for one. Emitting the distinct fitments once
 * and giving each card an index gets the same information across for a
 * fraction of the bytes, and is worth two points of SCF-06's performance
 * budget on the glossary (T204 review, F3).
 *
 * Order is first-seen, so the table is stable for a given content set and the
 * built HTML does not churn between builds.
 */
export interface FitmentTable {
  /** The distinct fitments, in first-seen order. */
  readonly table: readonly unknown[];
  /** The `data-fitment` value for a card carrying `fitment`. */
  indexOf(fitment: unknown): string;
}

export function buildFitmentTable(fitments: readonly unknown[]): FitmentTable {
  const positions = new Map<string, number>();
  const table: unknown[] = [];

  for (const fitment of fitments) {
    const key = JSON.stringify(fitment ?? null);
    if (positions.has(key)) continue;
    positions.set(key, table.length);
    table.push(fitment ?? null);
  }

  return {
    table,
    indexOf(fitment) {
      return String(positions.get(JSON.stringify(fitment ?? null)) ?? -1);
    },
  };
}

/**
 * A card's declared fitment, or `null`.
 *
 * `data-fitment` is an **index** into the page's fitment table, not the
 * fitment itself — see {@link buildFitmentTable}. `null` (no attribute, an
 * index that is not a number, or one that is out of range) is treated by
 * `matchesVehicle` as "matches nothing", which would silently mark the row as
 * not fitting. That is the wrong failure for a rendering bug, so
 * `paintCardFitment` short-circuits on it and leaves the row alone instead.
 */
export function readCardFitment(
  card: Element,
  table: readonly unknown[]
): unknown {
  const raw = (card as HTMLElement).dataset?.["fitment"];
  if (raw === undefined) return null;
  const index = Number.parseInt(raw, 10);
  if (!Number.isInteger(index) || index < 0 || index >= table.length) {
    return null;
  }
  return table[index] ?? null;
}

/** The fitment table from a `data-fitments` attribute. */
export function readFitmentTable(
  raw: string | null | undefined
): readonly unknown[] {
  if (raw === null || raw === undefined) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** The `facetLabels` map from a `data-facet-labels` attribute. */
export function readFacetLabels(
  raw: string | null | undefined
): Record<string, string> {
  if (raw === null || raw === undefined) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === "object" &&
      parsed !== null &&
      !Array.isArray(parsed)
      ? (parsed as Record<string, string>)
      : {};
  } catch {
    return {};
  }
}

function markerIn(card: Element, selector: string): HTMLElement | null {
  return card.querySelector<HTMLElement>(selector);
}

/**
 * Build one marker row: a short uppercase chip and a sentence beside it.
 *
 * The chip is not decoration. A row that does not fit is dimmed to 55%
 * opacity by the page's CSS, and opacity is not information — it says nothing
 * at all to a reader using a screen reader, and very little to one with low
 * vision. The words are what actually carry the meaning.
 */
function buildMarker(
  doc: Document,
  options: {
    readonly flag: string;
    readonly tag: string;
    readonly tagModifier?: string;
    readonly text?: string;
    readonly detailFlag?: string;
  }
): HTMLElement {
  const row = doc.createElement("p");
  row.className = "vehicle-fit";
  row.setAttribute(options.flag, "");
  row.hidden = true;

  const chip = doc.createElement("span");
  chip.className = "vehicle-fit__tag";
  if (options.tagModifier !== undefined) {
    chip.classList.add(options.tagModifier);
  }
  chip.textContent = options.tag;
  row.append(chip);

  const body = doc.createElement("span");
  if (options.text !== undefined) body.textContent = options.text;
  if (options.detailFlag !== undefined)
    body.setAttribute(options.detailFlag, "");
  row.append(body);

  return row;
}

/**
 * The card's marker rows, created on first need.
 *
 * Nothing is created for a card that fits cleanly, which is most of them — so
 * a listing of 154 terms with a Gen 3 truck selected builds a handful of
 * elements, not 308.
 */
function ensureMarkers(
  card: Element,
  config: VehicleListingConfig
): { fitRow: HTMLElement | null; provisionalRow: HTMLElement | null } {
  const doc = card.ownerDocument;
  if (doc === null) return { fitRow: null, provisionalRow: null };

  let fitRow = markerIn(card, "[data-entry-fit]");
  let provisionalRow = markerIn(card, "[data-entry-provisional]");
  if (fitRow !== null && provisionalRow !== null) {
    return { fitRow, provisionalRow };
  }

  fitRow ??= buildMarker(doc, {
    flag: "data-entry-fit",
    tag: config.filteredTag,
    text: config.doesNotFitLabel,
  });
  provisionalRow ??= buildMarker(doc, {
    flag: "data-entry-provisional",
    tag: config.provisionalLabel,
    tagModifier: "vehicle-fit__tag--provisional",
    detailFlag: "data-entry-provisional-detail",
  });

  // First children, so the qualification reads before the thing it qualifies.
  card.prepend(fitRow, provisionalRow);
  return { fitRow, provisionalRow };
}

/**
 * Paint one card against the reader's selection.
 *
 * With no selection every row is reset to its unfiltered state — which is what
 * makes clearing the chip restore the page rather than leave stale marks
 * behind.
 */
export function paintCardFitment(
  card: Element,
  selection: VehicleSelection | null,
  config: VehicleListingConfig
): CardFitment {
  /** Hide whatever markers this card has; never create any to hide. */
  const reset = () => {
    card.removeAttribute("data-fits");
    const fitRow = markerIn(card, "[data-entry-fit]");
    const provisionalRow = markerIn(card, "[data-entry-provisional]");
    if (fitRow !== null) fitRow.hidden = true;
    if (provisionalRow !== null) provisionalRow.hidden = true;
  };

  if (selection === null) {
    reset();
    return { fits: true, provisional: false };
  }

  const fitment = readCardFitment(card, config.fitments);
  if (fitment === null) {
    // A card with no readable fitment is a page bug, not a truck that does not
    // fit. Leave it as it was rather than accusing it of not fitting.
    reset();
    return { fits: true, provisional: false };
  }

  const fits = matchesVehicle(fitment, selection, config.taxonomy);
  const facets = provisionalMatchFacets(fitment, selection, config.taxonomy);
  const provisional = fits && facets.length > 0;

  card.setAttribute("data-fits", String(fits));

  if (fits && !provisional) {
    // Nothing to say about this row. Hide any markers it already grew, and do
    // not grow it any.
    reset();
    card.setAttribute("data-fits", "true");
    return { fits, provisional };
  }

  const { fitRow, provisionalRow } = ensureMarkers(card, config);
  if (fitRow !== null) fitRow.hidden = fits;
  if (provisionalRow !== null) provisionalRow.hidden = !provisional;

  const detail = markerIn(card, "[data-entry-provisional-detail]");
  if (detail !== null && provisional) {
    detail.textContent = config.provisionalTemplate.replace(
      "{facets}",
      config.listFormat.format(
        facets.map((facet) => config.facetLabels[facet] ?? facet)
      )
    );
  }

  return { fits, provisional };
}

/**
 * Paint every card and report the split.
 *
 * Cards the page's *other* filters have hidden are painted (so they are
 * correct when they come back) but not counted: "14 of 31 fit your truck"
 * has to be about the list the reader can actually see, or the two counters on
 * the page contradict each other.
 */
export function applyVehicleToListing(
  cards: Iterable<Element>,
  selection: VehicleSelection | null,
  config: VehicleListingConfig
): ListingFitment {
  let fitting = 0;
  let visible = 0;
  let anyProvisional = false;

  for (const card of cards) {
    const painted = paintCardFitment(card, selection, config);
    if ((card as HTMLElement).hidden) continue;
    visible += 1;
    if (painted.fits) fitting += 1;
    if (painted.provisional) anyProvisional = true;
  }

  return { fitting, visible, anyProvisional };
}

/* -------------------------------------------------------------------------
 * The whole listing, wired to `VehicleFitSummary.astro`
 * ---------------------------------------------------------------------- */

/** One page's vehicle filter, ready to be handed a selection. */
export interface VehicleListingView {
  readonly config: VehicleListingConfig;
  /** Paint every card and update the summary. Returns what it decided. */
  apply(selection: VehicleSelection | null): ListingFitment;
}

/**
 * Build the view from a page that renders `VehicleFitSummary.astro` and a card
 * list whose rows render `VehicleFitMarkers.astro`.
 *
 * Returns `null` when the page has no summary block — which is not an error,
 * it is a listing that has not opted in. A page that has opted in gets the
 * count line and the standing provisional warning for free, in its own locale,
 * with no page-level string handling at all.
 *
 * `lang` is the document's own `lang` attribute rather than a locale constant,
 * because the only thing it is used for is `Intl.ListFormat`'s grammar and the
 * document already states its language authoritatively (I18N-01).
 */
export function createVehicleListingView(input: {
  readonly root: ParentNode;
  readonly cards: readonly Element[];
  readonly taxonomy: Taxonomy;
  readonly lang: string;
}): VehicleListingView | null {
  const summary = input.root.querySelector<HTMLElement>(
    "[data-vehicle-summary]"
  );
  if (summary === null) return null;

  const fitLine = summary.querySelector<HTMLElement>("[data-vehicle-fit]");
  const note = summary.querySelector<HTMLElement>(
    "[data-vehicle-provisional-note]"
  );

  const config: VehicleListingConfig = {
    taxonomy: input.taxonomy,
    fitTemplate: summary.dataset["fitTemplate"] ?? "",
    provisionalTemplate: summary.dataset["provisionalTemplate"] ?? "",
    facetLabels: readFacetLabels(summary.dataset["facetLabels"]),
    filteredTag: summary.dataset["filteredTag"] ?? "",
    doesNotFitLabel: summary.dataset["doesNotFit"] ?? "",
    provisionalLabel: summary.dataset["provisionalLabel"] ?? "",
    fitments: readFitmentTable(summary.dataset["fitments"]),
    listFormat: new Intl.ListFormat(input.lang, {
      style: "long",
      type: "conjunction",
    }),
  };

  return {
    config,
    apply(selection) {
      const counts = applyVehicleToListing(input.cards, selection, config);

      summary.hidden = selection === null;
      if (selection !== null && fitLine !== null) {
        fitLine.textContent = formatCount(
          config.fitTemplate,
          counts.fitting,
          counts.visible
        );
      }
      if (note !== null) {
        note.hidden = selection === null || !counts.anyProvisional;
      }

      return counts;
    },
  };
}
