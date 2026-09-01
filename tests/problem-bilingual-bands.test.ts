/**
 * The bilingual-band invariant on the problem page (PRB-03, PRB-04, PRB-05).
 *
 * ## Why this file exists (T401 review, F1 — a positive control for a mutation
 * that survived the whole pipeline)
 *
 * Three bands on a problem page carry **both** locales regardless of which
 * locale the page is: the drivability triage banner ("rendered prominently in
 * both locales", PRB-05), the standing safety notice ("the standing bilingual
 * safety notice", PRB-03) and the confidence caveat ("the visible caveat in
 * both locales", PRB-04). Each component builds that from one line:
 *
 * ```ts
 * const readingOrder: Locale[] = [locale, ...LOCALES.filter(c => c !== locale)];
 * ```
 *
 * The reviewer replaced it with `[locale]` in `TriageBanner.astro` — deleting
 * the second language from the single most consequential element on the site —
 * and `npm run verify` stayed **fully green**. Nothing executable pinned the
 * requirement: `astro check` sees a valid array, the schema graders never
 * render, Pa11y sees a page with no WCAG violation (a monolingual band is not
 * an a11y defect), and Lighthouse scores it 100. The one requirement whose
 * whole point is that it does not depend on the reader's language was resting
 * on a code comment.
 *
 * So the grader is shaped around the escape, not around the components. It
 * renders the **real page** — both locales, the same component `getStaticPaths`
 * builds — and asserts, for each of the three bands, that the emitted HTML
 * carries a `lang`-marked block for *every* locale, with the text each locale's
 * own `src/i18n/ui.ts` entry says it should have. Comparing against `t(locale)`
 * rather than against a copy of the sentence matters: a grader with the string
 * written into it grades itself.
 *
 * It also pins the page-level *composition*, which is a second way the same
 * requirement could be lost with every band component still perfect: the safety
 * notice must appear exactly when `src/lib/safety.ts` says the entry is
 * safety-critical, and the caveat exactly when `src/lib/confidence.ts` says the
 * tier is below `tsb`.
 *
 * Rendered through Astro's container API, like `tests/site-footer.test.ts` and
 * `tests/locale-switcher.test.ts`, and for the same reason recorded there:
 * `vitest run` executes *before* `astro build` inside `npm run verify`, so a
 * test that parsed `dist/` would grade a stale build or no build at all.
 *
 * refs specs/001-foundation (PRB-03, PRB-04, PRB-05, I18N-01, I18N-08)
 */
import { experimental_AstroContainer as AstroContainer } from "astro/container";
// JSDOM is constructed explicitly rather than switching this file to Vitest's
// DOM environment — see the note in `tests/locale-switcher.test.ts`: that
// environment turns on Vite's `browser` export condition and Astro's container
// then renders with no server renderer at all.
import { JSDOM } from "jsdom";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { z } from "astro/zod";

import { LOCALES, LOCALE_BCP47, type Locale } from "../src/i18n/routing";
import { COLLECTION_ROUTE_SEGMENTS } from "../src/i18n/routes";
import {
  confidenceTierLabel,
  costBandLabel,
  drivabilityLabel,
  glossarySystemLabel,
  t,
} from "../src/i18n/ui";
import {
  DRIVABILITY_STATES,
  problemsEntrySchema,
} from "../src/schemas/problems";
import { CONFIDENCE_TIERS } from "../src/schemas/entry";
import { isSafetyCritical } from "../src/lib/safety";
import { needsConfidenceCaveat } from "../src/lib/confidence";

/*
 * The page renders `BaseLayout`, which renders the vehicle selector, which
 * loads the `vehicles` collection. The content layer's store is a build
 * artefact and `vitest` runs before `astro build`, so the collection is stubbed
 * empty: the selector degrades to "no taxonomy" and every band under test is
 * untouched by it. Nothing in this file asserts anything about the selector.
 */
vi.mock("astro:content", () => ({
  getCollection: async () => [],
  getEntry: async () => undefined,
}));

const { default: ProblemPage } =
  await import("../src/pages/[locale]/[problemsSegment]/[problemSlug].astro");

let container: AstroContainer;

beforeAll(async () => {
  container = await AstroContainer.create();
});

/* -------------------------------------------------------------------------
 * Fixtures — synthetic in the same sense as `src/schemas/problems.test.ts`'s
 * ---------------------------------------------------------------------- */

interface EntryOptions {
  readonly system?: string;
  readonly severity?: string;
  readonly safetyCritical?: boolean;
  readonly drivability?: string;
  readonly confidence?: string;
}

function proseBlock(locale: string) {
  return {
    title: `TEST problem (${locale})`,
    summary: `TEST summary (${locale})`,
    slug: `test-problem-${locale}`,
    symptoms: { "test-symptom": `TEST symptom (${locale})` },
    causes: { "test-cause": `TEST cause (${locale})` },
    diagnosticSteps: { "test-step": `TEST step (${locale})` },
    fixPaths: { "test-fix": { title: `TEST fix (${locale})` } },
  };
}

const schema = problemsEntrySchema({
  title: z.string(),
  summary: z.string(),
});

/**
 * The shape `getStaticPaths` hands the page as `props.entry`.
 *
 * Built here rather than loaded — T403 owns the content, and the grader has to
 * put the page into states no committed entry is in — but **parsed through the
 * real collection schema** rather than hand-shaped. That is not ceremony: the
 * schema applies the `.default([])`s the page reads (`rulesOut`, `parts`,
 * `procedures`), so a fixture that skipped it would either drift from what the
 * collection actually produces or, worse, let the page read a field no real
 * entry has. It also means an invalid fixture fails here instead of quietly
 * grading a page against impossible data.
 */
function entry(options: EntryOptions = {}) {
  const {
    system = "suspension",
    severity = "degrading",
    safetyCritical,
    drivability = "drive-gently-repair-soon",
    confidence = "community-consensus",
  } = options;

  const data = schema.parse({
    id: "test-problem",
    fitment: { gens: ["gen3"] },
    system,
    ...(safetyCritical === undefined ? {} : { safetyCritical }),
    severity,
    drivability,
    symptoms: ["test-symptom"],
    causes: [{ id: "test-cause" }],
    diagnosticSteps: [{ id: "test-step", rulesIn: ["test-cause"] }],
    fixPaths: [
      {
        id: "test-fix",
        difficulty: 2,
        cost: { from: "minimal", to: "moderate" },
        time: { value: 1, unit: "h" },
      },
    ],
    confidence,
    sources: [
      {
        title: "TEST fixture source — not a real document",
        url: "https://example.invalid/t401/source",
        archiveUrl:
          "https://web.archive.org/web/20260101000000/" +
          "https://example.invalid/t401/source",
        accessed: "2026-08-31",
        kind: "fsm",
      },
    ],
    prose: { en: proseBlock("en"), es: proseBlock("es") },
  });

  return { id: "test-problem", data };
}

/** The page as `/en/problems/<slug>/` or `/es/problemas/<slug>/` renders it. */
async function renderPage(
  locale: Locale,
  options: EntryOptions = {}
): Promise<Document> {
  const built = entry(options);
  const html = await container.renderToString(ProblemPage, {
    params: {
      locale,
      problemsSegment: COLLECTION_ROUTE_SEGMENTS.problems[locale],
      problemSlug: built.data.prose[locale].slug,
    },
    props: { entry: built },
    request: new Request(
      `https://monterogarage.com/${locale}/${COLLECTION_ROUTE_SEGMENTS.problems[locale]}/${built.data.prose[locale].slug}/`
    ),
  });
  return new JSDOM(html).window.document;
}

/** Text of the `lang`-marked descendants of `selector`, keyed by locale. */
function textByLocale(
  doc: Document,
  selector: string,
  childSelector: string
): Partial<Record<Locale, string[]>> {
  const band = doc.querySelector(selector);
  if (band === null) return {};

  const found: Partial<Record<Locale, string[]>> = {};
  for (const locale of LOCALES) {
    const nodes = [
      ...band.querySelectorAll(
        `${childSelector}[lang="${LOCALE_BCP47[locale]}"]`
      ),
    ];
    if (nodes.length > 0) {
      found[locale] = nodes.map((node) => node.textContent?.trim() ?? "");
    }
  }
  return found;
}

/* -------------------------------------------------------------------------
 * PRB-05 — the triage banner
 * ---------------------------------------------------------------------- */

describe("the triage banner carries both locales on either page (PRB-05)", () => {
  for (const pageLocale of LOCALES) {
    it(`says the drivability in every language on the ${pageLocale} page`, async () => {
      const doc = await renderPage(pageLocale, {
        drivability: "do-not-drive",
      });
      const said = textByLocale(doc, ".triage", ".triage__label");

      for (const locale of LOCALES) {
        // The mutation this kills: `readingOrder = [locale]` drops every
        // language but the page's own, and the reader who does not read it
        // loses the answer to "can I drive it?".
        expect(said[locale], `missing ${locale} triage label`).toEqual([
          drivabilityLabel(t(locale), "do-not-drive"),
        ]);
      }
    });

    it(`leads with the ${pageLocale} label and follows with the other`, async () => {
      const doc = await renderPage(pageLocale);
      const labels = [...doc.querySelectorAll(".triage__label")];

      expect(labels[0]?.getAttribute("lang")).toBe(LOCALE_BCP47[pageLocale]);
      expect(labels[0]?.className).toContain("triage__label--primary");
      expect(labels.length).toBe(LOCALES.length);
    });
  }

  it.each(DRIVABILITY_STATES)(
    "renders `%s` bilingually and tags the band with the state",
    async (state) => {
      const doc = await renderPage("en", { drivability: state });
      const band = doc.querySelector(".triage");

      expect(band?.getAttribute("data-triage")).toBe(state);
      const said = textByLocale(doc, ".triage", ".triage__label");
      for (const locale of LOCALES) {
        expect(said[locale]).toEqual([drivabilityLabel(t(locale), state)]);
      }
    }
  );
});

/* -------------------------------------------------------------------------
 * PRB-03 — the standing bilingual safety notice
 * ---------------------------------------------------------------------- */

describe("the safety notice is bilingual and conditioned on safety.ts (PRB-03)", () => {
  for (const pageLocale of LOCALES) {
    it(`states the notice in every language on the ${pageLocale} page`, async () => {
      const doc = await renderPage(pageLocale, { system: "brakes" });
      const said = textByLocale(doc, ".safety", ".safety__line");

      for (const locale of LOCALES) {
        expect(said[locale], `missing ${locale} safety line`).toEqual([
          t(locale).problemSafetyNoticeBody,
        ]);
      }
    });

    it(`names the system in the ${pageLocale} heading`, async () => {
      const doc = await renderPage(pageLocale, { system: "brakes" });
      const strings = t(pageLocale);

      expect(doc.querySelector(".safety__title")?.textContent?.trim()).toBe(
        strings.problemSafetyNoticeTemplate.replace(
          "{system}",
          glossarySystemLabel(strings, "brakes")
        )
      );
    });
  }

  it("renders on a system AGENTS.md lists, with no flag needed", async () => {
    expect(isSafetyCritical({ system: "steering" })).toBe(true);
    const doc = await renderPage("en", { system: "steering" });
    expect(doc.querySelector(".safety")).not.toBeNull();
  });

  it("renders on the SRS/towing/jacking case, where the flag is the promoter", async () => {
    const data = { system: "electrical", safetyCritical: true };
    expect(isSafetyCritical(data)).toBe(true);
    const doc = await renderPage("en", {
      ...data,
      severity: "safety-critical",
    });
    expect(doc.querySelector(".safety")).not.toBeNull();
  });

  it("labels the band with a heading id derived from the system", async () => {
    // Not the constant `"safety-heading"` it defaulted to (PR #72, Copilot):
    // a second consumer on one page — T502's procedures template is planned —
    // would emit two elements with one id, and `aria-labelledby` resolves to
    // the first, so one notice would announce the other's system.
    const doc = await renderPage("en", { system: "brakes" });
    const band = doc.querySelector(".safety");
    const heading = doc.querySelector(".safety__title");

    expect(heading?.id).toBe("safety-notice-brakes");
    expect(band?.getAttribute("aria-labelledby")).toBe(heading?.id);
  });

  it("gives two systems two different ids", async () => {
    const brakes = await renderPage("en", { system: "brakes" });
    const fuel = await renderPage("en", { system: "fuel" });

    expect(brakes.querySelector(".safety__title")?.id).not.toBe(
      fuel.querySelector(".safety__title")?.id
    );
  });

  it("stays off an entry that is not safety-critical", async () => {
    expect(isSafetyCritical({ system: "hvac" })).toBe(false);
    const doc = await renderPage("en", { system: "hvac" });
    expect(doc.querySelector(".safety")).toBeNull();
  });
});

/* -------------------------------------------------------------------------
 * PRB-04 — the confidence caveat
 * ---------------------------------------------------------------------- */

describe("the confidence caveat is bilingual and follows confidence.ts (PRB-04)", () => {
  for (const pageLocale of LOCALES) {
    it(`states the caveat in every language on the ${pageLocale} page`, async () => {
      const doc = await renderPage(pageLocale, { confidence: "anecdotal" });
      const said = textByLocale(doc, ".caveat", ".caveat__line");

      for (const locale of LOCALES) {
        const strings = t(locale);
        expect(said[locale], `missing ${locale} caveat line`).toEqual([
          strings.problemConfidenceCaveatTemplate.replace(
            "{tier}",
            confidenceTierLabel(strings, "anecdotal")
          ),
        ]);
      }
    });
  }

  it.each(CONFIDENCE_TIERS)(
    "renders for `%s` exactly when needsConfidenceCaveat says so",
    async (tier) => {
      const doc = await renderPage("en", { confidence: tier });
      expect(doc.querySelector(".caveat") !== null).toBe(
        needsConfidenceCaveat(tier)
      );
    }
  );

  it("resolves the placeholder rather than shipping the template", async () => {
    const doc = await renderPage("es", { confidence: "first-hand" });
    const text = doc.querySelector(".caveat")?.textContent ?? "";
    expect(text).not.toContain("{tier}");
    expect(text).toContain(confidenceTierLabel(t("es"), "first-hand"));
  });
});

/* -------------------------------------------------------------------------
 * Chips and figures — review F2 and F6
 * ---------------------------------------------------------------------- */

describe("the fix-path cost chip announces the whole range (F2)", () => {
  for (const pageLocale of LOCALES) {
    it(`names both ends of the band in ${pageLocale}`, async () => {
      const doc = await renderPage(pageLocale);
      const strings = t(pageLocale);
      const chip = [...doc.querySelectorAll('.fix__chips [role="img"]')][0];
      const label = chip?.getAttribute("aria-label") ?? "";

      // The visible glyphs say `$–$$`; the spoken form has to say as much.
      expect(chip?.textContent?.trim()).toBe("$–$$");
      expect(label).toContain(costBandLabel(strings, "minimal"));
      expect(label).toContain(costBandLabel(strings, "moderate"));
    });
  }
});

describe("the chip row never says one thing twice (F6)", () => {
  it("shows one safety-critical chip, not two, when the severity says it", async () => {
    const doc = await renderPage("en", {
      system: "brakes",
      severity: "safety-critical",
    });
    const label = t("en")["severity.safety-critical"];
    const saying = [...doc.querySelectorAll(".problem__chips .chip")].filter(
      (chip) => chip.textContent?.trim() === label
    );
    expect(saying.length).toBe(1);
  });

  it("still flags a cosmetic problem on a safety-critical system", async () => {
    const doc = await renderPage("en", {
      system: "brakes",
      severity: "cosmetic",
    });
    const texts = [...doc.querySelectorAll(".problem__chips .chip")].map(
      (chip) => chip.textContent?.trim()
    );
    expect(texts).toContain(t("en")["severity.cosmetic"]);
    expect(texts).toContain(t("en")["severity.safety-critical"]);
  });
});
