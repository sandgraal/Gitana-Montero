/**
 * Graders — the boundary tables of the entry contract: the locale enum, the
 * confidence tiers, the source shape, the fitment placeholder, and the "no
 * silent strip" rule at the entry level.
 *
 * Sources for each block:
 * - Locale: spec §2 — "`en` (English) or `es` (Costa Rican Spanish, `usted`
 *   register). Never any other value."
 * - Confidence: spec §2 and AGENTS.md — five tiers, in the total order
 *   ratified by the owner on 2026-08-27:
 *   `fsm-confirmed > tsb > community-consensus > first-hand > anecdotal`.
 *   See the ordering block for what that resolved.
 * - Sources: plan.md — `{ title, url, archiveUrl, accessed, kind }`,
 *   `kind ∈ fsm | tsb | forum | video | vendor | first-hand`; AGENTS.md
 *   requires archiving the URL at citation time, so `archiveUrl` is not
 *   optional.
 * - Fitment: AGENTS.md — "Every entity carries an explicit fitment. A fact
 *   with no fitment is a build error." The *values* inside a fitment are not
 *   graded here: resolving gen/market/engine ids against the taxonomy is
 *   FIT-02, which is T202/T203's contract, not T104's placeholder.
 * - SCF-04: an unknown field is named, not silently dropped.
 *
 * ## Expected-failure convention
 *
 * `it.fails` is the marker; T104 activates a grader by deleting exactly that
 * `.fails`. Full note in
 * `tests/schemas/prose-locale-completeness.test.ts`.
 *
 * refs specs/001-foundation (I18N-06, SCF-01, SCF-04)
 */
import { describe, expect, it } from "vitest";
import { z } from "astro/zod";
import {
  CONFIDENCE_TIERS,
  LOCALES,
  SOURCE_KINDS,
  confidenceSchema,
  defineEntrySchema,
  fitmentSchema,
  localeSchema,
  sourceSchema,
} from "../../src/schemas/entry.ts";
import { issuePaths, unrecognizedKeys } from "../helpers/schema-outcome.ts";
import { makeSource, makeValidEntry } from "../fixtures/schema-fixtures.ts";

const entrySchema = () =>
  defineEntrySchema(
    { torqueNm: z.number(), oemPartNumber: z.string() },
    { title: z.string(), summary: z.string() }
  );

const malformedFitments: [string, unknown][] = [
  ["an empty gens array", { gens: [] }],
  ["no gens key", { markets: ["cr"] }],
  ["a bare string instead of an object", "gen3"],
  ["null", null],
];

describe("locale enum (spec §2: en and es, never any other value)", () => {
  it.fails("LOCALES is exactly ['en', 'es'], in that order", () => {
    expect([...LOCALES]).toEqual(["en", "es"]);
  });

  it.fails.each([
    ["en", true],
    ["es", true],
    ["EN", false],
    ["ES", false],
    ["en-US", false],
    ["es-CR", false],
    ["pt", false],
    ["fr", false],
    ["", false],
    ["en ", false],
    ["eng", false],
  ])("localeSchema accepts %j → %s", (candidate, accepted) => {
    expect(localeSchema.safeParse(candidate).success).toBe(accepted);
  });

  /**
   * Each row wraps its candidate in a factory rather than listing the value
   * directly. A bare array row (`["en"]`) in a mixed table is ambiguous:
   * Vitest 4.1.11 passes it through as a single argument, but a runner that
   * chose to spread it instead would turn this grader permanently red after
   * activation — and the implementer is not allowed to edit `tests/` to fix
   * it. A factory row is one argument under either reading.
   */
  it.fails.each<[string, () => unknown]>([
    ["null", () => null],
    ["undefined", () => undefined],
    ["the number 1", () => 1],
    ["the array ['en']", () => ["en"]],
    ["the object { locale: 'en' }", () => ({ locale: "en" })],
    ["a boolean", () => true],
  ])("localeSchema rejects %s", (_label, makeCandidate) => {
    expect(localeSchema.safeParse(makeCandidate()).success).toBe(false);
  });
});

describe("confidence tiers (spec §2, AGENTS.md 'Facts')", () => {
  it.fails("CONFIDENCE_TIERS holds exactly the five named tiers", () => {
    expect([...CONFIDENCE_TIERS].sort()).toEqual(
      [
        "anecdotal",
        "community-consensus",
        "first-hand",
        "fsm-confirmed",
        "tsb",
      ].sort()
    );
  });

  /**
   * Kept separate from the membership check above on purpose: when a tier is
   * renamed the membership grader is the one that goes red, and when only the
   * sequence is wrong this one is, so the failure names the actual mistake.
   */
  it.fails("CONFIDENCE_TIERS is in the ratified order, strongest first", () => {
    expect([...CONFIDENCE_TIERS]).toEqual([
      "fsm-confirmed",
      "tsb",
      "community-consensus",
      "first-hand",
      "anecdotal",
    ]);
  });

  it.fails.each([
    "fsm-confirmed",
    "tsb",
    "community-consensus",
    "first-hand",
    "anecdotal",
  ])("confidenceSchema accepts the tier %j", (tier) => {
    expect(confidenceSchema.safeParse(tier).success).toBe(true);
  });

  it.fails.each([
    "unknown",
    "fsm",
    "FSM-CONFIRMED",
    "firsthand",
    "first hand",
    "unverified",
    "",
  ])("confidenceSchema rejects the non-tier %j", (candidate) => {
    expect(confidenceSchema.safeParse(candidate).success).toBe(false);
  });

  /**
   * `CONFIDENCE_TIERS` is ordered strongest evidence first, so a smaller
   * index means stronger evidence.
   *
   * The total order is ratified by the owner (2026-08-27):
   * `fsm-confirmed > tsb > community-consensus > first-hand > anecdotal`.
   * Spec §2 had listed the chain with `first-hand` last while its prose said
   * `first-hand` "ranks above `anecdotal`, below `tsb`"; the ruling puts it
   * between `community-consensus` and `anecdotal`, and AGENTS.md and spec §2
   * are being aligned to that conductor-side.
   *
   * Consequence worth carrying into T401 (not graded here, PRB-04 is that
   * task's contract): under this order AGENTS.md's "anything below `tsb`"
   * and PRB-04's "`community-consensus` or lower" name the same three tiers,
   * so the caveat rules agree instead of contradicting each other.
   *
   * The adjacent pairs pin the sequence; the two non-adjacent pairs are kept
   * as regression guards, so a reordering that happens to preserve
   * neighbours still gets caught.
   */
  it.fails.each([
    ["fsm-confirmed", "tsb"],
    ["tsb", "community-consensus"],
    ["community-consensus", "first-hand"],
    ["first-hand", "anecdotal"],
    ["tsb", "first-hand"],
    ["community-consensus", "anecdotal"],
  ])("ranks %s above %s", (stronger, weaker) => {
    const tiers: string[] = [...CONFIDENCE_TIERS];

    expect(tiers).toContain(stronger);
    expect(tiers).toContain(weaker);
    expect(tiers.indexOf(stronger)).toBeLessThan(tiers.indexOf(weaker));
  });

  it.fails("requires a confidence tier on every entry", () => {
    const entry = makeValidEntry();
    delete entry.confidence;

    const outcome = entrySchema().safeParse(entry);

    expect(outcome.success).toBe(false);
    expect(issuePaths(outcome)).toContain("confidence");
  });
});

describe("sources (plan.md conventions, AGENTS.md archive-at-citation)", () => {
  it.fails("accepts a fully-formed source", () => {
    expect(sourceSchema.safeParse(makeSource()).success).toBe(true);
  });

  it.fails.each(["title", "url", "archiveUrl", "accessed", "kind"])(
    "rejects a source missing `%s`",
    (field) => {
      const source: Record<string, unknown> = makeSource();
      delete source[field];

      const outcome = sourceSchema.safeParse(source);

      expect(outcome.success).toBe(false);
      expect(issuePaths(outcome)).toContain(field);
    }
  );

  it.fails("SOURCE_KINDS holds exactly the six kinds plan.md names", () => {
    expect([...SOURCE_KINDS].sort()).toEqual(
      ["first-hand", "forum", "fsm", "tsb", "vendor", "video"].sort()
    );
  });

  it.fails.each(["blog", "guess", "chatgpt", "FSM", ""])(
    "rejects the source kind %j",
    (kind) => {
      const outcome = sourceSchema.safeParse({ ...makeSource(), kind });

      expect(outcome.success).toBe(false);
      expect(issuePaths(outcome)).toContain("kind");
    }
  );

  it.fails.each(["not-a-url", "example.invalid/x", "javascript:alert(1)"])(
    "rejects the malformed source url %j",
    (url) => {
      const outcome = sourceSchema.safeParse({ ...makeSource(), url });

      expect(outcome.success).toBe(false);
      expect(issuePaths(outcome)).toContain("url");
    }
  );

  it.fails(
    "names the indexed path when a source inside an entry is malformed",
    () => {
      const entry = makeValidEntry();
      delete entry.sources?.[0]?.archiveUrl;

      const outcome = entrySchema().safeParse(entry);

      expect(outcome.success).toBe(false);
      expect(issuePaths(outcome)).toContain("sources.0.archiveUrl");
    }
  );

  it.fails("requires a `sources` array on every entry", () => {
    const entry = makeValidEntry();
    delete entry.sources;

    const outcome = entrySchema().safeParse(entry);

    expect(outcome.success).toBe(false);
    expect(issuePaths(outcome)).toContain("sources");
  });
});

describe("fitment placeholder (AGENTS.md: no fact without a fitment)", () => {
  it.fails("accepts a fitment naming one or more generations", () => {
    expect(fitmentSchema.safeParse({ gens: ["gen3"] }).success).toBe(true);
    expect(
      fitmentSchema.safeParse({ gens: ["gen2", "gen3"], markets: ["cr", "us"] })
        .success
    ).toBe(true);
  });

  it.fails.each(malformedFitments)(
    "rejects a fitment with %s",
    (_label, candidate) => {
      expect(fitmentSchema.safeParse(candidate).success).toBe(false);
    }
  );

  it.fails("requires `fitment` on every entry", () => {
    const entry = makeValidEntry();
    delete entry.fitment;

    const outcome = entrySchema().safeParse(entry);

    expect(outcome.success).toBe(false);
    expect(issuePaths(outcome)).toContain("fitment");
  });
});

describe("entry identity and unknown fields (SCF-04)", () => {
  it.fails("requires a non-empty `id`", () => {
    const withoutId = makeValidEntry();
    delete withoutId.id;
    const blankId = makeValidEntry();
    blankId.id = "";

    expect(issuePaths(entrySchema().safeParse(withoutId))).toContain("id");
    expect(issuePaths(entrySchema().safeParse(blankId))).toContain("id");
  });

  it.fails("names an unknown top-level field instead of stripping it", () => {
    const entry: Record<string, unknown> = makeValidEntry();
    entry["torqueNM"] = 88;

    const outcome = entrySchema().safeParse(entry);

    expect(outcome.success).toBe(false);
    expect(unrecognizedKeys(outcome)).toContain("torqueNM");
  });
});
