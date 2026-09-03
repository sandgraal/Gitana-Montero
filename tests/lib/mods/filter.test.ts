/**
 * The mods index's facet filter and the derived "worst consequence" value
 * (MOD-01).
 *
 * `worstImpact` is the one with teeth: a card that filed a mod under its
 * *gentlest* consequence would be the listing helping a reader miss the
 * sentence that mattered, and an entry with no declared consequences must not
 * read as one whose consequences are mild.
 *
 * refs specs/001-foundation (MOD-01, FIT-01)
 */
import { describe, expect, it } from "vitest";
import {
  EMPTY_MODS_FILTER,
  matchesModsFilter,
  worstImpact,
} from "../../../src/lib/mods/filter.ts";
import { MOD_IMPACTS } from "../../../src/lib/mods/references.ts";

describe("worstImpact", () => {
  it("is null for an entry that declares no consequences", () => {
    // Not `needs-adjustment`: "we have written nothing down" is a different
    // claim from "it needs an alignment" (AGENTS.md, a failure is not a zero).
    expect(worstImpact([])).toBeNull();
  });

  it("returns the single impact when there is only one", () => {
    for (const impact of MOD_IMPACTS) {
      expect(worstImpact([impact])).toBe(impact);
    }
  });

  it("picks `breaks` over `degrades`, whichever order they arrive in", () => {
    expect(worstImpact(["degrades", "breaks"])).toBe("breaks");
    expect(worstImpact(["breaks", "degrades"])).toBe("breaks");
  });

  it("picks `degrades` over `needs-adjustment`", () => {
    expect(worstImpact(["needs-adjustment", "degrades"])).toBe("degrades");
  });

  it("follows MOD_IMPACTS' order rather than a second copy of the ranking", () => {
    // Worst is index 0 by construction; this pins the two together.
    expect(worstImpact([...MOD_IMPACTS])).toBe(MOD_IMPACTS[0]);
  });

  it("ignores a value outside the vocabulary rather than ranking it", () => {
    expect(worstImpact(["makes-it-worse"])).toBeNull();
    expect(worstImpact(["makes-it-worse", "degrades"])).toBe("degrades");
  });
});

describe("matchesModsFilter", () => {
  const card = { system: "suspension", impact: "breaks" };

  it("matches everything while both facets are unset", () => {
    expect(matchesModsFilter(card, EMPTY_MODS_FILTER)).toBe(true);
    expect(
      matchesModsFilter({ system: "body", impact: "" }, EMPTY_MODS_FILTER)
    ).toBe(true);
  });

  it("narrows on the system facet alone", () => {
    expect(matchesModsFilter(card, { system: "suspension", impact: "" })).toBe(
      true
    );
    expect(matchesModsFilter(card, { system: "brakes", impact: "" })).toBe(
      false
    );
  });

  it("narrows on the impact facet alone", () => {
    expect(matchesModsFilter(card, { system: "", impact: "breaks" })).toBe(
      true
    );
    expect(matchesModsFilter(card, { system: "", impact: "degrades" })).toBe(
      false
    );
  });

  it("ANDs the two facets rather than ORing them", () => {
    expect(
      matchesModsFilter(card, { system: "suspension", impact: "degrades" })
    ).toBe(false);
    expect(
      matchesModsFilter(card, { system: "brakes", impact: "breaks" })
    ).toBe(false);
  });

  it("hides a consequence-less card from any impact narrowing", () => {
    expect(
      matchesModsFilter(
        { system: "body", impact: "" },
        { system: "", impact: "breaks" }
      )
    ).toBe(false);
  });

  it("matches exactly, never by prefix", () => {
    expect(
      matchesModsFilter(
        { system: "suspension", impact: "breaks" },
        { system: "susp", impact: "" }
      )
    ).toBe(false);
  });
});
