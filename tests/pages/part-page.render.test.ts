/**
 * The part page, rendered (T501 review, F1).
 *
 * ## Why this file exists, stated plainly
 *
 * `tests/lib/parts/parts-graph.test.ts` already graded the supersession
 * graph — including the consolidation shape where two old numbers are replaced
 * by the *current* one — and it passed while the page rendered nothing at all
 * for that shape. It asked `supersessionChain` a question and the template
 * answered a different one (`chainRows.length > 1`), so the section heading,
 * the chain, the fork note and both older numbers were suppressed on the one
 * page a reader actually orders a part from.
 *
 * A grader that stops at the library boundary cannot catch that class of
 * defect, by construction. So this one does not stop there: it renders the
 * real `[partSlug].astro` through Astro's container API and asserts on the
 * **HTML**. If the template stops asking `supersessionView`, or re-introduces
 * a length gate, or re-labels a forked head "oldest", these go red.
 *
 * The fixtures are synthetic in `tests/fixtures/schema-fixtures.ts`' sense —
 * `TEST-`-namespaced part numbers, `test-`-prefixed ids — because AGENTS.md
 * treats an invented part number as the highest-consequence hallucination in
 * this domain and a plausible one in a fixture is how it leaks into content.
 *
 * refs specs/001-foundation (PRT-02, I18N-01, I18N-05)
 */
import { beforeAll, describe, expect, it, vi } from "vitest";
import { t } from "../../src/i18n/ui.ts";

/* -------------------------------------------------------------------------
 * The corpus these tests render
 *
 * Three shapes, one entry each way:
 *  · `test-fork-*`   — two old numbers consolidated into the CURRENT number.
 *                      One chain row, a real history. The F1 defect's shape.
 *  · `test-line-*`   — an ordinary two-link chain.
 *  · `test-solo`     — a part with no history at all.
 * ---------------------------------------------------------------------- */

interface Part {
  readonly id: string;
  readonly oemNumber: string;
  readonly supersededBy?: string;
  readonly vendors?: readonly string[];
}

const PARTS: readonly Part[] = [
  { id: "test-fork-a", oemNumber: "TEST-F0001", supersededBy: "test-fork-c" },
  { id: "test-fork-b", oemNumber: "TEST-F0002", supersededBy: "test-fork-c" },
  { id: "test-fork-c", oemNumber: "TEST-F0003", vendors: ["test-shop"] },
  { id: "test-line-a", oemNumber: "TEST-L0001", supersededBy: "test-line-b" },
  { id: "test-line-b", oemNumber: "TEST-L0002" },
  { id: "test-solo", oemNumber: "TEST-S0001" },
];

function entryFor(part: Part) {
  return {
    id: part.id,
    data: {
      id: part.id,
      fitment: { gens: ["gen3"] },
      oemNumber: part.oemNumber,
      ...(part.supersededBy === undefined
        ? {}
        : { supersededBy: part.supersededBy }),
      ...(part.vendors === undefined ? {} : { vendors: part.vendors }),
      system: "engine",
      confidence: "fsm-confirmed",
      sources: [],
      prose: {
        en: { title: `TEST ${part.id}`, summary: "Synthetic T501 fixture." },
        es: { title: `PRUEBA ${part.id}`, summary: "Ficha sintética de T501." },
      },
    },
  };
}

/** One `community` seller, so the vendors section has something to resolve. */
const SELLERS = [
  {
    id: "test-shop",
    data: {
      id: "test-shop",
      communityType: "shop",
      prose: {
        en: { title: "TEST parts shop" },
        es: { title: "TIENDA de prueba" },
      },
    },
  },
];

vi.mock("astro:content", () => ({
  getCollection: async (name: string) => {
    if (name === "parts") return PARTS.map(entryFor);
    if (name === "community") return SELLERS;
    return [];
  },
}));

/**
 * The slug registry, stubbed so these fixtures have URLs. Mocked at
 * `entry-slugs` rather than at `routes` on purpose: the real
 * `entryRoutePaths` / `entryRouteParams` still run, so this also exercises the
 * two-registry composition that builds `/en/parts/<slug>/` and
 * `/es/repuestos/<slug>/` (I18N-05).
 */
vi.mock("../../src/i18n/entry-slugs.ts", () => {
  const rows = Object.fromEntries(
    PARTS.map((part) => [
      part.id,
      { en: part.id.replace("test-", ""), es: `es-${part.id}` },
    ])
  );
  return {
    ENTRY_SLUGS: { parts: rows },
    slugRegistryIds: (collection: string) =>
      collection === "parts" ? Object.keys(rows) : [],
    entrySlug: (collection: string, id: string, locale: "en" | "es") =>
      collection === "parts" ? (rows[id]?.[locale] ?? null) : null,
    entrySlugs: (collection: string, id: string) =>
      collection === "parts" ? (rows[id] ?? null) : null,
  };
});

type Locale = "en" | "es";

let render: (entryId: string, locale: Locale) => Promise<string>;

beforeAll(async () => {
  const { experimental_AstroContainer } = await import("astro/container");
  const container = await experimental_AstroContainer.create();
  const page =
    await import("../../src/pages/[locale]/[partsSegment]/[partSlug].astro");

  render = (entryId, locale) =>
    container.renderToString(page.default, {
      params: {
        locale,
        partsSegment: locale === "en" ? "parts" : "repuestos",
        partSlug: "ignored-the-page-reads-the-prop",
      },
      props: { entryId },
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

const LOCALES: readonly Locale[] = ["en", "es"];

describe("a chain that forks into the current number (T501 review, F1)", () => {
  it.each(LOCALES)(
    "renders the supersession section in %s even though the chain is one row",
    async (locale) => {
      const strings = t(locale);
      const body = text(await render("test-fork-c", locale));

      // The gate. A length test suppressed every one of these.
      expect(body).toContain(strings.partsSupersessionHeading);
      expect(body).toContain(strings.partsSupersessionForkNote);
      expect(body).toContain("TEST-F0003");
    }
  );

  it.each(LOCALES)(
    "names both older numbers in %s — they are the reader's way back",
    async (locale) => {
      const body = text(await render("test-fork-c", locale));
      expect(body).toContain("TEST-F0001");
      expect(body).toContain("TEST-F0002");
    }
  );

  it.each(LOCALES)(
    "links each older number to its own page in %s",
    async (locale) => {
      const html = await render("test-fork-c", locale);
      const segment = locale === "en" ? "parts" : "repuestos";
      const slug = (id: string) =>
        locale === "en" ? id.replace("test-", "") : `es-${id}`;

      expect(html).toContain(`/${locale}/${segment}/${slug("test-fork-a")}/`);
      expect(html).toContain(`/${locale}/${segment}/${slug("test-fork-b")}/`);
    }
  );

  it.each(LOCALES)(
    "never calls the forked head the oldest number in %s (F2)",
    async (locale) => {
      const strings = t(locale);
      const body = text(await render("test-fork-c", locale));

      // The head demonstrably has older numbers behind it — the ones this very
      // page lists. Labelling it "oldest" above them is a false ordering claim
      // on a page a reader orders a part from.
      expect(body).not.toContain(strings.partsSupersessionOldestLabel);
    }
  );

  it.each(LOCALES)(
    "still marks the current number as the one to order in %s",
    async (locale) => {
      const body = text(await render("test-fork-c", locale));
      expect(body).toContain(t(locale).partsCurrentBadge);
    }
  );

  it("puts the older numbers above the chain, not below it", async () => {
    const body = text(await render("test-fork-c", "en"));
    const older = body.indexOf("TEST-F0001");
    const current = body.lastIndexOf("TEST-F0003");
    expect(older).toBeGreaterThan(-1);
    // The chain is introduced as "each number was replaced by the one after
    // it"; numbers older than all of them belong before it, not after.
    expect(older).toBeLessThan(current);
  });
});

describe("an ordinary linear chain", () => {
  it.each(LOCALES)("runs oldest → current in %s", async (locale) => {
    const strings = t(locale);
    const body = text(await render("test-line-a", locale));

    expect(body).toContain(strings.partsSupersessionHeading);
    expect(body).toContain(strings.partsSupersessionOldestLabel);
    expect(body).not.toContain(strings.partsSupersessionForkNote);
    expect(body.indexOf("TEST-L0001")).toBeLessThan(
      body.lastIndexOf("TEST-L0002")
    );
  });

  it("badges the superseded number as replaced, not as orderable", async () => {
    const strings = t("en");
    const body = text(await render("test-line-a", "en"));
    expect(body).toContain(strings.partsSupersededBadge);
  });
});

describe("a part with no history", () => {
  it.each(LOCALES)("renders no supersession section in %s", async (locale) => {
    const strings = t(locale);
    const body = text(await render("test-solo", locale));

    expect(body).not.toContain(strings.partsSupersessionHeading);
    expect(body).not.toContain(strings.partsSupersessionForkNote);
    expect(body).toContain("TEST-S0001");
    expect(body).toContain(strings.partsCurrentBadge);
  });
});

describe("both locales are real pages, not translations of one (I18N-01)", () => {
  it("emits a symmetric hreflang set with x-default on a part page", async () => {
    for (const locale of LOCALES) {
      const html = await render("test-fork-c", locale);
      expect(html).toContain('hreflang="en"');
      expect(html).toContain('hreflang="es"');
      expect(html).toContain('hreflang="x-default"');
      expect(html).toContain("/en/parts/fork-c/");
      expect(html).toContain("/es/repuestos/es-test-fork-c/");
    }
  });

  /*
   * The regression these two pin: `collectionRoutePath` returns a
   * **locale-independent** route (`/parts/`, `/community/`), and rendering one
   * straight into an `href` produces a 404. It shipped in the first T501
   * commit on every internal link of both parts pages, and no CI check saw it
   * — `check:links`' internal-reference half is owed by T703 and the
   * collection was empty at build time. The chain links are covered above;
   * these are the other two exits from the page (T501 review round 1).
   */
  it.each(LOCALES)(
    "localizes the crumb back to the index in %s",
    async (locale) => {
      const html = await render("test-fork-c", locale);
      const segment = locale === "en" ? "parts" : "repuestos";
      expect(html).toContain(`href="/${locale}/${segment}/"`);
      expect(html).not.toContain(`href="/${segment}/"`);
    }
  );

  it.each(LOCALES)("localizes the vendor link in %s", async (locale) => {
    const html = await render("test-fork-c", locale);
    const segment = locale === "en" ? "community" : "comunidad";
    expect(html).toContain(`href="/${locale}/${segment}/#community-test-shop"`);
    expect(html).not.toContain(`href="/${segment}/#community-test-shop"`);
  });

  it("renders each locale's own prose", async () => {
    expect(text(await render("test-fork-c", "en"))).toContain(
      "TEST test-fork-c"
    );
    expect(text(await render("test-fork-c", "es"))).toContain(
      "PRUEBA test-fork-c"
    );
  });
});
