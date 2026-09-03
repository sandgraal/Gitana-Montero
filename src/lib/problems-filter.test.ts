import { describe, expect, it } from "vitest";
import {
  buildHaystack,
  buildSymptomIndex,
  countMatches,
  matchesFilter,
  normalizedSymptoms,
  type ProblemFilterCard,
} from "./problems-filter.ts";

const EN_COLLATOR = new Intl.Collator("en", { sensitivity: "base" });
const ES_COLLATOR = new Intl.Collator("es", { sensitivity: "base" });

describe("buildHaystack", () => {
  it("joins title, summary, symptoms and chips into one normalized string", () => {
    const haystack = buildHaystack({
      title: "Transfer-case chain stretch",
      summary: "Super Select II chain wears and rattles under load.",
      symptoms: ["Clunk on takeoff", "4WD warning light flickers"],
      chips: ["Drivetrain", "Drive gently"],
    });

    expect(haystack).toContain("transfer-case chain stretch");
    expect(haystack).toContain("clunk on takeoff");
    expect(haystack).toContain("4wd warning light flickers");
    expect(haystack).toContain("drivetrain");
    expect(haystack).toContain("drive gently");
  });

  it("normalizes accents and case the same way the glossary does", () => {
    const haystack = buildHaystack({
      title: "Motor pierde potencia",
      summary: "",
      symptoms: ["Vibración al acelerar"],
      chips: [],
    });

    // Typed without the accent, the way a phone keyboard often does.
    expect(haystack).toContain("vibracion al acelerar");
  });
});

describe("normalizedSymptoms", () => {
  it("normalizes each phrase independently", () => {
    expect(normalizedSymptoms(["Hard Shifting", "Rattling  Noise"])).toEqual([
      "hard shifting",
      "rattling noise",
    ]);
  });

  it("returns an empty array for an empty input", () => {
    expect(normalizedSymptoms([])).toEqual([]);
  });
});

describe("matchesFilter", () => {
  const card: ProblemFilterCard = {
    symptoms: ["hard shifting", "clunk on takeoff"],
    haystack: "transfer-case chain stretch hard shifting clunk on takeoff",
  };

  it("matches everything when both facets are empty (initial state)", () => {
    expect(matchesFilter(card, { symptom: "", query: "" })).toBe(true);
  });

  it("matches a card whose own symptom set contains the picked phrase exactly", () => {
    expect(matchesFilter(card, { symptom: "hard shifting", query: "" })).toBe(
      true
    );
  });

  it("rejects a card whose symptom set does not contain the picked phrase", () => {
    expect(matchesFilter(card, { symptom: "engine misfire", query: "" })).toBe(
      false
    );
  });

  it("does not match a picked symptom as a mere substring of another phrase", () => {
    // "clunk" is a substring of "clunk on takeoff" but not a phrase of its
    // own in this card's symptom set — picking must be an exact match.
    expect(matchesFilter(card, { symptom: "clunk", query: "" })).toBe(false);
  });

  it("matches free text as a substring of the combined haystack", () => {
    expect(matchesFilter(card, { symptom: "", query: "chain" })).toBe(true);
  });

  it("is case- and accent-insensitive for free text", () => {
    expect(matchesFilter(card, { symptom: "", query: "HARD Shifting" })).toBe(
      true
    );
  });

  it("rejects free text that matches nothing", () => {
    expect(matchesFilter(card, { symptom: "", query: "brake pads" })).toBe(
      false
    );
  });

  it("ANDs both facets — a query that fails still fails even if the symptom matches", () => {
    expect(
      matchesFilter(card, { symptom: "hard shifting", query: "brake pads" })
    ).toBe(false);
  });

  it("ANDs both facets — a picked symptom the card lacks fails even if the query matches", () => {
    expect(
      matchesFilter(card, { symptom: "engine misfire", query: "chain" })
    ).toBe(false);
  });
});

describe("countMatches", () => {
  const cards: ProblemFilterCard[] = [
    { symptoms: ["hard shifting"], haystack: "transfer case hard shifting" },
    { symptoms: ["clunk"], haystack: "sway bar clunk" },
    { symptoms: ["hard shifting"], haystack: "valve body hard shifting" },
  ];

  it("counts every card when the filter is permissive", () => {
    expect(countMatches(cards, { symptom: "", query: "" })).toBe(3);
  });

  it("counts only the cards a picked symptom matches", () => {
    expect(countMatches(cards, { symptom: "hard shifting", query: "" })).toBe(
      2
    );
  });

  it("counts zero when nothing matches", () => {
    expect(
      countMatches(cards, { symptom: "", query: "nonexistent phrase" })
    ).toBe(0);
  });
});

describe("buildSymptomIndex", () => {
  it("returns one pill per distinct phrase, sorted by the collator", () => {
    const index = buildSymptomIndex(
      [
        { symptoms: ["Hard shifting", "Clunk on takeoff"] },
        { symptoms: ["Engine misfire"] },
      ],
      EN_COLLATOR
    );

    expect(index.map((entry) => entry.label)).toEqual([
      "Clunk on takeoff",
      "Engine misfire",
      "Hard shifting",
    ]);
  });

  it("collapses phrases that normalize the same, keeping the first-seen phrasing", () => {
    const index = buildSymptomIndex(
      [
        { symptoms: ["Hard Shifting"] },
        { symptoms: ["hard shifting"] },
        { symptoms: ["HARD SHIFTING"] },
      ],
      EN_COLLATOR
    );

    expect(index).toHaveLength(1);
    expect(index[0]).toEqual({
      normalized: "hard shifting",
      label: "Hard Shifting",
    });
  });

  it("collapses accent variants to one pill", () => {
    const index = buildSymptomIndex(
      [
        { symptoms: ["Vibración al acelerar"] },
        { symptoms: ["Vibracion al acelerar"] },
      ],
      ES_COLLATOR
    );

    expect(index).toHaveLength(1);
    expect(index[0]?.label).toBe("Vibración al acelerar");
  });

  it("skips empty or whitespace-only phrases", () => {
    const index = buildSymptomIndex(
      [{ symptoms: ["", "   ", "Real symptom"] }],
      EN_COLLATOR
    );

    expect(index).toEqual([
      { normalized: "real symptom", label: "Real symptom" },
    ]);
  });

  it("returns an empty index for an empty collection (T401's current state)", () => {
    expect(buildSymptomIndex([], EN_COLLATOR)).toEqual([]);
  });

  it("is deterministic across repeated calls with the same input", () => {
    const entries = [
      { symptoms: ["Zebra noise"] },
      { symptoms: ["Alpha rattle"] },
    ];
    expect(buildSymptomIndex(entries, EN_COLLATOR)).toEqual(
      buildSymptomIndex(entries, EN_COLLATOR)
    );
  });
});
