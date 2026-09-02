/**
 * Every conditional section of the part page, actually rendered
 * (T501 audit follow-up, F2).
 *
 * ## The blind spot this closes
 *
 * `tests/pages/part-page.render.test.ts` renders the real `[partSlug].astro`,
 * which is the right technique — but its corpus is uniformly minimal. Every
 * fixture there is `sources: []`, `confidence: "fsm-confirmed"`,
 * `system: "engine"`, no `safetyCritical`, no `crossReferences`, no
 * `quantityPerVehicle`. Six of the page's conditional sections are therefore
 * gated on expressions that are **false in every fixture the suite has**:
 *
 *  · the safety chip in the header (`safetyCritical`)
 *  · the standing bilingual safety notice (`safetyCritical`)
 *  · the confidence caveat (`needsConfidenceCaveat(confidence)`)
 *  · the cross-reference table (`crossReferences.length > 0`)
 *  · the per-locale quality note inside it (`notes[reference.ref]`)
 *  · the quantity chip (`quantityPerVehicle !== undefined`)
 *  · the numbered sources list (`sources.length > 0`)
 *
 * Deleting any one of those blocks outright left the whole suite green. That
 * is not a weak grader, it is a grader with no opinion at all about most of
 * the page — and the two bands in the list (safety notice, confidence caveat)
 * are the two AGENTS.md makes unconditional requirements, not features.
 *
 * This file is the widened corpus: safety-critical parts (both routes into
 * the flag), every confidence tier, populated sources, all four
 * cross-reference verdicts with bilingual notes, and a quantity — asserted in
 * **both locales**, because a section that renders in EN and not in ES is the
 * exact failure the bilingual rule exists to prevent and a single-locale
 * grader cannot see it.
 *
 * Fixtures are synthetic: `test-` ids, `TEST-`-namespaced part numbers,
 * `.invalid` URLs. AGENTS.md treats an invented part number as the
 * highest-consequence hallucination in this domain.
 *
 * refs specs/001-foundation (PRT-01, PRB-03, PRB-04, I18N-06, I18N-08)
 */
import { beforeAll, describe, expect, it, vi } from "vitest";
import {
  confidenceCaveat,
  crossReferenceQualityLabel,
  glossarySystemLabel,
  sourceKindLabel,
  t,
} from "../../src/i18n/ui.ts";
import { CONFIDENCE_TIERS } from "../../src/schemas/entry.ts";
import { needsConfidenceCaveat } from "../../src/lib/confidence.ts";
import { CROSS_REFERENCE_QUALITY } from "../../src/schemas/parts.ts";

type Locale = "en" | "es";

const LOCALES: readonly Locale[] = ["en", "es"];

/* -------------------------------------------------------------------------
 * The corpus
 * ---------------------------------------------------------------------- */

/** One cross-reference per verdict, each with a note in both locales. */
const CROSS_REFERENCES = CROSS_REFERENCE_QUALITY.map((quality, index) => ({
  ref: `testbrand-${quality}`,
  brand: `TESTBRAND ${quality.toUpperCase()}`,
  partNumber: `TEST-X000${index + 1}`,
  quality,
}));

const NOTE_TEXT: Record<Locale, (quality: string) => string> = {
  en: (quality) => `TEST note in English about the ${quality} row.`,
  es: (quality) => `Nota TEST en español sobre la fila ${quality}.`,
};

function notesFor(locale: Locale): Record<string, string> {
  return Object.fromEntries(
    CROSS_REFERENCES.map((reference) => [
      reference.ref,
      NOTE_TEXT[locale](reference.quality),
    ])
  );
}

const SOURCES = [
  {
    title: "TEST factory manual excerpt — not a real document",
    url: "https://example.invalid/t501-audit/fsm",
    archiveUrl:
      "https://web.archive.org/web/20260101000000/" +
      "https://example.invalid/t501-audit/fsm",
    accessed: "2026-01-15",
    kind: "fsm",
  },
  {
    title: "TEST supplier catalogue page — not a real document",
    url: "https://example.invalid/t501-audit/catalogue",
    archiveUrl:
      "https://web.archive.org/web/20260201000000/" +
      "https://example.invalid/t501-audit/catalogue",
    accessed: "2026-02-20",
    kind: "vendor",
  },
] as const;

interface Fixture {
  readonly id: string;
  readonly oemNumber: string;
  readonly system: string;
  readonly confidence: string;
  readonly safetyCritical?: boolean;
  readonly quantityPerVehicle?: number;
  readonly withCrossReferences?: boolean;
  readonly withSources?: boolean;
}

const FIXTURES: readonly Fixture[] = [
  /*
   * Everything on at once. `brakes` is on `SAFETY_CRITICAL_SYSTEMS`, so the
   * flag comes from the system rather than from the field — the route a real
   * brake-pad entry takes.
   */
  {
    id: "test-rich",
    oemNumber: "TEST-R0001",
    system: "brakes",
    confidence: "anecdotal",
    quantityPerVehicle: 6,
    withCrossReferences: true,
    withSources: true,
  },
  /*
   * The *other* route into the safety notice: a system the list does not
   * catch, promoted by the upward-only flag. Two code paths, two fixtures —
   * a corpus that only ever used `brakes` would pass with `safetyCritical`
   * ignored entirely.
   */
  {
    id: "test-promoted",
    oemNumber: "TEST-R0002",
    system: "electrical",
    confidence: "tsb",
    safetyCritical: true,
    withSources: true,
  },
  /*
   * The negative control, and the shape the existing suite's whole corpus
   * had: nothing optional set. Every section above must be *absent* here,
   * which is what stops the assertions from passing on a page that renders
   * every band unconditionally.
   */
  {
    id: "test-plain",
    oemNumber: "TEST-R0003",
    system: "engine",
    confidence: "fsm-confirmed",
  },
  /** One part per confidence tier, for the caveat boundary table. */
  ...CONFIDENCE_TIERS.map((tier, index) => ({
    id: `test-tier-${tier}`,
    oemNumber: `TEST-T000${index + 1}`,
    system: "engine",
    confidence: tier,
  })),
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
      ...(fixture.safetyCritical === undefined
        ? {}
        : { safetyCritical: fixture.safetyCritical }),
      ...(fixture.quantityPerVehicle === undefined
        ? {}
        : { quantityPerVehicle: fixture.quantityPerVehicle }),
      ...(fixture.withCrossReferences === true
        ? { crossReferences: CROSS_REFERENCES }
        : {}),
      sources: fixture.withSources === true ? [...SOURCES] : [],
      prose: {
        en: {
          title: `TEST ${fixture.id}`,
          summary: "Synthetic T501-audit fixture.",
          ...(fixture.withCrossReferences === true
            ? { crossReferenceNotes: notesFor("en") }
            : {}),
        },
        es: {
          title: `PRUEBA ${fixture.id}`,
          summary: "Ficha sintética de la auditoría de T501.",
          ...(fixture.withCrossReferences === true
            ? { crossReferenceNotes: notesFor("es") }
            : {}),
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
    .replace(/<style[\s\S]*?<\/style>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#8212;|&mdash;/g, "—")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&#160;|&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * One cross-reference table row, sliced out by its `ref`-derived DOM id.
 *
 * Row scoping is the whole point, not tidiness. The note is joined to its
 * brand by `ref` (`notes[reference.ref]`) precisely so that reordering
 * `crossReferences` cannot re-attach every sentence to the wrong brand — the
 * failure `src/schemas/parts.ts` records as "a diff that would look like a
 * no-op". A whole-page `toContain` cannot see that failure at all: rotate
 * every note by one row and all four sentences are still on the page. The
 * first draft of this file made exactly that mistake, and a mutation that
 * keyed the note by array position survived it.
 */
function crossRefRow(html: string, ref: string): string {
  const marker = `id="cross-ref-${ref}"`;
  const start = html.indexOf(marker);
  if (start === -1) {
    throw new Error(`no cross-reference row for \`${ref}\` in the render`);
  }
  const rest = html.slice(start + marker.length);
  const end = rest.indexOf("</tr>");
  return end === -1 ? rest : rest.slice(0, end);
}

/* -------------------------------------------------------------------------
 * The safety notice (AGENTS.md "Safety and legal", PRB-03's band)
 * ---------------------------------------------------------------------- */

describe("the standing bilingual safety notice", () => {
  it.each(LOCALES)(
    "renders on a brakes part in %s, in both languages",
    async (locale) => {
      const body = text(await render("test-rich", locale));

      // "Bilingual" is the requirement's own word: both locales' sentences
      // appear on one page whatever the page's own locale is. The *heading*
      // is written once, in the page's locale — the component's own design
      // (one `h2`, one `aria-labelledby` target), so only the body is
      // asserted per locale.
      for (const each of LOCALES) {
        expect(body).toContain(t(each).safetyNoticeBody);
      }

      const strings = t(locale);
      expect(body).toContain(
        strings.safetyNoticeLabelTemplate.replace(
          "{system}",
          glossarySystemLabel(strings, "brakes")
        )
      );
    }
  );

  it.each(LOCALES)(
    "renders in %s on a part promoted by the upward-only flag",
    async (locale) => {
      const body = text(await render("test-promoted", locale));
      expect(body).toContain(t(locale).safetyNoticeBody);
      expect(body).toContain(
        t(locale).safetyNoticeLabelTemplate.replace(
          "{system}",
          glossarySystemLabel(t(locale), "electrical")
        )
      );
    }
  );

  it.each(LOCALES)(
    "renders the short safety chip beside the system chip in %s",
    async (locale) => {
      const body = text(await render("test-rich", locale));
      expect(body).toContain(t(locale).safetyCriticalChipLabel);
    }
  );

  it.each(LOCALES)(
    "is absent in %s on a part that is not safety-critical",
    async (locale) => {
      const body = text(await render("test-plain", locale));
      expect(body).not.toContain(t(locale).safetyNoticeBody);
      expect(body).not.toContain(t(locale).safetyCriticalChipLabel);
    }
  );
});

/* -------------------------------------------------------------------------
 * The confidence caveat (AGENTS.md "Facts", PRB-04's band)
 *
 * A boundary table over the real tier list rather than three hand-picked
 * examples: `needsConfidenceCaveat` is "later in `CONFIDENCE_TIERS` than
 * `tsb`", so `tsb` itself is the boundary and a tier inserted into that array
 * is graded here with no edit.
 * ---------------------------------------------------------------------- */

describe("the confidence caveat's tier boundary", () => {
  const cases = CONFIDENCE_TIERS.flatMap((tier) =>
    LOCALES.map((locale) => [tier, locale] as const)
  );

  it.each(cases)(
    "tier `%s` in %s renders the caveat exactly when the rule says it must",
    async (tier, locale) => {
      const body = text(await render(`test-tier-${tier}`, locale));
      const expected = needsConfidenceCaveat(tier);

      // Both locales' sentences, on one page — the rule is "in both
      // languages", not "in the page's language".
      for (const each of LOCALES) {
        const sentence = confidenceCaveat(t(each), tier);
        if (expected) {
          expect(body).toContain(sentence);
        } else {
          expect(body).not.toContain(sentence);
        }
      }
    }
  );

  it("marks the band with the tier it is about, for the dashed styling", async () => {
    const html = await render("test-tier-anecdotal", "en");
    expect(html).toContain('data-confidence="anecdotal"');
  });
});

/* -------------------------------------------------------------------------
 * The cross-reference table (PRT-01)
 * ---------------------------------------------------------------------- */

describe("the aftermarket cross-reference table", () => {
  it.each(LOCALES)("renders its heading and columns in %s", async (locale) => {
    const strings = t(locale);
    const body = text(await render("test-rich", locale));

    expect(body).toContain(strings.partsCrossReferencesHeading);
    expect(body).toContain(strings.partsCrossReferenceBrandLabel);
    expect(body).toContain(strings.partsCrossReferenceNumberLabel);
    expect(body).toContain(strings.partsCrossReferenceQualityLabel);
    expect(body).toContain(strings.partsCrossReferenceNoteLabel);
  });

  it.each(LOCALES)("renders every brand and number in %s", async (locale) => {
    const body = text(await render("test-rich", locale));
    for (const reference of CROSS_REFERENCES) {
      expect(body).toContain(reference.brand);
      expect(body).toContain(reference.partNumber);
    }
  });

  it.each(LOCALES)(
    "renders each of the four verdicts as its %s label",
    async (locale) => {
      const strings = t(locale);
      const body = text(await render("test-rich", locale));
      for (const reference of CROSS_REFERENCES) {
        expect(body).toContain(
          crossReferenceQualityLabel(strings, reference.quality)
        );
      }
    }
  );

  it.each(LOCALES)(
    "renders %s's own quality note, and never the other locale's",
    async (locale) => {
      const other: Locale = locale === "en" ? "es" : "en";
      const body = text(await render("test-rich", locale));

      for (const reference of CROSS_REFERENCES) {
        expect(body).toContain(NOTE_TEXT[locale](reference.quality));
        expect(body).not.toContain(NOTE_TEXT[other](reference.quality));
      }
    }
  );

  it("keys each row by its `ref`, so a note cannot drift onto another brand", async () => {
    const html = await render("test-rich", "en");
    for (const reference of CROSS_REFERENCES) {
      expect(html).toContain(`id="cross-ref-${reference.ref}"`);
      expect(html).toContain(`data-quality="${reference.quality}"`);
    }
  });

  it.each(LOCALES)(
    "puts each note in its OWN row in %s, beside its own brand and number",
    async (locale) => {
      const strings = t(locale);
      const html = await render("test-rich", locale);

      for (const reference of CROSS_REFERENCES) {
        const row = crossRefRow(html, reference.ref);
        const rowText = text(row);

        expect(rowText).toContain(reference.brand);
        expect(rowText).toContain(reference.partNumber);
        expect(rowText).toContain(
          crossReferenceQualityLabel(strings, reference.quality)
        );
        expect(rowText).toContain(NOTE_TEXT[locale](reference.quality));

        // And nobody else's note. Rotating the notes by one row leaves every
        // sentence on the page and every one of them in the wrong place.
        for (const other of CROSS_REFERENCES) {
          if (other.ref === reference.ref) continue;
          expect(rowText).not.toContain(NOTE_TEXT[locale](other.quality));
        }
      }
    }
  );

  it.each(LOCALES)(
    "is absent in %s on a part with no cross-references",
    async (locale) => {
      const body = text(await render("test-plain", locale));
      expect(body).not.toContain(t(locale).partsCrossReferencesHeading);
    }
  );
});

/* -------------------------------------------------------------------------
 * The quantity chip (the collection's one figure)
 * ---------------------------------------------------------------------- */

describe("the quantity-per-vehicle chip", () => {
  it.each(LOCALES)("renders the count in %s", async (locale) => {
    const strings = t(locale);
    const body = text(await render("test-rich", locale));
    expect(body).toContain(
      strings.partsQuantityTemplate.replace("{count}", "6")
    );
  });

  it.each(LOCALES)(
    "is absent in %s when the entry states no quantity",
    async (locale) => {
      const strings = t(locale);
      const body = text(await render("test-plain", locale));
      // The template's fixed half must not appear with nothing in the slot.
      const fixedHalf = strings.partsQuantityTemplate
        .replace("{count}", "")
        .trim();
      expect(body).not.toContain(fixedHalf);
    }
  );
});

/* -------------------------------------------------------------------------
 * The numbered sources list (REF-02's provenance half)
 * ---------------------------------------------------------------------- */

describe("the sources section", () => {
  it.each(LOCALES)("renders its heading in %s", async (locale) => {
    const body = text(await render("test-rich", locale));
    expect(body).toContain(t(locale).sourcesHeading);
  });

  it.each(LOCALES)("names and links every source in %s", async (locale) => {
    const html = await render("test-rich", locale);
    const body = text(html);
    for (const source of SOURCES) {
      expect(body).toContain(source.title);
      expect(html).toContain(`href="${source.url}"`);
    }
  });

  it.each(LOCALES)(
    "shows what kind of document each source is, in %s",
    async (locale) => {
      const strings = t(locale);
      const body = text(await render("test-rich", locale));
      for (const source of SOURCES) {
        expect(body).toContain(sourceKindLabel(strings, source.kind));
      }
    }
  );

  it.each(LOCALES)(
    "offers the archived copy of every source in %s",
    async (locale) => {
      const html = await render("test-rich", locale);
      expect(text(html)).toContain(t(locale).sourceArchiveLabel);
      for (const source of SOURCES) {
        expect(html).toContain(`href="${source.archiveUrl}"`);
      }
    }
  );

  it.each(LOCALES)(
    "dates each source as a calendar day, in %s's own format",
    async (locale) => {
      const html = await render("test-rich", locale);
      for (const source of SOURCES) {
        // The machine-readable half is locale-independent; the human half is
        // formatted. Both must be present, and the `datetime` must be the ISO
        // day the entry stated — never a re-serialized instant.
        expect(html).toContain(`datetime="${source.accessed}"`);
      }
      const body = text(html);
      const formatted = new Intl.DateTimeFormat(
        locale === "en" ? "en-US" : "es-CR",
        { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" }
      ).format(new Date("2026-01-15T00:00:00Z"));
      expect(body).toContain(
        t(locale).sourceAccessedTemplate.replace("{date}", formatted)
      );
    }
  );

  it.each(LOCALES)(
    "is absent in %s when the entry cites nothing",
    async (locale) => {
      const body = text(await render("test-plain", locale));
      expect(body).not.toContain(t(locale).sourcesHeading);
      expect(body).not.toContain(t(locale).sourceArchiveLabel);
    }
  );
});

/* -------------------------------------------------------------------------
 * The whole page, both locales
 * ---------------------------------------------------------------------- */

describe("the rich page as a whole", () => {
  it("renders each locale's own prose and never the other's", async () => {
    expect(text(await render("test-rich", "en"))).toContain("TEST test-rich");
    expect(text(await render("test-rich", "en"))).not.toContain(
      "PRUEBA test-rich"
    );
    expect(text(await render("test-rich", "es"))).toContain("PRUEBA test-rich");
    expect(text(await render("test-rich", "es"))).not.toContain(
      "TEST test-rich"
    );
  });

  it.each(LOCALES)(
    "keeps the OEM number itself on the page in %s",
    async (locale) => {
      expect(text(await render("test-rich", locale))).toContain("TEST-R0001");
    }
  );
});
