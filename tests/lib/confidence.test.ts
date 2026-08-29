/**
 * Grader — the confidence-caveat rule (AGENTS.md "Facts"): "anything below
 * `tsb` renders with a visible caveat in both languages".
 *
 * refs specs/001-foundation (AGENTS.md "Facts")
 */
import { describe, expect, it } from "vitest";

import { CONFIDENCE_TIERS } from "../../src/schemas/entry.ts";
import {
  CONFIDENCE_CAVEAT_THRESHOLD,
  needsConfidenceCaveat,
} from "../../src/lib/confidence.ts";

describe("needsConfidenceCaveat", () => {
  it("requires no caveat for the two document-backed tiers", () => {
    expect(needsConfidenceCaveat("fsm-confirmed")).toBe(false);
    expect(needsConfidenceCaveat("tsb")).toBe(false);
  });

  it("requires a caveat for everything weaker than tsb", () => {
    expect(needsConfidenceCaveat("community-consensus")).toBe(true);
    expect(needsConfidenceCaveat("first-hand")).toBe(true);
    expect(needsConfidenceCaveat("anecdotal")).toBe(true);
  });

  it("agrees with CONFIDENCE_TIERS' own strongest-first order", () => {
    // Anything whose index comes after the threshold's needs a caveat;
    // anything at or before it does not. A hand-listed set would silently
    // stop tracking the array if a tier were ever reordered.
    const thresholdIndex = CONFIDENCE_TIERS.indexOf(
      CONFIDENCE_CAVEAT_THRESHOLD
    );
    for (const [index, tier] of CONFIDENCE_TIERS.entries()) {
      expect(needsConfidenceCaveat(tier)).toBe(index > thresholdIndex);
    }
  });

  it("names tsb as the threshold, per AGENTS.md", () => {
    expect(CONFIDENCE_CAVEAT_THRESHOLD).toBe("tsb");
  });
});
