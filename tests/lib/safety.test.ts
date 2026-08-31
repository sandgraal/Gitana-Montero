/**
 * Unit tests — the safety-critical rule (`src/lib/safety.ts`).
 *
 * This function decides whether a warning appears, so its failure mode is
 * silence: an entry that should carry the standing bilingual safety notice and
 * does not. The negative controls (a brakes figure, a steering figure) matter
 * more here than the positive ones.
 *
 * refs specs/001-foundation (REF-01, PRB-03, PRC-02)
 */
import { describe, expect, it } from "vitest";
import {
  SAFETY_CRITICAL_SYSTEMS,
  isSafetyCritical,
  safetyCriticalSystemsAreKnown,
  systemIsSafetyCritical,
} from "../../src/lib/safety.ts";
import { GLOSSARY_SYSTEMS } from "../../src/schemas/glossary.ts";

describe("SAFETY_CRITICAL_SYSTEMS", () => {
  it("is every AGENTS.md safety-critical system with an id of its own", () => {
    expect([...SAFETY_CRITICAL_SYSTEMS].sort()).toEqual([
      "brakes",
      "fuel",
      "steering",
      "suspension",
      "wheels-tires",
    ]);
  });

  it("names only real glossary systems", () => {
    // A renamed system id would otherwise silently stop matching, and the
    // notice would silently stop rendering.
    expect(safetyCriticalSystemsAreKnown()).toBe(true);
    for (const system of SAFETY_CRITICAL_SYSTEMS) {
      expect(GLOSSARY_SYSTEMS).toContain(system);
    }
  });
});

describe("isSafetyCritical", () => {
  it.each([...SAFETY_CRITICAL_SYSTEMS])(
    "is true for a %s entry with no flag at all",
    (system) => {
      expect(isSafetyCritical({ system })).toBe(true);
    }
  );

  it("is false for an ordinary system with no flag", () => {
    expect(isSafetyCritical({ system: "body" })).toBe(false);
    expect(isSafetyCritical({ system: "interior" })).toBe(false);
  });

  it("is true for an explicitly promoted entry (SRS, jacking points)", () => {
    expect(isSafetyCritical({ system: "body", safetyCritical: true })).toBe(
      true
    );
  });

  it("stays true when a safety-critical system is flagged false", () => {
    // The schema rejects this combination outright; the predicate must not
    // depend on that, because it also answers for collections whose schemas
    // are not written yet.
    expect(isSafetyCritical({ system: "brakes", safetyCritical: false })).toBe(
      true
    );
  });

  it("is false for an entry with nothing to go on", () => {
    expect(isSafetyCritical({})).toBe(false);
    expect(isSafetyCritical({ system: 7 })).toBe(false);
    expect(isSafetyCritical({ safetyCritical: "yes" })).toBe(false);
  });
});

describe("systemIsSafetyCritical", () => {
  it("answers on the system alone, ignoring any flag", () => {
    expect(systemIsSafetyCritical("brakes")).toBe(true);
    expect(systemIsSafetyCritical("body")).toBe(false);
    expect(systemIsSafetyCritical(undefined)).toBe(false);
  });
});
