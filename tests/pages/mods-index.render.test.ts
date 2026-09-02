/**
 * The mods **index** page, rendered (T601, MOD-01).
 *
 * ## Why this file exists at all
 *
 * T501's audit found two defects that only a render grader can catch, and both
 * are re-implementable from scratch on any new listing page:
 *
 *  · **the bare-route `href`.** `entryRoutePath` returns a locale-independent
 *    route (`/mods/x/`); rendering it straight into an `href` is a 404 on
 *    every card. It shipped on *both* parts pages and no CI check saw it —
 *    `check:links`' internal-reference half is owed by T703, and the
 *    collection is empty at build time, so a green build proves nothing here.
 *  · **a derived state folded into a confident one.** This page's equivalent
 *    is `worstImpact`: a mod that breaks something must not render under its
 *    gentlest consequence, and a mod that declares none must not render as
 *    though it declared a mild one.
 *
 * Plus the conditional bands nothing else renders: the safety tag (including
 * the mods-specific widening — a card whose *affected* system is
 * safety-critical), the confidence caveat, and the empty state this page
 * actually ships in until T602 lands.
 *
 * Container-API pattern and fixture conventions follow
 * `tests/pages/parts-index.render.test.ts`.
 *
 * refs specs/001-foundation (MOD-01, I18N-01, I18N-05, FIT-03)
 */
import { beforeAll, describe, expect, it, vi } from "vitest";
import { confidenceCaveat, t } from "../../src/i18n/ui.ts";

type Locale = "en" | "es";

const LOCALES: readonly Locale[] = ["en", "es"];

const SEGMENT: Record<Locale, string> = { en: "mods", es: "modificaciones" };

/* -------------------------------------------------------------------------
 * The corpus
 * ---------------------------------------------------------------------- */

interface AffectsRow {
  readonly id: string;
  readonly system: string;
  readonly impact: string;
}

interface Fixture {
  readonly id: string;
  readonly system: string;
  readonly confidence: string;
  readonly difficulty: number;
  readonly cost: { from: string; to?: string };
  readonly safetyCritical?: boolean;
  readonly affects?: readonly AffectsRow[];
}

const FIXTURES: readonly Fixture[] = [
  /** Plain: no consequences, no bands. */
  {
    id: "test-index-plain",
    system: "body",
    confidence: "community-consensus",
    difficulty: 1,
    cost: { from: "minimal" },
  },
  /** Safety-critical by its own system. */
  {
    id: "test-index-suspension",
    system: "suspension",
    confidence: "community-consensus",
    difficulty: 4,
    cost: { from: "significant", to: "major" },
  },
  /**
   * Safety-critical *only* because of what it affects — the mods widening.
   * `electrical` is not on AGENTS.md's list; `brakes` is.
   */
  {
    id: "test-index-widened",
    system: "electrical",
    confidence: "community-consensus",
    difficulty: 3,
    cost: { from: "moderate" },
    affects: [{ id: "abs", system: "brakes", impact: "breaks" }],
  },
  /** Safety-critical by the upward-only flag — the third route in. */
  {
    id: "test-index-promoted",
    system: "interior",
    confidence: "community-consensus",
    difficulty: 2,
    cost: { from: "minimal" },
    safetyCritical: true,
  },
  /**
   * Declares two consequences of different severity. The card must show the
   * *worst*, not the first and not the gentlest.
   */
  {
    id: "test-index-mixed",
    // `transmission` deliberately: high-consequence to get wrong, and
    // deliberately *not* on `SAFETY_CRITICAL_SYSTEMS` (see the list's own
    // docstring), so this card is the negative control for the safety tag.
    system: "transmission",
    confidence: "community-consensus",
    difficulty: 2,
    cost: { from: "moderate" },
    affects: [
      { id: "aim", system: "electrical", impact: "needs-adjustment" },
      { id: "economy", system: "engine", impact: "degrades" },
    ],
  },
  /**
   * The same test in the *other* order: here the worst consequence is the
   * **first** row, where `test-index-mixed`'s is the last. Two orderings on
   * purpose — with only one, a card that simply printed `affects[0]` (or
   * `affects[last]`) would pass by luck, and "shows the worst" would be
   * graded by an accident of fixture order rather than by the rule.
   * Systems chosen off `SAFETY_CRITICAL_SYSTEMS` so this stays a
   * consequence-chip fixture and not a second safety one.
   */
  {
    id: "test-index-mixed-first",
    system: "hvac",
    confidence: "community-consensus",
    difficulty: 2,
    cost: { from: "moderate" },
    affects: [
      { id: "blower", system: "interior", impact: "breaks" },
      { id: "aim", system: "electrical", impact: "needs-adjustment" },
    ],
  },
  /** Below `tsb`: the card carries the confidence caveat. */
  {
    id: "test-index-caveat",
    system: "body",
    confidence: "anecdotal",
    difficulty: 1,
    cost: { from: "minimal" },
  },
  /** At the boundary: `tsb` itself needs no caveat. */
  {
    id: "test-index-tsb",
    system: "body",
    confidence: "tsb",
    difficulty: 1,
    cost: { from: "minimal" },
  },
];

function entryFor(fixture: Fixture) {
  const affects = fixture.affects ?? [];
  const notes = Object.fromEntries(
    affects.map((row) => [row.id, "TEST note."])
  );

  return {
    id: fixture.id,
    data: {
      id: fixture.id,
      fitment: { gens: ["gen3"] },
      system: fixture.system,
      cost: fixture.cost,
      difficulty: fixture.difficulty,
      requires: [],
      affects,
      confidence: fixture.confidence,
      ...(fixture.safetyCritical === undefined
        ? {}
        : { safetyCritical: fixture.safetyCritical }),
      sources: [],
      prose: {
        en: {
          title: `TEST ${fixture.id}`,
          summary: "Synthetic T601 fixture.",
          tradeoffs: "Synthetic T601 tradeoffs.",
          affectsNotes: notes,
        },
        es: {
          title: `PRUEBA ${fixture.id}`,
          summary: "Entrada sintética de T601.",
          tradeoffs: "Contras sintéticos de T601.",
          affectsNotes: notes,
        },
      },
    },
  };
}

/**
 * Mutable so the empty-state test can render the *same* page against a corpus
 * of zero entries — the state this page ships in until T602 lands, and the
 * state SCF-06 audits it in.
 */
let corpus: readonly Fixture[] = FIXTURES;

vi.mock("astro:content", () => ({
  getCollection: async (name: string) => {
    if (name === "mods") return corpus.map(entryFor);
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
    ENTRY_SLUGS: { mods: rows },
    slugRegistryIds: (collection: string) =>
      collection === "mods" ? Object.keys(rows) : [],
    entrySlug: (collection: string, id: string, locale: Locale) =>
      collection === "mods" ? (rows[id]?.[locale] ?? null) : null,
    entrySlugs: (collection: string, id: string) =>
      collection === "mods" ? (rows[id] ?? null) : null,
  };
});

function slugFor(id: string, locale: Locale): string {
  return locale === "en" ? id.replace("test-", "") : `es-${id}`;
}

let render: (locale: Locale) => Promise<string>;

beforeAll(async () => {
  const { experimental_AstroContainer } = await import("astro/container");
  const container = await experimental_AstroContainer.create();
  const page = await import("../../src/pages/[locale]/[modsSegment].astro");

  /*
   * The index page takes no `Astro.props` — every input is a route param — so
   * Astro types its component factory as `(_props: never) => …`, which is not
   * assignable to `renderToString`'s parameter. The cast is about that typing
   * quirk and nothing else.
   */
  type Renderable = Parameters<typeof container.renderToString>[0];

  render = (locale) =>
    container.renderToString(page.default as unknown as Renderable, {
      params: { locale, modsSegment: SEGMENT[locale] },
    });
});

/**
 * A `data-*` attribute matched at its own boundaries, never as a substring —
 * `toContain("data-mods-toolbar")` also matches a renamed
 * `data-mods-toolbar-v2`, so it cannot tell "the hook is here" from
 * "something that starts the same way is here".
 */
function attr(name: string): RegExp {
  return new RegExp(`(?<![\\w-])${name}(?![\\w-])`);
}

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
 * Slicing on the card's own `id` attribute is what makes "the safety tag is on
 * *this* card and not on that one" assertable at all; a whole-page
 * `toContain` cannot tell the difference, which is how a band rendered on
 * every card would pass.
 */
function card(html: string, entryId: string): string {
  const marker = `id="mod-${entryId}"`;
  const start = html.indexOf(marker);
  if (start === -1) {
    throw new Error(`no card rendered for \`${entryId}\``);
  }
  const next = html.indexOf('id="mod-', start + marker.length);
  return html.slice(start, next === -1 ? undefined : next);
}

/* -------------------------------------------------------------------------
 * Positive control
 * ---------------------------------------------------------------------- */

describe("the page renders at all", () => {
  it("renders a card per entry, in both locales", async () => {
    for (const locale of LOCALES) {
      const html = await render(locale);
      for (const fixture of FIXTURES) {
        expect(() => card(html, fixture.id)).not.toThrow();
      }
      expect(html).toMatch(attr("data-mods-toolbar"));
      expect(html).toMatch(attr("data-mods-list"));
    }
  });
});

/* -------------------------------------------------------------------------
 * Links (the T501 defect, not repeated)
 * ---------------------------------------------------------------------- */

describe("card links", () => {
  it("prefixes every card href with the locale, never a bare route", async () => {
    for (const locale of LOCALES) {
      const html = await render(locale);
      for (const fixture of FIXTURES) {
        const expected = `/${locale}/${SEGMENT[locale]}/${slugFor(fixture.id, locale)}/`;
        expect(card(html, fixture.id)).toContain(`href="${expected}"`);
      }
      // The bare, locale-less form is a 404 and must not appear.
      expect(html).not.toContain(`href="/${SEGMENT[locale]}/`);
    }
  });

  it("uses each locale's own segment and slug (I18N-01, I18N-05)", async () => {
    const en = await render("en");
    const es = await render("es");
    expect(en).toContain("/en/mods/index-plain/");
    expect(es).toContain("/es/modificaciones/es-test-index-plain/");
    expect(en).not.toContain("/en/modificaciones/");
    expect(es).not.toContain("/es/mods/");
  });
});

/* -------------------------------------------------------------------------
 * The consequence chip — MOD-01's "what it breaks or affects", on a card
 * ---------------------------------------------------------------------- */

describe("the consequence chip", () => {
  it("shows the WORST consequence when it is the LAST row declared", async () => {
    for (const locale of LOCALES) {
      const strings = t(locale);
      const html = card(await render(locale), "test-index-mixed");
      expect(html).toContain('data-impact="degrades"');
      expect(text(html)).toContain(strings["modImpact.degrades"]);
      expect(text(html)).not.toContain(strings["modImpact.needs-adjustment"]);
    }
  });

  it("shows the WORST consequence when it is the FIRST row declared", async () => {
    // Paired with the test above so neither `affects[0]` nor `affects[last]`
    // can pass both: the rule is the ranking, not a position.
    for (const locale of LOCALES) {
      const strings = t(locale);
      const html = card(await render(locale), "test-index-mixed-first");
      expect(html).toContain('data-impact="breaks"');
      expect(text(html)).toContain(strings["modImpact.breaks"]);
      expect(text(html)).not.toContain(strings["modImpact.needs-adjustment"]);
    }
  });

  it("shows `breaks` for an entry that breaks something", async () => {
    const html = card(await render("en"), "test-index-widened");
    expect(html).toContain('data-impact="breaks"');
    expect(text(html)).toContain(t("en")["modImpact.breaks"]);
  });

  it("shows NO chip for an entry that declares no consequences", async () => {
    for (const locale of LOCALES) {
      const strings = t(locale);
      const html = card(await render(locale), "test-index-plain");
      /*
       * The filter attribute is present and **empty** — Astro serializes an
       * empty-string attribute in its bare form, which the DOM reads back as
       * `dataset.impact === ""`, so `matchesModsFilter` sees the "no
       * consequence declared" state rather than a missing hook. Asserted as
       * "present, and carrying no vocabulary value" rather than as a literal
       * `data-impact=""`, which the serializer never emits.
       */
      expect(html).toMatch(/(?<![\w-])data-impact(?![\w-])/);
      expect(html).not.toMatch(/data-impact="[^"]+"/);
      for (const impact of [
        "modImpact.breaks",
        "modImpact.degrades",
        "modImpact.needs-adjustment",
      ] as const) {
        expect(text(html)).not.toContain(strings[impact]);
      }
    }
  });

  it("counts the consequences it declares", async () => {
    const strings = t("en");
    expect(text(card(await render("en"), "test-index-mixed"))).toContain(
      strings.modsAffectsCountTemplate.replace("{count}", "2")
    );
  });
});

/* -------------------------------------------------------------------------
 * Safety, including the mods-specific widening
 * ---------------------------------------------------------------------- */

describe("the safety-critical tag", () => {
  it("is on a card whose own system is safety-critical", async () => {
    for (const locale of LOCALES) {
      expect(
        text(card(await render(locale), "test-index-suspension"))
      ).toContain(t(locale).safetyCriticalChipLabel);
    }
  });

  it("is on a card whose AFFECTED system is safety-critical", async () => {
    // The widening, rendered: `electrical` is not on the list, `brakes` is.
    for (const locale of LOCALES) {
      expect(text(card(await render(locale), "test-index-widened"))).toContain(
        t(locale).safetyCriticalChipLabel
      );
    }
  });

  it("is on a card promoted by the upward-only flag", async () => {
    expect(text(card(await render("en"), "test-index-promoted"))).toContain(
      t("en").safetyCriticalChipLabel
    );
  });

  it("is NOT on a card that is none of those things", async () => {
    expect(text(card(await render("en"), "test-index-plain"))).not.toContain(
      t("en").safetyCriticalChipLabel
    );
    expect(text(card(await render("en"), "test-index-mixed"))).not.toContain(
      t("en").safetyCriticalChipLabel
    );
  });
});

/* -------------------------------------------------------------------------
 * Figures and the confidence caveat
 * ---------------------------------------------------------------------- */

describe("figures", () => {
  it("renders the difficulty from shared data, in both locales", async () => {
    for (const locale of LOCALES) {
      const strings = t(locale);
      const expected = strings.modsDifficultyTemplate
        .replace("{value}", "4")
        .replace("{max}", "5");
      expect(
        text(card(await render(locale), "test-index-suspension"))
      ).toContain(expected);
    }
  });

  it("renders a cost range as glyphs with a spoken name", async () => {
    const html = card(await render("en"), "test-index-suspension");
    // `significant`–`major` is the third and fourth band.
    expect(html).toContain("$$$–$$$$");
    expect(html).toContain("aria-label=");
  });
});

describe("the confidence caveat", () => {
  it("is on a card below `tsb`, in that card's locale", async () => {
    for (const locale of LOCALES) {
      expect(text(card(await render(locale), "test-index-caveat"))).toContain(
        confidenceCaveat(t(locale), "anecdotal")
      );
    }
  });

  it("is NOT on a `tsb` card — the boundary is inclusive", async () => {
    expect(text(card(await render("en"), "test-index-tsb"))).not.toContain(
      confidenceCaveat(t("en"), "tsb")
    );
  });
});

/* -------------------------------------------------------------------------
 * The empty state — how this page actually ships until T602
 * ---------------------------------------------------------------------- */

describe("the empty state", () => {
  it("renders the empty sentence and no dead controls", async () => {
    corpus = [];
    try {
      for (const locale of LOCALES) {
        const html = await render(locale);
        expect(text(html)).toContain(t(locale).modsEmpty);
        expect(html).not.toMatch(attr("data-mods-toolbar"));
        expect(html).not.toMatch(attr("data-mods-list"));
      }
    } finally {
      corpus = FIXTURES;
    }
  });
});
