/**
 * Neither parts page prints a confident badge from a chain it could not
 * resolve (T501 audit follow-up, F5 — the page half).
 *
 * ## The defect
 *
 * `supersessionChain` returns `null` for the three cases it cannot answer:
 * an unknown id, a pointer to an entry nobody wrote, and a loop. Both parts
 * pages then coalesce that `null` into the *confident* branch of a
 * two-valued badge:
 *
 *  · `[partSlug].astro` — `supersessionView` maps `null` to `rows: []`, and
 *    `chainRows.every((row) => !row.isCurrent || row.id === entryId)` over an
 *    empty array is vacuously `true`. The page prints "Order this one".
 *  · `[partsSegment].astro` — `const current = chain?.current ?? null` makes
 *    `superseded` `false`. The card prints the green "Order this one" badge.
 *
 * Both are the doctrine `.claude/GRADER-PRINCIPLES.md` names: *unknown is not
 * zero, and a failure is not an empty result*. The entry in these fixtures
 * **says it was superseded** — `supersededBy` is set — and the page answers
 * "order this one" because it failed to follow the pointer. That is not a
 * missing answer, it is a wrong one, on the single surface where being wrong
 * costs a reader money at a parts counter.
 *
 * ## Reachability — stated plainly
 *
 * These corpora cannot occur in a shipped build:
 * `src/integrations/validate-parts.ts` fails the build on a dangling pointer
 * and on a cycle, and both are also caught by `findPartIssues`. So this is
 * **defense-in-depth**, and the graders are `it.fails` rather than a
 * production incident. They are written anyway because the *only* thing
 * standing between this default and a reader is one build guard, and because
 * the identical bug shape has now recurred three times in 002 (PR #68,
 * T2-303's derived sheet, T2-303's F8) — each time somewhere a previous
 * reviewer had reasoned it was unreachable.
 *
 * The container API is how the corpus is reachable *at all*: it renders the
 * real `.astro` files against a mocked `astro:content`, which is exactly the
 * build guard's blind side.
 *
 * The lib-level half is `tests/lib/parts/supersession-unknown-state.test.ts`,
 * which also records the recommended fix shape.
 *
 * refs specs/001-foundation (PRT-02), .claude/GRADER-PRINCIPLES.md
 */
import { beforeAll, describe, expect, it, vi } from "vitest";
import { t } from "../../src/i18n/ui.ts";

type Locale = "en" | "es";

const LOCALES: readonly Locale[] = ["en", "es"];
const SEGMENT: Record<Locale, string> = { en: "parts", es: "repuestos" };

interface Fixture {
  readonly id: string;
  readonly oemNumber: string;
  readonly supersededBy?: string;
}

const FIXTURES: readonly Fixture[] = [
  /** Says it was replaced, by an entry that does not exist. */
  {
    id: "test-dangling",
    oemNumber: "TEST-U0001",
    supersededBy: "test-nobody-wrote-this",
  },
  /** A two-node loop: neither number can be the end of a chain. */
  { id: "test-loop-a", oemNumber: "TEST-U0002", supersededBy: "test-loop-b" },
  { id: "test-loop-b", oemNumber: "TEST-U0003", supersededBy: "test-loop-a" },
  /** The resolvable control pair — a real replacement. */
  {
    id: "test-real-old",
    oemNumber: "TEST-U0004",
    supersededBy: "test-real-new",
  },
  { id: "test-real-new", oemNumber: "TEST-U0005" },
];

function entryFor(fixture: Fixture) {
  return {
    id: fixture.id,
    data: {
      id: fixture.id,
      fitment: { gens: ["gen3"] },
      oemNumber: fixture.oemNumber,
      ...(fixture.supersededBy === undefined
        ? {}
        : { supersededBy: fixture.supersededBy }),
      system: "engine",
      confidence: "fsm-confirmed",
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

vi.mock("astro:content", () => ({
  getCollection: async (name: string) => {
    if (name === "parts") return FIXTURES.map(entryFor);
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

let renderDetail: (entryId: string, locale: Locale) => Promise<string>;
let renderIndex: (locale: Locale) => Promise<string>;

beforeAll(async () => {
  const { experimental_AstroContainer } = await import("astro/container");
  const container = await experimental_AstroContainer.create();

  const detail =
    await import("../../src/pages/[locale]/[partsSegment]/[partSlug].astro");
  const index = await import("../../src/pages/[locale]/[partsSegment].astro");

  renderDetail = (entryId, locale) =>
    container.renderToString(detail.default, {
      params: {
        locale,
        partsSegment: SEGMENT[locale],
        partSlug: "ignored-the-page-reads-the-prop",
      },
      props: { entryId },
    });

  /*
   * The index page reads no `Astro.props`, so Astro types its factory as
   * `(_props: never) => …` and TypeScript refuses the assignment. A typing
   * quirk, not a behaviour change — see `parts-index.render.test.ts`.
   */
  type Renderable = Parameters<typeof container.renderToString>[0];

  renderIndex = (locale) =>
    container.renderToString(index.default as unknown as Renderable, {
      params: { locale, partsSegment: SEGMENT[locale] },
    });
});

function text(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/g, " ")
    .replace(/<style[\s\S]*?<\/style>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** One card's HTML on the index page — see `parts-index.render.test.ts`. */
function card(html: string, entryId: string): string {
  const marker = `id="part-${entryId}"`;
  const start = html.indexOf(marker);
  if (start === -1) throw new Error(`no card for \`${entryId}\``);
  const rest = html.slice(start + marker.length);
  const next = rest.indexOf('id="part-');
  return next === -1 ? rest : rest.slice(0, next);
}

/* -------------------------------------------------------------------------
 * Positive controls
 *
 * The badge works, in both directions, on a corpus the build would accept.
 * Without these the `it.fails` markers below could be satisfied by a page
 * that simply stopped printing the badge at all.
 * ---------------------------------------------------------------------- */

describe("the badge on a corpus that resolves", () => {
  it.each(LOCALES)(
    "the detail page marks a genuinely current number orderable in %s",
    async (locale) => {
      const body = text(await renderDetail("test-real-new", locale));
      expect(body).toContain(t(locale).partsCurrentBadge);
      expect(body).not.toContain(t(locale).partsSupersededBadge);
    }
  );

  it.each(LOCALES)(
    "the detail page marks a genuinely replaced number replaced in %s",
    async (locale) => {
      const body = text(await renderDetail("test-real-old", locale));
      expect(body).toContain(t(locale).partsSupersededBadge);
    }
  );

  it.each(LOCALES)(
    "the index page marks a genuinely current number orderable in %s",
    async (locale) => {
      expect(card(await renderIndex(locale), "test-real-new")).toContain(
        "part__badge--current"
      );
    }
  );

  it.each(LOCALES)(
    "the index page marks a genuinely replaced number replaced in %s",
    async (locale) => {
      expect(card(await renderIndex(locale), "test-real-old")).toContain(
        "part__badge--superseded"
      );
    }
  );
});

/* -------------------------------------------------------------------------
 * The gap (F5) — the detail page
 * ---------------------------------------------------------------------- */

describe("the detail page never says `order this one` from a failed lookup", () => {
  it("a dangling successor does not render the orderable badge in en", async () => {
    const body = text(await renderDetail("test-dangling", "en"));
    expect(body).not.toContain(t("en").partsCurrentBadge);
  });

  it("a dangling successor does not render the orderable badge in es", async () => {
    const body = text(await renderDetail("test-dangling", "es"));
    expect(body).not.toContain(t("es").partsCurrentBadge);
  });

  it("a part inside a supersession loop does not render the orderable badge in en", async () => {
    const body = text(await renderDetail("test-loop-a", "en"));
    expect(body).not.toContain(t("en").partsCurrentBadge);
  });

  it("a part inside a supersession loop does not render the orderable badge in es", async () => {
    const body = text(await renderDetail("test-loop-a", "es"));
    expect(body).not.toContain(t("es").partsCurrentBadge);
  });
});

/* -------------------------------------------------------------------------
 * The gap (F5) — the index page
 * ---------------------------------------------------------------------- */

describe("the index card never says `order this one` from a failed lookup", () => {
  it("a dangling successor does not get the current badge in en", async () => {
    expect(card(await renderIndex("en"), "test-dangling")).not.toContain(
      "part__badge--current"
    );
  });

  it("a dangling successor does not get the current badge in es", async () => {
    expect(card(await renderIndex("es"), "test-dangling")).not.toContain(
      "part__badge--current"
    );
  });

  it("a part inside a supersession loop does not get the current badge in en", async () => {
    expect(card(await renderIndex("en"), "test-loop-a")).not.toContain(
      "part__badge--current"
    );
  });

  it("a part inside a supersession loop does not get the current badge in es", async () => {
    expect(card(await renderIndex("es"), "test-loop-a")).not.toContain(
      "part__badge--current"
    );
  });
});

/* -------------------------------------------------------------------------
 * What the entry itself already told the page
 *
 * Not an `it.fails`: this is the fact that makes the badge above *wrong*
 * rather than merely unhelpful. The entry declares `supersededBy`. Whatever
 * the fix renders — a third badge state, no badge, a "we could not resolve
 * this" line — it must not be the same confident string a part with no
 * successor at all gets.
 * ---------------------------------------------------------------------- */

describe("the page had the evidence it ignored", () => {
  it("the dangling fixture does declare a successor", () => {
    const fixture = FIXTURES.find((entry) => entry.id === "test-dangling");
    expect(fixture?.supersededBy).toBe("test-nobody-wrote-this");
  });

  it("and no entry in the corpus has that id", () => {
    expect(
      FIXTURES.some((entry) => entry.id === "test-nobody-wrote-this")
    ).toBe(false);
  });
});
