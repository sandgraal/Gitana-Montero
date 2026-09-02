/**
 * The parts **index** page, rendered (T501 audit follow-up, F3).
 *
 * ## Why this file exists
 *
 * `src/pages/[locale]/[partsSegment].astro` had no render grader of any kind.
 * The detail page got one (`tests/pages/part-page.render.test.ts`, written
 * after a template/lib disagreement shipped); the index page — which is the
 * page a reader lands on, and which independently re-derives the same PRT-02
 * "is this the number to order" answer through a *different* expression
 * (`chain?.current ?? null` rather than `supersessionView`) — got nothing.
 *
 * Two of the four defects graded below are ones the detail page already
 * shipped once and had pinned, and this page reimplements from scratch:
 *
 *  · **the bare-route `href`.** `entryRoutePath` returns a locale-independent
 *    route (`/parts/x/`); rendering it straight into an `href` is a 404 on
 *    every card. It shipped in T501's first commit on *both* pages, and no CI
 *    check saw it — `check:links`' internal-reference half is owed by T703
 *    and the collection is empty at build time, so a green build proves
 *    nothing here.
 *  · **the supersession badge.** The card prints "Order this one" or
 *    "Replaced" from its own two-line derivation. Inverting it sends a reader
 *    to a parts counter with a number that is no longer sold.
 *
 * Plus the two conditional card bands nothing had ever rendered: the
 * safety-critical tag and the confidence caveat.
 *
 * Container-API pattern and fixture conventions follow
 * `tests/pages/part-page.render.test.ts`: `TEST-`-namespaced part numbers and
 * `test-`-prefixed ids, because AGENTS.md treats an invented part number as
 * the highest-consequence hallucination in this domain.
 *
 * Also closed on this branch, one layer out: `/en/parts/` and `/es/repuestos/`
 * were missing from `tests/e2e/hidden-guard.spec.ts`' `UNCONDITIONAL_PAGES`
 * even though this page carries a `[hidden]` element (`[data-parts-none]`)
 * and lays its toolbar out with `display: flex`. T401's problems pages were
 * added to that list the same day; parts was simply missed.
 *
 * refs specs/001-foundation (PRT-01, PRT-02, I18N-01, I18N-05, FIT-03)
 */
import { beforeAll, describe, expect, it, vi } from "vitest";
import { confidenceCaveat, t } from "../../src/i18n/ui.ts";

type Locale = "en" | "es";

const LOCALES: readonly Locale[] = ["en", "es"];

const SEGMENT: Record<Locale, string> = { en: "parts", es: "repuestos" };

/* -------------------------------------------------------------------------
 * The corpus
 * ---------------------------------------------------------------------- */

interface Fixture {
  readonly id: string;
  readonly oemNumber: string;
  readonly system: string;
  readonly confidence: string;
  readonly supersededBy?: string;
  readonly safetyCritical?: boolean;
  readonly quantityPerVehicle?: number;
}

const FIXTURES: readonly Fixture[] = [
  /** A plain, current number: green badge, no bands. */
  {
    id: "test-index-current",
    oemNumber: "TEST-I0001",
    system: "engine",
    confidence: "fsm-confirmed",
  },
  /** Replaced by the next one: the superseded badge and the replacement line. */
  {
    id: "test-index-old",
    oemNumber: "TEST-I0002",
    system: "engine",
    confidence: "fsm-confirmed",
    supersededBy: "test-index-new",
  },
  /** The successor — current, and with a predecessor behind it. */
  {
    id: "test-index-new",
    oemNumber: "TEST-I0003",
    system: "engine",
    confidence: "fsm-confirmed",
  },
  /** Safety-critical by system. */
  {
    id: "test-index-safety",
    oemNumber: "TEST-I0004",
    system: "brakes",
    confidence: "fsm-confirmed",
  },
  /** Safety-critical by the upward-only flag — the other route in. */
  {
    id: "test-index-promoted",
    oemNumber: "TEST-I0005",
    system: "electrical",
    confidence: "fsm-confirmed",
    safetyCritical: true,
  },
  /** Below `tsb`: the card carries the confidence caveat. */
  {
    id: "test-index-caveat",
    oemNumber: "TEST-I0006",
    system: "engine",
    confidence: "anecdotal",
  },
  /** At the boundary: `tsb` itself needs no caveat. */
  {
    id: "test-index-tsb",
    oemNumber: "TEST-I0007",
    system: "engine",
    confidence: "tsb",
  },
  /** States a quantity — the collection's one figure, as a chip. */
  {
    id: "test-index-quantity",
    oemNumber: "TEST-I0008",
    system: "suspension",
    confidence: "fsm-confirmed",
    quantityPerVehicle: 2,
  },
];

function entryFor(fixture: Fixture) {
  return {
    id: fixture.id,
    data: {
      id: fixture.id,
      fitment: { gens: ["gen3"] },
      oemNumber: fixture.oemNumber,
      system: fixture.system,
      confidence: fixture.confidence,
      ...(fixture.supersededBy === undefined
        ? {}
        : { supersededBy: fixture.supersededBy }),
      ...(fixture.safetyCritical === undefined
        ? {}
        : { safetyCritical: fixture.safetyCritical }),
      ...(fixture.quantityPerVehicle === undefined
        ? {}
        : { quantityPerVehicle: fixture.quantityPerVehicle }),
      sources: [],
      prose: {
        en: { title: `TEST ${fixture.id}`, summary: "Synthetic T501 fixture." },
        es: {
          title: `PRUEBA ${fixture.id}`,
          summary: "Ficha sintética de T501.",
        },
      },
    },
  };
}

/**
 * Mutable so the empty-state test can render the *same* page against a corpus
 * of zero entries — which is the state this page actually ships in until
 * T503 lands, and the state SCF-06 audits it in.
 */
let corpus: readonly Fixture[] = FIXTURES;

vi.mock("astro:content", () => ({
  getCollection: async (name: string) => {
    if (name === "parts") return corpus.map(entryFor);
    return [];
  },
}));

vi.mock("../../src/i18n/entry-slugs.ts", () => {
  const rows = Object.fromEntries(
    FIXTURES.map((fixture) => [
      fixture.id,
      { en: fixture.id.replace("test-", ""), es: `es-${fixture.id}` },
    ])
  );
  return {
    ENTRY_SLUGS: { parts: rows },
    slugRegistryIds: (collection: string) =>
      collection === "parts" ? Object.keys(rows) : [],
    entrySlug: (collection: string, id: string, locale: Locale) =>
      collection === "parts" ? (rows[id]?.[locale] ?? null) : null,
    entrySlugs: (collection: string, id: string) =>
      collection === "parts" ? (rows[id] ?? null) : null,
  };
});

function slugFor(id: string, locale: Locale): string {
  return locale === "en" ? id.replace("test-", "") : `es-${id}`;
}

let render: (locale: Locale) => Promise<string>;

beforeAll(async () => {
  const { experimental_AstroContainer } = await import("astro/container");
  const container = await experimental_AstroContainer.create();
  const page = await import("../../src/pages/[locale]/[partsSegment].astro");

  /*
   * The index page takes no `Astro.props` — every input is a route param — so
   * Astro types its component factory as `(_props: never) => …`, which is not
   * assignable to `renderToString`'s parameter. The cast is about that typing
   * quirk and nothing else; it changes no behaviour, and the detail-page
   * render tests need no equivalent because that page does read a prop.
   */
  type Renderable = Parameters<typeof container.renderToString>[0];

  render = (locale) =>
    container.renderToString(page.default as unknown as Renderable, {
      params: { locale, partsSegment: SEGMENT[locale] },
    });
});

/** The rendered text with tags and entities flattened, for phrase matching. */
function text(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/g, " ")
    .replace(/<style[\s\S]*?<\/style>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#8212;|&mdash;/g, "—")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Just one card's HTML.
 *
 * Cards are `<li class="part" id="part-<entry id>" …>`, and everything a card
 * renders — its link, its badge, its tags, its caveat — comes after that `id`
 * attribute and before the next card's. Slicing on the attribute is what
 * makes "the safety tag is on *this* card and not on that one" assertable at
 * all; a whole-page `toContain` cannot tell the difference, which is how a
 * band rendered on every card would pass.
 */
function card(html: string, entryId: string): string {
  const marker = `id="part-${entryId}"`;
  const start = html.indexOf(marker);
  if (start === -1) {
    throw new Error(
      `no card for \`${entryId}\` in the rendered index — the fixture did ` +
        `not render at all, which would make every assertion about it ` +
        `vacuous`
    );
  }
  const rest = html.slice(start + marker.length);
  const next = rest.indexOf('id="part-');
  return next === -1 ? rest : rest.slice(0, next);
}

/* -------------------------------------------------------------------------
 * Every card is present — the control the rest of the file rests on
 * ---------------------------------------------------------------------- */

describe("the listing", () => {
  it.each(LOCALES)("renders one card per entry in %s", async (locale) => {
    const html = await render(locale);
    for (const fixture of FIXTURES) {
      expect(html).toContain(`id="part-${fixture.id}"`);
      expect(text(html)).toContain(fixture.oemNumber);
    }
  });

  it.each(LOCALES)("renders the heading and intro in %s", async (locale) => {
    const strings = t(locale);
    const body = text(await render(locale));
    expect(body).toContain(strings.partsHeading);
    expect(body).toContain(strings.partsIntro);
    expect(body).not.toContain(strings.partsEmpty);
  });

  it.each(LOCALES)("renders each locale's own titles in %s", async (locale) => {
    const body = text(await render(locale));
    const expected =
      locale === "en" ? "TEST test-index-current" : "PRUEBA test-index-current";
    const other =
      locale === "en" ? "PRUEBA test-index-current" : "TEST test-index-current";
    expect(body).toContain(expected);
    expect(body).not.toContain(other);
  });
});

/* -------------------------------------------------------------------------
 * Card links (I18N-05) — the bare-route regression
 * ---------------------------------------------------------------------- */

describe("every card links to a URL that exists", () => {
  it.each(LOCALES)(
    "prefixes the locale on every card link in %s",
    async (locale) => {
      const html = await render(locale);
      for (const fixture of FIXTURES) {
        expect(card(html, fixture.id)).toContain(
          `href="/${locale}/${SEGMENT[locale]}/${slugFor(fixture.id, locale)}/"`
        );
      }
    }
  );

  it.each(LOCALES)(
    "never emits the locale-independent route as an href in %s",
    async (locale) => {
      const html = await render(locale);
      // `entryRoutePath`'s own output, rendered raw, is a 404.
      expect(html).not.toContain(`href="/${SEGMENT[locale]}/`);
    }
  );

  it("uses each locale's own slug, not the other's (I18N-01)", async () => {
    const en = await render("en");
    const es = await render("es");
    expect(en).toContain('href="/en/parts/index-current/"');
    expect(es).toContain('href="/es/repuestos/es-test-index-current/"');
    expect(en).not.toContain("es-test-index-current");
    expect(es).not.toContain('href="/es/repuestos/index-current/"');
  });
});

/* -------------------------------------------------------------------------
 * PRT-02 on the card — which number do I order?
 * ---------------------------------------------------------------------- */

describe("the supersession badge (PRT-02)", () => {
  it.each(LOCALES)(
    "badges a replaced number as replaced in %s, and never as orderable",
    async (locale) => {
      const strings = t(locale);
      const replaced = card(await render(locale), "test-index-old");

      expect(replaced).toContain("part__badge--superseded");
      expect(text(replaced)).toContain(strings.partsSupersededBadge);
      expect(replaced).not.toContain("part__badge--current");
      expect(text(replaced)).not.toContain(strings.partsCurrentBadge);
    }
  );

  it.each(LOCALES)(
    "badges the current number as orderable in %s, and never as replaced",
    async (locale) => {
      const strings = t(locale);
      const current = card(await render(locale), "test-index-new");

      expect(current).toContain("part__badge--current");
      expect(text(current)).toContain(strings.partsCurrentBadge);
      expect(current).not.toContain("part__badge--superseded");
      expect(text(current)).not.toContain(strings.partsSupersededBadge);
    }
  );

  it.each(LOCALES)(
    "badges a part with no history at all as orderable in %s",
    async (locale) => {
      const solo = card(await render(locale), "test-index-current");
      expect(solo).toContain("part__badge--current");
      expect(solo).not.toContain("part__badge--superseded");
    }
  );

  it.each(LOCALES)(
    "names the replacement number on the replaced card in %s",
    async (locale) => {
      const strings = t(locale);
      const replaced = text(card(await render(locale), "test-index-old"));

      expect(replaced).toContain(strings.partsSupersessionCurrentLabel);
      // The number a reader should actually order, on the card that is not it.
      expect(replaced).toContain("TEST-I0003");
    }
  );

  it.each(LOCALES)(
    "does not offer a replacement number on a current card in %s",
    async (locale) => {
      const strings = t(locale);
      const current = text(card(await render(locale), "test-index-new"));
      expect(current).not.toContain(strings.partsSupersessionCurrentLabel);
    }
  );
});

/* -------------------------------------------------------------------------
 * The safety tag
 * ---------------------------------------------------------------------- */

describe("the safety-critical tag", () => {
  it.each(LOCALES)("renders on a brakes card in %s", async (locale) => {
    const safety = card(await render(locale), "test-index-safety");
    expect(safety).toContain("tag--safety");
    expect(text(safety)).toContain(t(locale).safetyCriticalChipLabel);
  });

  it.each(LOCALES)(
    "renders in %s on a card promoted by the upward-only flag",
    async (locale) => {
      const promoted = card(await render(locale), "test-index-promoted");
      expect(text(promoted)).toContain(t(locale).safetyCriticalChipLabel);
    }
  );

  it.each(LOCALES)(
    "is absent in %s on a card that is not safety-critical",
    async (locale) => {
      const plain = card(await render(locale), "test-index-current");
      expect(plain).not.toContain("tag--safety");
      expect(text(plain)).not.toContain(t(locale).safetyCriticalChipLabel);
    }
  );
});

/* -------------------------------------------------------------------------
 * The confidence caveat, per card
 * ---------------------------------------------------------------------- */

describe("the confidence caveat on a card", () => {
  it.each(LOCALES)(
    "renders in both languages on a sub-`tsb` card in %s",
    async (locale) => {
      const caveat = text(card(await render(locale), "test-index-caveat"));
      for (const each of LOCALES) {
        expect(caveat).toContain(confidenceCaveat(t(each), "anecdotal"));
      }
    }
  );

  it.each(LOCALES)(
    "is absent in %s on a `tsb` card — `tsb` is the boundary, not below it",
    async (locale) => {
      const boundary = card(await render(locale), "test-index-tsb");
      expect(boundary).not.toContain('class="caveat"');
      expect(text(boundary)).not.toContain(confidenceCaveat(t(locale), "tsb"));
    }
  );

  it.each(LOCALES)(
    "is absent in %s on an `fsm-confirmed` card",
    async (locale) => {
      const confirmed = card(await render(locale), "test-index-current");
      expect(confirmed).not.toContain('class="caveat"');
    }
  );
});

/* -------------------------------------------------------------------------
 * The quantity chip
 * ---------------------------------------------------------------------- */

describe("the quantity-per-vehicle chip", () => {
  it.each(LOCALES)("renders the count in %s", async (locale) => {
    const strings = t(locale);
    const withQuantity = text(
      card(await render(locale), "test-index-quantity")
    );
    expect(withQuantity).toContain(
      strings.partsQuantityTemplate.replace("{count}", "2")
    );
  });

  it.each(LOCALES)(
    "is absent in %s on a card that states no quantity",
    async (locale) => {
      const strings = t(locale);
      const without = text(card(await render(locale), "test-index-current"));
      expect(without).not.toContain(
        strings.partsQuantityTemplate.replace("{count}", "").trim()
      );
    }
  );
});

/* -------------------------------------------------------------------------
 * The toolbar, the count and the two locales' own pages
 * ---------------------------------------------------------------------- */

describe("the page around the listing", () => {
  it.each(LOCALES)(
    "offers a system pill for every system present in %s, and no others",
    async (locale) => {
      const html = await render(locale);
      for (const system of ["engine", "brakes", "electrical", "suspension"]) {
        expect(html).toContain(`data-value="${system}"`);
      }
      expect(html).not.toContain('data-value="transmission"');
    }
  );

  it.each(LOCALES)("counts the entries in %s", async (locale) => {
    const html = await render(locale);
    expect(html).toContain(`data-total="${FIXTURES.length}"`);
  });

  it("emits a symmetric hreflang set with x-default", async () => {
    for (const locale of LOCALES) {
      const html = await render(locale);
      expect(html).toContain('hreflang="en"');
      expect(html).toContain('hreflang="es"');
      expect(html).toContain('hreflang="x-default"');
      expect(html).toContain("/en/parts/");
      expect(html).toContain("/es/repuestos/");
    }
  });

  /**
   * The state this page actually ships in until T503 authors entries: the
   * heading, the intro and `partsEmpty` — no toolbar, no dead controls, no
   * count of zero.
   */
  it.each(LOCALES)(
    "renders the empty state in %s with no toolbar",
    async (locale) => {
      const strings = t(locale);
      corpus = [];
      try {
        const html = await render(locale);
        expect(text(html)).toContain(strings.partsEmpty);
        expect(html).not.toContain("data-parts-toolbar");
        expect(html).not.toContain("data-parts-list");
      } finally {
        corpus = FIXTURES;
      }
    }
  );
});
