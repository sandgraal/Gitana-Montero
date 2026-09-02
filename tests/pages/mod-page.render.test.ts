/**
 * One modification's page, rendered (T601, MOD-01, MOD-02).
 *
 * The detail page is where MOD-02's typed reference stops being a data shape
 * and becomes something a reader clicks. Four things can only be graded here:
 *
 *  · **the prerequisite link is built from the reference's own collection.** A
 *    `parts` requirement must link into `/en/parts/`, a `mods` requirement
 *    into `/en/mods/` — that is the discriminator earning its keep, and a page
 *    that guessed would send a reader to a 404 or, worse, to the wrong entry
 *    with the same id.
 *  · **the locale prefix.** `entryRoutePath` returns a locale-independent
 *    route; rendering it bare is a 404 on every link. T501 shipped exactly
 *    that on both parts pages and no CI check saw it.
 *  · **an unresolved prerequisite is still shown.** The build refuses that
 *    corpus, so this is defense-in-depth — but a page that silently dropped
 *    the row would render a *shorter* requirements list than the entry
 *    declares, which is a confident answer derived from having failed to look
 *    (AGENTS.md, "a failure is not a zero").
 *  · **the safety notice, including the mods widening.** A mod filed under a
 *    system nobody would flag, which breaks one that everybody would, has to
 *    carry the standing bilingual band.
 *
 * Fixture conventions follow `tests/pages/part-page.sections.render.test.ts`.
 *
 * refs specs/001-foundation (MOD-01, MOD-02, I18N-01, I18N-05)
 */
import { beforeAll, describe, expect, it, vi } from "vitest";
import { t } from "../../src/i18n/ui.ts";

type Locale = "en" | "es";

const LOCALES: readonly Locale[] = ["en", "es"];

const MODS_SEGMENT: Record<Locale, string> = {
  en: "mods",
  es: "modificaciones",
};
const PARTS_SEGMENT: Record<Locale, string> = {
  en: "parts",
  es: "repuestos",
};

/* -------------------------------------------------------------------------
 * The corpus
 * ---------------------------------------------------------------------- */

/** The part a requirement resolves to. */
const PART_ID = "test-mod-part";

/** The other mod a requirement resolves to. */
const OTHER_MOD_ID = "test-mod-prereq";

/**
 * The page's subject: `electrical` by facet, `breaks` the brakes — so its
 * safety notice comes only from the widening — with one resolvable `parts`
 * requirement, one resolvable `mods` requirement, and one that names nothing.
 */
const SUBJECT_ID = "test-mod-subject";

function modEntry(id: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    data: {
      id,
      fitment: { gens: ["gen3"] },
      system: "electrical",
      cost: { from: "moderate", to: "significant" },
      difficulty: 3,
      requires: [],
      affects: [],
      confidence: "community-consensus",
      sources: [
        {
          title: "TEST fixture source — not a real document",
          url: "https://example.invalid/t601/source",
          archiveUrl:
            "https://web.archive.org/web/20260101000000/" +
            "https://example.invalid/t601/source",
          accessed: "2026-09-02",
          kind: "forum",
        },
      ],
      prose: {
        en: {
          title: `TEST ${id}`,
          summary: "Synthetic T601 fixture.",
          tradeoffs: "TEST tradeoffs sentence in English.",
        },
        es: {
          title: `PRUEBA ${id}`,
          summary: "Entrada sintética de T601.",
          tradeoffs: "Frase TEST de contras en español.",
        },
      },
      ...extra,
    },
  };
}

const SUBJECT = modEntry(SUBJECT_ID, {
  requires: [
    { collection: "parts", id: PART_ID },
    { collection: "mods", id: OTHER_MOD_ID },
    { collection: "parts", id: "test-mod-unwritten" },
  ],
  affects: [
    { id: "abs", system: "brakes", impact: "breaks" },
    {
      id: "ride",
      system: "suspension",
      impact: "degrades",
      ref: { collection: "mods", id: OTHER_MOD_ID },
    },
  ],
  prose: {
    en: {
      title: `TEST ${SUBJECT_ID}`,
      summary: "Synthetic T601 fixture.",
      tradeoffs: "TEST tradeoffs sentence in English.",
      affectsNotes: {
        abs: "TEST English note about the ABS module.",
        ride: "TEST English note about ride quality.",
      },
    },
    es: {
      title: `PRUEBA ${SUBJECT_ID}`,
      summary: "Entrada sintética de T601.",
      tradeoffs: "Frase TEST de contras en español.",
      affectsNotes: {
        abs: "Nota TEST en español sobre el módulo del ABS.",
        ride: "Nota TEST en español sobre la calidad de marcha.",
      },
    },
  },
});

/** A mod with no requirements and no consequences — both empty states. */
const BARE_ID = "test-mod-bare";

vi.mock("astro:content", () => ({
  getCollection: async (name: string) => {
    if (name === "mods") {
      return [SUBJECT, modEntry(OTHER_MOD_ID), modEntry(BARE_ID)];
    }
    if (name === "parts") {
      return [{ id: PART_ID, data: { id: PART_ID } }];
    }
    return [];
  },
}));

const MOD_SLUGS: Record<string, Record<Locale, string>> = {
  [SUBJECT_ID]: { en: "subject", es: "es-subject" },
  [OTHER_MOD_ID]: { en: "prereq", es: "es-prereq" },
  [BARE_ID]: { en: "bare", es: "es-bare" },
};

const PART_SLUGS: Record<string, Record<Locale, string>> = {
  [PART_ID]: { en: "widget", es: "es-widget" },
};

vi.mock("../../src/i18n/entry-slugs.ts", () => {
  const table: Record<string, Record<string, Record<Locale, string>>> = {
    mods: MOD_SLUGS,
    parts: PART_SLUGS,
  };
  return {
    ENTRY_SLUGS: table,
    slugRegistryIds: (collection: string) =>
      Object.keys(table[collection] ?? {}),
    entrySlug: (collection: string, id: string, locale: Locale) =>
      table[collection]?.[id]?.[locale] ?? null,
    entrySlugs: (collection: string, id: string) =>
      table[collection]?.[id] ?? null,
  };
});

let render: (locale: Locale, entryId?: string) => Promise<string>;

beforeAll(async () => {
  const { experimental_AstroContainer } = await import("astro/container");
  const container = await experimental_AstroContainer.create();
  const page =
    await import("../../src/pages/[locale]/[modsSegment]/[modSlug].astro");

  render = (locale, entryId = SUBJECT_ID) =>
    container.renderToString(page.default, {
      params: {
        locale,
        modsSegment: MODS_SEGMENT[locale],
        modSlug: MOD_SLUGS[entryId]?.[locale] ?? "",
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

/**
 * One `requires` row's HTML — bounded at its own `</li>`.
 *
 * The bound is load-bearing, not tidiness: without it the *last* row's slice
 * runs to the end of the document, so `expect(row).not.toContain("href=")`
 * would match a link from the sources list two sections down and the
 * unresolved-prerequisite grader could never fail.
 */
function requirementRow(html: string, id: string): string {
  const rows = html
    .split('<li class="requires__row"')
    .slice(1)
    .map((row) => row.slice(0, row.indexOf("</li>")))
    .filter((row) => row.includes(id));
  if (rows.length === 0) throw new Error(`no requirement row for \`${id}\``);
  return rows[0] as string;
}

/* -------------------------------------------------------------------------
 * Positive control
 * ---------------------------------------------------------------------- */

describe("the page renders at all", () => {
  it("renders the title, summary and tradeoffs in each locale", async () => {
    for (const locale of LOCALES) {
      const body = text(await render(locale));
      expect(body).toContain(
        locale === "en" ? `TEST ${SUBJECT_ID}` : `PRUEBA ${SUBJECT_ID}`
      );
      expect(body).toContain(
        locale === "en"
          ? "TEST tradeoffs sentence in English."
          : "Frase TEST de contras en español."
      );
      expect(body).toContain(t(locale).modsTradeoffsHeading);
    }
  });

  it("renders MOD-01's tradeoffs section even though it is never empty", async () => {
    // It cannot be empty — the schema requires the sentence in both locales —
    // so the heading is unconditional and this pins that it is not gated on
    // anything that could accidentally suppress it.
    expect(await render("en", BARE_ID)).toContain('id="tradeoffs-heading"');
  });
});

/* -------------------------------------------------------------------------
 * Typed references, rendered (MOD-02)
 * ---------------------------------------------------------------------- */

describe("prerequisite links (MOD-02)", () => {
  it("links a `parts` requirement into the PARTS section, per locale", async () => {
    for (const locale of LOCALES) {
      const row = requirementRow(await render(locale), PART_ID);
      const expected = `/${locale}/${PARTS_SEGMENT[locale]}/${PART_SLUGS[PART_ID]![locale]}/`;
      expect(row).toContain(`href="${expected}"`);
    }
  });

  it("links a `mods` requirement into the MODS section, per locale", async () => {
    for (const locale of LOCALES) {
      const row = requirementRow(await render(locale), OTHER_MOD_ID);
      const expected = `/${locale}/${MODS_SEGMENT[locale]}/${MOD_SLUGS[OTHER_MOD_ID]![locale]}/`;
      expect(row).toContain(`href="${expected}"`);
    }
  });

  it("never emits a bare, locale-less route", async () => {
    for (const locale of LOCALES) {
      const html = await render(locale);
      expect(html).not.toContain(`href="/${MODS_SEGMENT[locale]}/`);
      expect(html).not.toContain(`href="/${PARTS_SEGMENT[locale]}/`);
    }
  });

  it("says which KIND each prerequisite is — the discriminator, in words", async () => {
    for (const locale of LOCALES) {
      const strings = t(locale);
      const html = await render(locale);
      expect(text(requirementRow(html, PART_ID))).toContain(
        strings["modReferenceCollection.parts"]
      );
      expect(text(requirementRow(html, OTHER_MOD_ID))).toContain(
        strings["modReferenceCollection.mods"]
      );
    }
  });

  it("tags each row with the collection it points into", async () => {
    const html = await render("en");
    expect(requirementRow(html, PART_ID)).toContain('data-collection="parts"');
    expect(requirementRow(html, OTHER_MOD_ID)).toContain(
      'data-collection="mods"'
    );
  });

  it("SHOWS an unresolvable prerequisite, unlinked and labelled", async () => {
    for (const locale of LOCALES) {
      const row = requirementRow(await render(locale), "test-mod-unwritten");
      expect(row).toContain('data-resolved="false"');
      expect(row).not.toContain("href=");
      expect(text(row)).toContain(t(locale).modsRequiresUnresolvedLabel);
    }
  });

  it("keeps all three prerequisites — never a shorter list than declared", async () => {
    const html = await render("en");
    for (const id of [PART_ID, OTHER_MOD_ID, "test-mod-unwritten"]) {
      expect(() => requirementRow(html, id)).not.toThrow();
    }
  });

  it("says so plainly when there are no prerequisites", async () => {
    for (const locale of LOCALES) {
      const html = await render(locale, BARE_ID);
      expect(text(html)).toContain(t(locale).modsRequiresNone);
      expect(html).not.toContain('class="requires__row"');
    }
  });
});

/* -------------------------------------------------------------------------
 * Consequences — MOD-01
 * ---------------------------------------------------------------------- */

describe("the consequences table (MOD-01)", () => {
  it("renders one row per consequence, with its own locale's sentence", async () => {
    for (const locale of LOCALES) {
      const html = await render(locale);
      expect(html).toContain('id="affects-abs"');
      expect(html).toContain('id="affects-ride"');
      expect(text(html)).toContain(
        locale === "en"
          ? "TEST English note about the ABS module."
          : "Nota TEST en español sobre el módulo del ABS."
      );
    }
  });

  it("never leaks the other locale's sentence onto the page", async () => {
    expect(text(await render("en"))).not.toContain(
      "Nota TEST en español sobre el módulo del ABS."
    );
    expect(text(await render("es"))).not.toContain(
      "TEST English note about the ABS module."
    );
  });

  it("labels each row with its impact, from the shared vocabulary", async () => {
    for (const locale of LOCALES) {
      const body = text(await render(locale));
      expect(body).toContain(t(locale)["modImpact.breaks"]);
      expect(body).toContain(t(locale)["modImpact.degrades"]);
    }
  });

  it("tags the row with the impact id, so styling cannot invent a fourth", async () => {
    const html = await render("en");
    expect(html).toContain('data-impact="breaks"');
    expect(html).toContain('data-impact="degrades"');
  });

  it("links a consequence's own `ref` into that reference's collection", async () => {
    for (const locale of LOCALES) {
      const expected = `/${locale}/${MODS_SEGMENT[locale]}/${MOD_SLUGS[OTHER_MOD_ID]![locale]}/`;
      expect(await render(locale)).toContain(`href="${expected}"`);
    }
  });

  it("says so plainly when nothing is documented as affected", async () => {
    for (const locale of LOCALES) {
      const html = await render(locale, BARE_ID);
      expect(text(html)).toContain(t(locale).modsAffectsNone);
      expect(html).not.toContain('class="affects"');
    }
  });
});

/* -------------------------------------------------------------------------
 * Safety and figures
 * ---------------------------------------------------------------------- */

describe("the safety notice", () => {
  it("RENDERS on a mod whose own system is not critical but whose affected one is", async () => {
    // The widening, on the page: `electrical` + `breaks brakes`.
    for (const locale of LOCALES) {
      const html = await render(locale);
      expect(html).toContain('id="safety-notice-electrical"');
      expect(text(html)).toContain(t(locale).safetyCriticalChipLabel);
    }
  });

  it("carries BOTH languages in one band, as AGENTS.md requires", async () => {
    const html = await render("en");
    expect(text(html)).toContain(t("en").safetyNoticeBody);
    expect(text(html)).toContain(t("es").safetyNoticeBody);
  });

  it("does NOT render on a mod that touches nothing critical", async () => {
    const html = await render("en", BARE_ID);
    expect(html).not.toContain('id="safety-notice-electrical"');
    expect(text(html)).not.toContain(t("en").safetyCriticalChipLabel);
  });
});

describe("figures", () => {
  it("renders difficulty and the cost range from shared data", async () => {
    for (const locale of LOCALES) {
      const strings = t(locale);
      const body = text(await render(locale));
      expect(body).toContain(
        strings.modsDifficultyTemplate
          .replace("{value}", "3")
          .replace("{max}", "5")
      );
      // `moderate`–`significant` is the second and third band.
      expect(body).toContain("$$–$$$");
    }
  });

  it("gives the glyphs a spoken name naming BOTH ends of the range", async () => {
    const html = await render("en");
    expect(html).toContain(
      'aria-label="A normal parts-and-an-afternoon job – A major component or a shop bill"'
    );
  });
});
