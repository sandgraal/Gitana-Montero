/**
 * The parts index's system filter (T501) — the rule its `<script>` delegates
 * to, tested without a browser.
 *
 * refs specs/001-foundation (PRT-01)
 */
import { describe, expect, it } from "vitest";
import {
  EMPTY_PARTS_FILTER,
  matchesPartsFilter,
} from "../../../src/lib/parts/filter.ts";

describe("matchesPartsFilter", () => {
  it("shows everything when no pill is chosen", () => {
    expect(matchesPartsFilter({ system: "brakes" }, EMPTY_PARTS_FILTER)).toBe(
      true
    );
    expect(matchesPartsFilter({ system: "" }, EMPTY_PARTS_FILTER)).toBe(true);
  });

  it("keeps a card whose system is the chosen one", () => {
    expect(matchesPartsFilter({ system: "brakes" }, { system: "brakes" })).toBe(
      true
    );
  });

  it("hides a card in another system", () => {
    expect(matchesPartsFilter({ system: "engine" }, { system: "brakes" })).toBe(
      false
    );
  });

  it("matches exactly — a system id is a closed-vocabulary id, not free text", () => {
    expect(matchesPartsFilter({ system: "Brakes" }, { system: "brakes" })).toBe(
      false
    );
    expect(
      matchesPartsFilter({ system: "brakes " }, { system: "brakes" })
    ).toBe(false);
  });

  it("leaves the empty state empty — a shared default is not mutated", () => {
    const state = { ...EMPTY_PARTS_FILTER };
    state.system = "brakes";
    expect(EMPTY_PARTS_FILTER.system).toBe("");
  });
});
