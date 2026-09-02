/**
 * "We could not resolve this chain" is not "this part has no history"
 * (T501 audit follow-up, F5).
 *
 * ## The doctrine
 *
 * `.claude/GRADER-PRINCIPLES.md`, "Unknown is not zero, and a failure is not
 * an empty result":
 *
 * > When a fetch, a query, or any operation that can fail returns nothing
 * > *because it failed*, that must be a structurally different value from a
 * > genuine empty or zero result — never coalesce a failure to `0`, `[]`,
 * > `{}`, or an empty `Map`.
 *
 * ## Where this codebase does it
 *
 * `supersessionChain` is careful and correct: it returns `null` for an
 * unknown id, a dangling pointer and a cycle — three "we cannot answer this"
 * cases, each structurally distinct from a real answer.
 *
 * `supersessionView` then throws that distinction away. `null` becomes
 * `NO_SUPERSESSION` — `{ show: false, rows: [], forked: false,
 * otherPredecessors: [] }` — an empty collection standing in for a failure,
 * which is the literal shape the doctrine names.
 *
 * It is worth being precise about *how* it is indistinguishable, because the
 * obvious reading is wrong. A genuinely standalone part does **not** produce
 * `NO_SUPERSESSION`: it produces `rows: [itself]`, `show: false`. So the two
 * values differ — and the difference is useless, because the only consumer
 * question is "is this the number to order", and `rows: []` answers it
 * *vacuously true* through the `.every(…)` both templates run. The failure
 * case is therefore not merely conflated with the empty case; it is more
 * confidently affirmative than the empty case, which is the worst available
 * default. Every downstream reader is told, in the confident voice, that this
 * part is the number to order:
 *
 *  · `[partSlug].astro` — `chainRows.every(…)` over `[]` is vacuously `true`,
 *    so `isCurrentNumber` is `true` and the page prints "Order this one".
 *  · `[partsSegment].astro` — `chain?.current ?? null` makes `superseded`
 *    `false`, so the card prints the green "Order this one" badge.
 *
 * On a page whose entire premise is that a reader takes the number to a parts
 * counter, "we could not work out whether this number was replaced" rendering
 * as "order this one" is not a cosmetic default — it is a wrong answer wearing
 * a confident badge. The page-level half of this is graded in
 * `tests/pages/parts-unknown-chain.render.test.ts`.
 *
 * ## Reachability
 *
 * `src/integrations/validate-parts.ts` fails the build on a dangling pointer
 * and on a cycle, and `entryRouteParams` only builds pages for ids in the slug
 * registry — so no *shipped* build reaches this today. It is defense-in-depth,
 * and it is graded anyway: the unsafe default is one loosened build guard away
 * from being live, and this exact bug shape has recurred three times in 002
 * (PR #68, T2-303's derived sheet, T2-303's F8) each time in a place somebody
 * had reasoned was unreachable.
 *
 * ## What a fix has to establish (shape-agnostic on purpose)
 *
 * These graders do not pin one spelling. They assert two properties: the
 * unresolvable cases must be *reported* as unresolvable, and the "is this the
 * number to order" answer derived from them must not come back a confident
 * `true`. `SupersessionView | null`, a `resolved: boolean` discriminant, or a
 * `status: "resolved" | "unresolved"` union all satisfy them; see
 * `isUnresolved` below and this branch's report for the recommended shape.
 *
 * refs specs/001-foundation (PRT-02), .claude/GRADER-PRINCIPLES.md
 */
import { describe, expect, it } from "vitest";
import {
  buildPartsIndex,
  supersessionChain,
  supersessionView,
  type PartIdentity,
  type PartsIndex,
  type SupersessionView,
} from "../../../src/lib/parts/index.ts";

function part(
  id: string,
  oemNumber: string,
  supersededBy: string | null = null
): PartIdentity {
  return { id, oemNumber, supersededBy, vendors: [] };
}

/** A part that genuinely has no history — the confident empty. */
const SOLO_INDEX = buildPartsIndex([part("test-parts-solo", "TEST-S0001")]);

/** A pointer to an entry nobody wrote — the build refuses this corpus. */
const DANGLING_INDEX = buildPartsIndex([
  part("test-parts-dangling", "TEST-D0001", "test-parts-nobody-wrote-this"),
]);

/** A two-node loop — likewise refused, and an infinite walk if rendered. */
const CYCLE_INDEX = buildPartsIndex([
  part("test-parts-loop-a", "TEST-C0001", "test-parts-loop-b"),
  part("test-parts-loop-b", "TEST-C0002", "test-parts-loop-a"),
]);

/* -------------------------------------------------------------------------
 * Positive controls first — everything below is only meaningful if the
 * resolved cases still resolve, and if `supersessionChain` really does
 * report the three unknown cases as `null`.
 * ---------------------------------------------------------------------- */

describe("the layer that already gets this right", () => {
  it("returns null for an unknown id", () => {
    expect(supersessionChain("test-parts-ghost", SOLO_INDEX)).toBeNull();
  });

  it("returns null for a dangling pointer", () => {
    expect(supersessionChain("test-parts-dangling", DANGLING_INDEX)).toBeNull();
  });

  it("returns null for a cycle", () => {
    expect(supersessionChain("test-parts-loop-a", CYCLE_INDEX)).toBeNull();
  });

  it("returns a real chain for a resolvable corpus", () => {
    const index = buildPartsIndex([
      part("test-parts-alpha", "TEST-A0001", "test-parts-beta"),
      part("test-parts-beta", "TEST-A0002"),
    ]);
    expect(supersessionChain("test-parts-alpha", index)?.chain).toHaveLength(2);
  });

  it("still gives a standalone part its own row and no section", () => {
    const view = supersessionView("test-parts-solo", SOLO_INDEX);
    expect(view.show).toBe(false);
    expect(view.forked).toBe(false);
    // Note the *one* row: a resolved standalone part is not an empty view.
    expect(view.rows.map((row) => row.part.id)).toEqual(["test-parts-solo"]);
    expect(view.rows[0]?.isCurrent).toBe(true);
  });

  it("still gives a real chain its rows", () => {
    const index = buildPartsIndex([
      part("test-parts-alpha", "TEST-A0001", "test-parts-beta"),
      part("test-parts-beta", "TEST-A0002"),
    ]);
    const view = supersessionView("test-parts-alpha", index);
    expect(view.show).toBe(true);
    expect(view.rows.map((row) => row.part.oemNumber)).toEqual([
      "TEST-A0001",
      "TEST-A0002",
    ]);
  });
});

/* -------------------------------------------------------------------------
 * The gap, half one (F5): the view carries no explicit "we could not answer"
 *
 * `isUnresolved` below accepts any of the reasonable fix shapes rather than
 * pinning one spelling. If a fix picks a discriminant this helper does not
 * know about, extending the helper — and only the helper — is the legitimate
 * edit, and it should be disclosed in the commit that makes it (the
 * grader-edit convention this repo already uses on T207/T208/T501).
 *
 * The recommended shape is the first branch: `SupersessionView | null`,
 * exactly the pattern `.claude/GRADER-PRINCIPLES.md` records as having
 * worked ("type the result as `T | null`"), and the one that needs no edit
 * here at all.
 * ---------------------------------------------------------------------- */

function isUnresolved(view: unknown): boolean {
  if (view === null || view === undefined) return true;
  if (typeof view !== "object") return false;
  const record = view as Record<string, unknown>;
  return (
    record["resolved"] === false ||
    record["status"] === "unresolved" ||
    record["chainKnown"] === false ||
    record["unresolved"] === true
  );
}

describe("an unresolvable chain says so (F5)", () => {
  it("a resolved standalone part is NOT flagged unresolved — the control", () => {
    expect(isUnresolved(supersessionView("test-parts-solo", SOLO_INDEX))).toBe(
      false
    );
  });

  it("a resolved two-link chain is NOT flagged unresolved — the control", () => {
    const index = buildPartsIndex([
      part("test-parts-alpha", "TEST-A0001", "test-parts-beta"),
      part("test-parts-beta", "TEST-A0002"),
    ]);
    expect(isUnresolved(supersessionView("test-parts-alpha", index))).toBe(
      false
    );
  });

  it.fails(
    "an unknown id is reported as unresolvable, not as an empty view",
    () => {
      expect(
        isUnresolved(supersessionView("test-parts-ghost", SOLO_INDEX))
      ).toBe(true);
    }
  );

  it.fails(
    "a dangling pointer is reported as unresolvable, not as an empty view",
    () => {
      expect(
        isUnresolved(supersessionView("test-parts-dangling", DANGLING_INDEX))
      ).toBe(true);
    }
  );

  it.fails("a cycle is reported as unresolvable, not as an empty view", () => {
    expect(
      isUnresolved(supersessionView("test-parts-loop-a", CYCLE_INDEX))
    ).toBe(true);
  });
});

/* -------------------------------------------------------------------------
 * The gap, half two (F5): the answer the templates actually compute
 *
 * `templateSaysCurrent` is `[partSlug].astro`'s own expression —
 * `chainRows.every((row) => !row.isCurrent || row.id === entryId)` — lifted
 * out of the template so it can be graded without a render. Over `rows: []`
 * it is vacuously `true`: a confident "order this one" derived from having
 * failed to look. This is the half that reaches a reader.
 * ---------------------------------------------------------------------- */

describe("`is this the number to order` is never answered by not looking", () => {
  /**
   * Deliberately tolerant of the *fixed* shapes as well as today's.
   *
   * An `it.fails` marker is only worth anything if the test it marks starts
   * passing once the defect is fixed — and a helper that read
   * `supersessionView(…).rows` unconditionally would throw a `TypeError`
   * against a `SupersessionView | null` return, which `it.fails` would score
   * as "still expected to fail" forever. So the unresolvable case is checked
   * first and answered `"unknown"`, which is exactly the third value the
   * templates are missing.
   */
  function templateSaysCurrent(
    id: string,
    index: PartsIndex
  ): boolean | "unknown" {
    const view: SupersessionView | null = supersessionView(id, index);
    if (view === null || isUnresolved(view)) return "unknown";
    return view.rows.every((row) => !row.isCurrent || row.part.id === id);
  }

  it("says `yes` for a part that really is the current number", () => {
    expect(templateSaysCurrent("test-parts-solo", SOLO_INDEX)).toBe(true);
  });

  it("says `no` for a part that really was replaced", () => {
    const index = buildPartsIndex([
      part("test-parts-alpha", "TEST-A0001", "test-parts-beta"),
      part("test-parts-beta", "TEST-A0002"),
    ]);
    expect(templateSaysCurrent("test-parts-alpha", index)).toBe(false);
  });

  it.fails(
    "does not answer `yes` for an id the index has never heard of",
    () => {
      expect(templateSaysCurrent("test-parts-ghost", SOLO_INDEX)).not.toBe(
        true
      );
    }
  );

  it.fails(
    "does not answer `yes` for a part whose successor nobody wrote",
    () => {
      expect(
        templateSaysCurrent("test-parts-dangling", DANGLING_INDEX)
      ).not.toBe(true);
    }
  );

  it.fails("does not answer `yes` for a part inside a loop", () => {
    expect(templateSaysCurrent("test-parts-loop-a", CYCLE_INDEX)).not.toBe(
      true
    );
  });
});
