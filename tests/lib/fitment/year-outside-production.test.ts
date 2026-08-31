/**
 * Graders — `year-outside-production`, FIT-02's third issue code.
 *
 * The T202 review raised this as an advisory and tasks.md's T203 line adopted
 * it as a ruling: *a fitment year-window **disjoint** from the union of its
 * (expanded) generations' recorded production spans is a build error under a
 * NEW third issue code.* The code did not exist when T202 was written — the
 * canary pinned `FITMENT_ISSUE_CODES` at two entries — so these graders are
 * T203's own, written against the ruling rather than against the
 * implementation.
 *
 * ## The three halves of the ruling, each graded separately
 *
 * 1. **Disjoint is an error.** `gens: ["gen3"], years: {from: 2010, to: 2012}`
 *    names a truck nobody built. That is a transposed digit, and FIT-02's
 *    whole reason for existing is that such an entry otherwise ships as a page
 *    no vehicle can ever reach.
 * 2. **Partial overlap is NOT an error.** It is gaps-report material (GAP-01).
 *    This follows directly from the JDM-span contract (conductor ruling,
 *    2026-08-30): the recorded `production` spans are the *Japanese-market*
 *    spans deliberately, so a fitment whose window runs a year past them may
 *    be describing another market's calendar rather than making a mistake.
 *    Failing the build on that would punish honest content for a gap in the
 *    data — the same reasoning VEH-03 rule 3 uses.
 * 3. **`production.to: null` is open-ended, never an error.** An open span is
 *    open at the cited source; reading it as an end year would invent one.
 *
 * ## Union, not intersection
 *
 * The window is measured against the *union* of the named generations' spans,
 * and the generations are the **expanded** ones (`gens: ["gen2"]` covers
 * `gen2-5`). A fitment naming two generations is satisfied by either, so
 * requiring every span to overlap would reject correct multi-generation
 * content.
 *
 * Every span this file asserts against is read off T201's merged taxonomy:
 * `gen1` 1982–1991, `gen2` 1991–1999, `gen2-5` 1997–1999, `gen3` 1999–2006,
 * `gen4` 2006–2021.
 *
 * refs specs/001-foundation (FIT-02, VEH-01)
 */
import { describe, expect, it } from "vitest";
import {
  FITMENT_ISSUE_CODES,
  buildTaxonomy,
  validateEntryFitments,
  type FitmentIssue,
} from "../../../src/lib/fitment/index.ts";
import {
  makeFitmentEntry,
  readAllContentEntries,
  readVehicleEntries,
} from "../../fixtures/fitment-fixtures.ts";

const realTaxonomy = () => buildTaxonomy(readVehicleEntries());

const codes = (issues: readonly FitmentIssue[]): string[] =>
  issues.map((issue) => issue.code);

const paths = (issues: readonly FitmentIssue[]): string[] =>
  issues.map((issue) => issue.path.map(String).join("."));

type YearWindow = { from?: number; to?: number };

const validate = (fitment: Record<string, unknown>) =>
  validateEntryFitments([makeFitmentEntry(fitment)], realTaxonomy());

/**
 * A generation whose production is open at the cited source. Built by hand
 * rather than added to the shared fixture: no real generation entry carries
 * `to: null` today, and the shared fixture belongs to T202.
 */
function openEndedTaxonomy() {
  return buildTaxonomy([
    {
      id: "gen4",
      kind: "generation",
      production: { from: 2006, to: null },
      marketNames: [{ market: "jdm", name: "Pajero" }],
    },
    { id: "jdm", kind: "market" },
  ]);
}

describe("the issue code exists and keeps FIT-02's two first (FIT-02)", () => {
  it("names three failure classes, the new one last", () => {
    // FIT-02's own two are unchanged and stay in FIT-02's order; the ruling
    // adds to the list rather than reordering it, so any consumer switching on
    // the first two keeps working.
    expect([...FITMENT_ISSUE_CODES]).toEqual([
      "unknown-id",
      "impossible-combination",
      "year-outside-production",
    ]);
  });
});

describe("a disjoint year window is a build error (T203 ruling e)", () => {
  it.each<[string, string[], YearWindow]>([
    ["entirely after gen3", ["gen3"], { from: 2010, to: 2012 }],
    ["entirely before gen3", ["gen3"], { from: 1990, to: 1995 }],
    ["one year short of gen3's first", ["gen3"], { to: 1998 }],
    ["one year past gen3's last", ["gen3"], { from: 2007 }],
    ["between gen1 and gen3, naming both", ["gen1", "gen3"], { to: 1981 }],
    ["after every generation", ["gen4"], { from: 2022 }],
  ])("%s is reported at `fitment.years`", (_label, gens, years) => {
    const issues = validate({ gens, years });

    expect(codes(issues)).toContain("year-outside-production");
    expect(paths(issues)).toContain("fitment.years");
    expect(issues[0]?.entryId).toBe("test-fitment-alpha");
  });

  it("names the window and the spans it missed", () => {
    // SCF-04's spirit: the error has to be actionable without opening the
    // taxonomy to look up what gen3's years actually are.
    const message = validate({
      gens: ["gen3"],
      years: { from: 2010, to: 2012 },
    })
      .map((issue) => issue.message)
      .join("\n");

    expect(message).toContain("2010");
    expect(message).toContain("gen3");
    expect(message).toContain("1999");
  });
});

describe("partial overlap is never an error (gaps-report material)", () => {
  it.each<[string, string[], YearWindow]>([
    [
      "a window straddling gen3's first year",
      ["gen3"],
      { from: 1996, to: 2002 },
    ],
    [
      "a window straddling gen3's last year",
      ["gen3"],
      { from: 2004, to: 2010 },
    ],
    ["a window touching gen3's first year exactly", ["gen3"], { to: 1999 }],
    ["a window touching gen3's last year exactly", ["gen3"], { from: 2006 }],
    ["a window wider than every span", ["gen1", "gen4"], { from: 1900 }],
    ["a single year inside the span", ["gen3"], { from: 2002, to: 2002 }],
  ])("%s resolves clean", (_label, gens, years) => {
    expect(validate({ gens, years })).toEqual([]);
  });

  it("measures against the union of the named generations, not each one", () => {
    // 1985 is inside gen1 and nowhere near gen3. A fitment naming both is
    // satisfied by either, so an intersection reading would reject correct
    // multi-generation content.
    expect(validate({ gens: ["gen1", "gen3"], years: { to: 1985 } })).toEqual(
      []
    );
  });

  it("counts a child generation's span through `parentGeneration`", () => {
    // gen2 is 1991–1999 and gen2-5 is 1997–1999, so this pair proves the
    // *expanded* set is what is measured: the window below is inside gen2-5,
    // which `gens: ["gen2"]` reaches only by expansion.
    expect(
      validate({ gens: ["gen2"], years: { from: 1998, to: 1998 } })
    ).toEqual([]);
    // …and the same window against a generation that really is disjoint still
    // fails, so the row above is not passing by accident.
    expect(
      codes(validate({ gens: ["gen4"], years: { from: 1998, to: 1998 } }))
    ).toContain("year-outside-production");
  });
});

describe("an open-ended production span is open (T203 ruling e)", () => {
  it.each<[string, YearWindow]>([
    ["a window far past the recorded start", { from: 2030, to: 2040 }],
    ["a window with no end of its own", { from: 2030 }],
  ])("%s never fails against `production.to: null`", (_label, years) => {
    const entry = makeFitmentEntry({ gens: ["gen4"], years });

    expect(validateEntryFitments([entry], openEndedTaxonomy())).toEqual([]);
  });

  it("still fails a window entirely before an open span starts", () => {
    // Open at the *end* only: nothing about `to: null` makes 1990 a year a
    // 2006-onwards generation existed in.
    const entry = makeFitmentEntry({ gens: ["gen4"], years: { to: 1990 } });

    expect(codes(validateEntryFitments([entry], openEndedTaxonomy()))).toEqual([
      "year-outside-production",
    ]);
  });
});

describe("the check stays out of the way of the other two (FIT-02)", () => {
  it("does not fire on a fitment with no `years` at all", () => {
    expect(validate({ gens: ["gen3"] })).toEqual([]);
    expect(validate({ gens: ["gen3"], markets: ["us"] })).toEqual([]);
  });

  it("does not fire on an empty `years` object", () => {
    // Neither end stated is no window, not a window of zero width.
    expect(validate({ gens: ["gen3"], years: {} })).toEqual([]);
  });

  it("yields to `unknown-id` rather than piling a second failure on it", () => {
    // A window cannot be measured against a generation that does not exist,
    // and a derived second failure sends the author chasing a symptom.
    expect(codes(validate({ gens: ["gen9"], years: { from: 2010 } }))).toEqual([
      "unknown-id",
    ]);
  });

  it("real content resolves clean under the new code too", () => {
    // The positive control that matters: adding a third failure class must not
    // turn today's honest corpus red.
    const issues = validateEntryFitments(
      readAllContentEntries(),
      realTaxonomy()
    );

    expect(codes(issues)).not.toContain("year-outside-production");
    expect(issues).toEqual([]);
  });
});
