/**
 * The mods safety widening (AGENTS.md "Safety and legal").
 *
 * The rule under test is the one this collection adds on top of
 * `src/lib/safety.ts`: a mod is safety-critical when its own `system` is on
 * AGENTS.md's list, **or** when its upward-only flag says so, **or** when it
 * says it affects a system on that list. The third disjunct is the new one,
 * and it is the reason a dual-battery install that breaks the ABS module
 * renders the standing bilingual notice.
 *
 * The direction matters more than the value: every assertion below that a
 * notice appears is paired with one showing it cannot be turned *off* by any
 * input. A safety rule that can be argued down by data is not a safety rule.
 *
 * refs specs/001-foundation (MOD-01; AGENTS.md "Safety and legal")
 */
import { describe, expect, it } from "vitest";
import { modSafety } from "../../../src/lib/mods/safety.ts";
import { SAFETY_CRITICAL_SYSTEMS } from "../../../src/lib/safety.ts";

describe("modSafety", () => {
  it("is quiet for a mod on no listed system, with no affected systems", () => {
    expect(modSafety({ system: "body", affects: [] })).toEqual({
      safetyCritical: false,
      systems: [],
    });
  });

  it("fires on every system AGENTS.md lists", () => {
    for (const system of SAFETY_CRITICAL_SYSTEMS) {
      expect(modSafety({ system, affects: [] })).toEqual({
        safetyCritical: true,
        systems: [system],
      });
    }
  });

  it("fires from the upward-only flag with no listed system in sight", () => {
    const verdict = modSafety({ system: "electrical", safetyCritical: true });
    expect(verdict.safetyCritical).toBe(true);
    // Empty, and honestly so: no *system* is the reason.
    expect(verdict.systems).toEqual([]);
  });

  it("FIRES when an affected system is safety-critical and the mod's own is not", () => {
    // The widening. A dual battery is `electrical`; breaking the ABS module
    // makes this a brakes page.
    const verdict = modSafety({
      system: "electrical",
      affects: [{ id: "abs", system: "brakes", impact: "breaks" }],
    });
    expect(verdict.safetyCritical).toBe(true);
    expect(verdict.systems).toEqual(["brakes"]);
  });

  it("fires on any impact level, not only `breaks`", () => {
    for (const impact of ["breaks", "degrades", "needs-adjustment"]) {
      expect(
        modSafety({
          system: "body",
          affects: [{ id: "row", system: "steering", impact }],
        }).safetyCritical
      ).toBe(true);
    }
  });

  it("names the entry's own system first, then the affected ones", () => {
    expect(
      modSafety({
        system: "suspension",
        affects: [
          { id: "a", system: "body", impact: "degrades" },
          { id: "b", system: "brakes", impact: "breaks" },
        ],
      }).systems
    ).toEqual(["suspension", "brakes"]);
  });

  it("does not name one system twice", () => {
    expect(
      modSafety({
        system: "brakes",
        affects: [
          { id: "a", system: "brakes", impact: "breaks" },
          { id: "b", system: "brakes", impact: "degrades" },
        ],
      }).systems
    ).toEqual(["brakes"]);
  });

  it("ignores an affected system that is not on the list", () => {
    expect(
      modSafety({
        system: "body",
        affects: [{ id: "a", system: "electrical", impact: "breaks" }],
      })
    ).toEqual({ safetyCritical: false, systems: [] });
  });

  it("cannot be switched off by `safetyCritical: false`", () => {
    // The schema refuses that value outright; this proves the *reader* would
    // not honour it either, so the two layers cannot disagree.
    expect(
      modSafety({ system: "brakes", safetyCritical: false }).safetyCritical
    ).toBe(true);
    expect(
      modSafety({
        system: "body",
        safetyCritical: false,
        affects: [{ id: "a", system: "fuel", impact: "breaks" }],
      }).safetyCritical
    ).toBe(true);
  });

  it("answers `false` rather than throwing on a malformed entry", () => {
    for (const value of [null, undefined, 7, "brakes"]) {
      expect(modSafety(value)).toEqual({ safetyCritical: false, systems: [] });
    }
  });

  it("ignores a malformed `affects` row rather than crediting it", () => {
    expect(
      modSafety({ system: "body", affects: [null, 3, { system: 7 }] })
    ).toEqual({ safetyCritical: false, systems: [] });
  });
});
