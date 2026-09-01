/**
 * Unit coverage for `src/lib/problems.ts` — the problem finder's decisions
 * (T401).
 *
 * These are the answers the flagship page is built out of: which URL an entry
 * lives at, whether two entries could collide there, which problem a triage
 * listing shows first, and how one stored figure becomes `$–$$` or `1–2 hr`
 * without a number ever being written into a translated string.
 *
 * refs specs/001-foundation (PRB-01, PRB-05, I18N-05)
 */
import { describe, expect, it } from "vitest";

import {
  assertProblemSlugs,
  causeConfidence,
  causeConfidenceDiffers,
  compareProblems,
  costBandAccessibleName,
  costBandGlyphs,
  drivabilityRank,
  fitmentYearsLabel,
  fixTimeLabel,
  problemRoutePath,
  problemSlugRegistry,
  severityRank,
} from "../../src/lib/problems.ts";
import {
  COST_BANDS,
  DRIVABILITY_STATES,
  PROBLEM_SEVERITIES,
  type CostBand,
} from "../../src/schemas/problems.ts";

function routable(id: string, en: string, es: string) {
  return { id, data: { prose: { en: { slug: en }, es: { slug: es } } } };
}

describe("the slug registry — I18N-05", () => {
  it("projects each entry's per-locale slugs into the registry shape", () => {
    expect(
      problemSlugRegistry([routable("test-a", "knock", "golpeteo")])
    ).toEqual({
      problems: { "test-a": { en: "knock", es: "golpeteo" } },
    });
  });

  it("accepts a sound set of slugs", () => {
    expect(() =>
      assertProblemSlugs([
        routable("test-a", "knock", "golpeteo"),
        routable("test-b", "rattle", "traqueteo"),
      ])
    ).not.toThrow();
  });

  it("fails the build when two entries claim one URL in a locale", () => {
    expect(() =>
      assertProblemSlugs([
        routable("test-a", "knock", "golpeteo"),
        routable("test-b", "rattle", "golpeteo"),
      ])
    ).toThrow(/golpeteo/);
  });

  it("lets one entry carry the same slug in both locales", () => {
    // Many problems are the same word either side (`abs`, `gdi`); that is not
    // a collision, because the locale prefix disambiguates the URL.
    expect(() =>
      assertProblemSlugs([routable("test-a", "abs", "abs")])
    ).not.toThrow();
  });

  it("fails when an entry has no slug for a locale", () => {
    expect(() =>
      assertProblemSlugs([
        { id: "test-a", data: { prose: { en: { slug: "knock" }, es: {} } } },
      ])
    ).toThrow(/es/);
  });

  it("nests the entry under its locale's own segment", () => {
    expect(problemRoutePath("problemas", "golpeteo")).toBe(
      "/problemas/golpeteo/"
    );
    expect(problemRoutePath("problems", "knock")).toBe("/problems/knock/");
  });
});

describe("triage ordering", () => {
  const collator = new Intl.Collator("en");

  it("ranks drivability by how restrictive it is", () => {
    expect(drivabilityRank("drive-normally")).toBe(0);
    expect(drivabilityRank("tow-only")).toBe(DRIVABILITY_STATES.length - 1);
  });

  it("ranks `safety-critical` as the worst severity", () => {
    expect(severityRank("safety-critical")).toBe(0);
    expect(severityRank("cosmetic")).toBe(PROBLEM_SEVERITIES.length - 1);
  });

  it("puts the truck you must not drive above the one you may", () => {
    const towOnly = {
      severity: "cosmetic" as const,
      drivability: "tow-only" as const,
      title: "z",
    };
    const hazardButDrivable = {
      severity: "safety-critical" as const,
      drivability: "drive-normally" as const,
      title: "a",
    };
    expect(compareProblems(towOnly, hazardButDrivable, collator)).toBeLessThan(
      0
    );
  });

  it("breaks a drivability tie on severity", () => {
    const worse = {
      severity: "safety-critical" as const,
      drivability: "do-not-drive" as const,
      title: "z",
    };
    const milder = {
      severity: "degrading" as const,
      drivability: "do-not-drive" as const,
      title: "a",
    };
    expect(compareProblems(worse, milder, collator)).toBeLessThan(0);
  });

  it("breaks a full tie on the reader's own collation, not on insertion order", () => {
    const shared = {
      severity: "degrading" as const,
      drivability: "drive-normally" as const,
    };
    expect(
      compareProblems(
        { ...shared, title: "ábaco" },
        { ...shared, title: "banco" },
        new Intl.Collator("es")
      )
    ).toBeLessThan(0);
  });
});

describe("per-cause confidence", () => {
  it("falls back to the entry's tier when a cause states none", () => {
    expect(causeConfidence("community-consensus", undefined)).toBe(
      "community-consensus"
    );
  });

  it("uses the cause's own tier when it states one", () => {
    expect(causeConfidence("anecdotal", "tsb")).toBe("tsb");
  });

  it("only calls for a chip when the two actually differ", () => {
    expect(causeConfidenceDiffers("anecdotal", undefined)).toBe(false);
    expect(causeConfidenceDiffers("anecdotal", "anecdotal")).toBe(false);
    expect(causeConfidenceDiffers("anecdotal", "tsb")).toBe(true);
  });
});

describe("cost bands render as glyphs, never as a figure", () => {
  it("counts glyphs off the band's position in the vocabulary", () => {
    expect(costBandGlyphs({ from: "minimal" })).toBe("$");
    expect(costBandGlyphs({ from: "major" })).toBe("$$$$");
    expect(COST_BANDS.length).toBe(4);
  });

  it("renders a range with an en dash", () => {
    expect(costBandGlyphs({ from: "minimal", to: "moderate" })).toBe("$–$$");
  });

  it("collapses a range whose ends are the same band", () => {
    expect(costBandGlyphs({ from: "moderate", to: "moderate" })).toBe("$$");
  });

  it("contains no letter in any language", () => {
    for (const band of COST_BANDS) {
      expect(costBandGlyphs({ from: band })).not.toMatch(/\p{L}/u);
    }
  });
});

describe("the spoken form of a cost band says as much as the glyphs (F2)", () => {
  const label = (band: string) => `LABEL(${band})`;

  it("names the single band", () => {
    expect(costBandAccessibleName({ from: "moderate" }, label)).toBe(
      "LABEL(moderate)"
    );
  });

  it("names BOTH ends of a range — the review-F2 regression", () => {
    // `$–$$` announced as "cheapest class of repair" hid the upper half of the
    // estimate from exactly the readers who cannot see the glyphs.
    const spoken = costBandAccessibleName(
      { from: "minimal", to: "moderate" },
      label
    );
    expect(spoken).toContain("LABEL(minimal)");
    expect(spoken).toContain("LABEL(moderate)");
  });

  it("collapses a range whose ends are the same band, like the glyphs do", () => {
    expect(costBandAccessibleName({ from: "major", to: "major" }, label)).toBe(
      "LABEL(major)"
    );
  });

  it("says a band for every glyph, across the whole vocabulary", () => {
    for (const from of COST_BANDS) {
      for (const to of COST_BANDS) {
        if (COST_BANDS.indexOf(to) < COST_BANDS.indexOf(from)) continue;
        const glyphs = costBandGlyphs({ from, to });
        const spoken = costBandAccessibleName({ from, to }, label);
        const ends = glyphs.includes("–") ? 2 : 1;
        expect(spoken.match(/LABEL\(/g)?.length, `${from}→${to}`).toBe(ends);
      }
    }
  });

  it("invents no connector word — the caller owns every translated string", () => {
    // With letterless labels the result must stay letterless: anything this
    // module joined the two ends with would be untranslated English.
    const digits = (band: CostBand) => String(COST_BANDS.indexOf(band));
    expect(
      costBandAccessibleName({ from: "minimal", to: "major" }, digits)
    ).not.toMatch(/\p{L}/u);
  });
});

describe("times are formatted, never translated", () => {
  it("formats one stored figure in the page's own locale", () => {
    expect(fixTimeLabel({ value: 1, unit: "h" }, "en")).toMatch(/1/);
    expect(fixTimeLabel({ value: 90, unit: "min" }, "en")).toMatch(/90/);
  });

  it("gives the two locales their own number formatting", () => {
    const en = fixTimeLabel({ value: 1.5, unit: "h" }, "en");
    const es = fixTimeLabel({ value: 1.5, unit: "h" }, "es");
    expect(en).toContain("1.5");
    expect(es).toContain("1,5");
  });

  it("renders a band with the unit attached once, at the end", () => {
    const label = fixTimeLabel({ min: 1, max: 2, unit: "h" }, "en");
    expect(label.startsWith("1–2")).toBe(true);
  });

  it("stays total on the shape the schema cannot produce", () => {
    expect(fixTimeLabel({ min: 1, unit: "h" }, "en")).toBe("");
  });
});

describe("fitment year chips", () => {
  it("renders a closed window with an en dash and no digit grouping", () => {
    expect(fitmentYearsLabel({ from: 1999, to: 2006 })).toBe("1999–2006");
  });

  it("leaves an open end open rather than inventing one", () => {
    expect(fitmentYearsLabel({ from: 2006 })).toBe("2006–");
  });

  it("says nothing when the entry states no window", () => {
    expect(fitmentYearsLabel(undefined)).toBeNull();
    expect(fitmentYearsLabel({})).toBeNull();
  });
});
