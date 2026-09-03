/**
 * The mods graph (MOD-02) — the questions one entry cannot answer about
 * itself.
 *
 * `src/schemas/mods.test.ts` grades what a single entry can decide. This file
 * grades resolution across a corpus: does a typed reference name something
 * real, does it name it in the collection it claims, and does the requirement
 * graph terminate.
 *
 * ## The one that needed an algorithm, not a walk
 *
 * `src/lib/parts/index.ts` finds supersession loops by walking pointers, which
 * is complete there because `supersededBy` is a *single* edge. `requires` is a
 * list, and the first draft of this module copied the walk — following only
 * `requiredModIds[0]` at each hop. That misses `a → [b]`, `b → [c, a]`: the
 * walk from `a` goes down `c` and never sees the loop back to `a`, and the
 * walk from `b` finds it but attributes it to a node that is not the lowest
 * id, so it is discarded. The "requirement cycle behind a second edge" case
 * below is that corpus, and it is the reason the module uses an SCC pass.
 *
 * Ids are `test-`-prefixed per `tests/fixtures/schema-fixtures.ts`' rule.
 *
 * refs specs/001-foundation (MOD-01, MOD-02, SCF-04)
 */
import { describe, expect, it } from "vitest";
import {
  assertModsResolve,
  findModIssues,
  readMods,
  readReferencable,
  resolveRequirements,
  ModsResolutionError,
  type ModIssue,
} from "../../../src/lib/mods/index.ts";

interface ModFixture {
  readonly id: string;
  readonly requires?: readonly { collection: string; id: string }[];
  readonly affects?: readonly {
    id: string;
    system: string;
    impact: string;
    ref?: { collection: string; id: string };
  }[];
}

/** A corpus of mods entries, as `readMods` receives them. */
function corpus(fixtures: readonly ModFixture[]): ReturnType<typeof readMods> {
  return readMods(
    fixtures.map((fixture) => ({
      id: fixture.id,
      requires: fixture.requires ?? [],
      affects: fixture.affects ?? [],
    }))
  );
}

/** The id sets references resolve against. */
function known(
  mods: readonly string[] = [],
  parts: readonly string[] = []
): ReturnType<typeof readReferencable> {
  return readReferencable([
    ...mods.map((id) => ({ collection: "mods", id })),
    ...parts.map((id) => ({ collection: "parts", id })),
  ]);
}

function codes(issues: readonly ModIssue[]): string[] {
  return issues.map((issue) => issue.code);
}

/* -------------------------------------------------------------------------
 * Reading the corpus
 * ---------------------------------------------------------------------- */

describe("readMods", () => {
  it("skips an entry with no id rather than reporting it twice", () => {
    // The schema already rejects it, by field.
    expect(readMods([{ requires: [] }, { id: "test-a" }])).toHaveLength(1);
  });

  it("reads references from both `requires` and `affects[].ref`", () => {
    const [mod] = corpus([
      {
        id: "test-a",
        requires: [{ collection: "parts", id: "test-part" }],
        affects: [
          {
            id: "row",
            system: "brakes",
            impact: "breaks",
            ref: { collection: "mods", id: "test-b" },
          },
        ],
      },
    ]);
    expect(mod?.references.map((reference) => reference.field)).toEqual([
      "requires[0]",
      "affects[0].ref",
    ]);
  });

  it("counts only mod-targeted requirements as cycle edges", () => {
    const [mod] = corpus([
      {
        id: "test-a",
        requires: [
          { collection: "parts", id: "test-part" },
          { collection: "mods", id: "test-b" },
        ],
      },
    ]);
    expect(mod?.requiredModIds).toEqual(["test-b"]);
  });

  it("ignores an `affects` row with no `ref` at all", () => {
    const [mod] = corpus([
      {
        id: "test-a",
        affects: [{ id: "row", system: "body", impact: "degrades" }],
      },
    ]);
    expect(mod?.references).toEqual([]);
  });
});

describe("readReferencable", () => {
  it("gives every declared collection a set, even when nothing is in it", () => {
    const sets = known();
    expect(sets.get("mods")?.size).toBe(0);
    expect(sets.get("parts")?.size).toBe(0);
  });

  it("does not merge two collections' ids into one namespace", () => {
    const sets = known(["shared-id"], []);
    expect(sets.get("mods")?.has("shared-id")).toBe(true);
    expect(sets.get("parts")?.has("shared-id")).toBe(false);
  });
});

/* -------------------------------------------------------------------------
 * Resolution — MOD-02
 * ---------------------------------------------------------------------- */

describe("reference resolution (MOD-02)", () => {
  it("is silent on a corpus where everything resolves", () => {
    const mods = corpus([
      { id: "test-a", requires: [{ collection: "parts", id: "test-part" }] },
      { id: "test-b", requires: [{ collection: "mods", id: "test-a" }] },
    ]);
    expect(
      findModIssues(mods, known(["test-a", "test-b"], ["test-part"]))
    ).toEqual([]);
  });

  it("FAILS a requirement that names nothing anywhere", () => {
    const mods = corpus([
      { id: "test-a", requires: [{ collection: "parts", id: "test-ghost" }] },
    ]);
    const issues = findModIssues(mods, known(["test-a"]));
    expect(codes(issues)).toEqual(["dangling-reference"]);
    expect(issues[0]?.field).toBe("requires[0]");
  });

  it("FAILS an `affects[].ref` that names nothing, naming the row", () => {
    const mods = corpus([
      {
        id: "test-a",
        affects: [
          {
            id: "row",
            system: "brakes",
            impact: "breaks",
            ref: { collection: "mods", id: "test-ghost" },
          },
        ],
      },
    ]);
    const issues = findModIssues(mods, known(["test-a"]));
    expect(codes(issues)).toEqual(["dangling-reference"]);
    expect(issues[0]?.field).toBe("affects[0].ref");
  });

  it("distinguishes the wrong collection from a missing entry", () => {
    // The whole point of the discriminator: `test-part` exists, but as a part.
    const mods = corpus([
      { id: "test-a", requires: [{ collection: "mods", id: "test-part" }] },
    ]);
    const issues = findModIssues(mods, known(["test-a"], ["test-part"]));
    expect(codes(issues)).toEqual(["reference-wrong-collection"]);
    expect(issues[0]?.message).toContain("`parts`");
    expect(issues[0]?.relatedEntryIds).toEqual(["test-part"]);
  });

  it("resolves one id existing in both collections against the named one", () => {
    const mods = corpus([
      { id: "test-a", requires: [{ collection: "parts", id: "shared" }] },
    ]);
    expect(findModIssues(mods, known(["shared"], ["shared"]))).toEqual([]);
  });

  it("reports every unresolved reference, not just the first", () => {
    const mods = corpus([
      {
        id: "test-a",
        requires: [
          { collection: "parts", id: "test-ghost-one" },
          { collection: "mods", id: "test-ghost-two" },
        ],
      },
    ]);
    expect(findModIssues(mods, known(["test-a"]))).toHaveLength(2);
  });

  it("reports a duplicate entry id and stops there", () => {
    // Staging: while two entries share an id, "does this pointer resolve" has
    // two answers, so the derived failures are suppressed.
    const mods = corpus([
      { id: "test-a", requires: [{ collection: "mods", id: "test-ghost" }] },
      { id: "test-a" },
    ]);
    const issues = findModIssues(mods, known(["test-a"]));
    expect(codes(issues)).toEqual(["duplicate-entry-id"]);
  });
});

/* -------------------------------------------------------------------------
 * Requirement cycles
 * ---------------------------------------------------------------------- */

describe("requirement cycles (MOD-02)", () => {
  it("is silent on a chain that terminates", () => {
    const mods = corpus([
      { id: "test-a", requires: [{ collection: "mods", id: "test-b" }] },
      { id: "test-b", requires: [{ collection: "mods", id: "test-c" }] },
      { id: "test-c" },
    ]);
    expect(findModIssues(mods, known(["test-a", "test-b", "test-c"]))).toEqual(
      []
    );
  });

  it("is silent on a diamond — two paths to one prerequisite is not a loop", () => {
    const mods = corpus([
      {
        id: "test-a",
        requires: [
          { collection: "mods", id: "test-b" },
          { collection: "mods", id: "test-c" },
        ],
      },
      { id: "test-b", requires: [{ collection: "mods", id: "test-d" }] },
      { id: "test-c", requires: [{ collection: "mods", id: "test-d" }] },
      { id: "test-d" },
    ]);
    expect(
      findModIssues(mods, known(["test-a", "test-b", "test-c", "test-d"]))
    ).toEqual([]);
  });

  it("FAILS a two-node loop, once, at the lower id", () => {
    const mods = corpus([
      { id: "test-b", requires: [{ collection: "mods", id: "test-a" }] },
      { id: "test-a", requires: [{ collection: "mods", id: "test-b" }] },
    ]);
    const issues = findModIssues(mods, known(["test-a", "test-b"]));
    expect(codes(issues)).toEqual(["requirement-cycle"]);
    expect(issues[0]?.entryId).toBe("test-a");
    expect(issues[0]?.relatedEntryIds).toEqual(["test-b"]);
  });

  it("FAILS a three-node loop exactly once, not once per member", () => {
    const mods = corpus([
      { id: "test-a", requires: [{ collection: "mods", id: "test-b" }] },
      { id: "test-b", requires: [{ collection: "mods", id: "test-c" }] },
      { id: "test-c", requires: [{ collection: "mods", id: "test-a" }] },
    ]);
    const issues = findModIssues(mods, known(["test-a", "test-b", "test-c"]));
    expect(issues).toHaveLength(1);
    expect(issues[0]?.message).toContain("`test-a` → `test-b` → `test-c`");
  });

  it("FAILS a cycle reachable only behind a *second* requirement edge", () => {
    /*
     * The corpus a single-pointer walk misses, and the reason this module
     * runs an SCC pass rather than copying `src/lib/parts/index.ts`' walk:
     * `test-b`'s loop back to `test-a` is its *second* edge, so a walk that
     * follows only the first goes down `test-c` and terminates cleanly.
     *
     * With the walk, this corpus reported nothing. It has to be red.
     */
    const mods = corpus([
      { id: "test-a", requires: [{ collection: "mods", id: "test-b" }] },
      {
        id: "test-b",
        requires: [
          { collection: "mods", id: "test-c" },
          { collection: "mods", id: "test-a" },
        ],
      },
      { id: "test-c" },
    ]);
    const issues = findModIssues(mods, known(["test-a", "test-b", "test-c"]));
    expect(codes(issues)).toEqual(["requirement-cycle"]);
    expect(issues[0]?.entryId).toBe("test-a");
    expect(issues[0]?.relatedEntryIds).toEqual(["test-b"]);
  });

  it("FAILS a self-requirement at the corpus layer too, not only in the schema", () => {
    const mods = corpus([
      { id: "test-a", requires: [{ collection: "mods", id: "test-a" }] },
    ]);
    expect(codes(findModIssues(mods, known(["test-a"])))).toEqual([
      "requirement-cycle",
    ]);
  });

  it("reports two independent loops as two issues, in id order", () => {
    const mods = corpus([
      { id: "test-a", requires: [{ collection: "mods", id: "test-b" }] },
      { id: "test-b", requires: [{ collection: "mods", id: "test-a" }] },
      { id: "test-x", requires: [{ collection: "mods", id: "test-y" }] },
      { id: "test-y", requires: [{ collection: "mods", id: "test-x" }] },
    ]);
    const issues = findModIssues(
      mods,
      known(["test-a", "test-b", "test-x", "test-y"])
    );
    expect(issues.map((issue) => issue.entryId)).toEqual(["test-a", "test-x"]);
  });

  it("does not treat a mutual `affects` pair as a cycle", () => {
    // Two mods that each degrade the other is an honest pair of sentences.
    const mods = corpus([
      {
        id: "test-a",
        affects: [
          {
            id: "row",
            system: "body",
            impact: "degrades",
            ref: { collection: "mods", id: "test-b" },
          },
        ],
      },
      {
        id: "test-b",
        affects: [
          {
            id: "row",
            system: "body",
            impact: "degrades",
            ref: { collection: "mods", id: "test-a" },
          },
        ],
      },
    ]);
    expect(findModIssues(mods, known(["test-a", "test-b"]))).toEqual([]);
  });

  it("terminates on a cycle whose members also point outside it", () => {
    const mods = corpus([
      {
        id: "test-a",
        requires: [
          { collection: "mods", id: "test-b" },
          { collection: "mods", id: "test-z" },
        ],
      },
      { id: "test-b", requires: [{ collection: "mods", id: "test-a" }] },
      { id: "test-z" },
    ]);
    const issues = findModIssues(mods, known(["test-a", "test-b", "test-z"]));
    expect(codes(issues)).toEqual(["requirement-cycle"]);
  });
});

/* -------------------------------------------------------------------------
 * The throw, and what a page reads
 * ---------------------------------------------------------------------- */

describe("assertModsResolve", () => {
  it("stays silent on a clean corpus", () => {
    expect(() =>
      assertModsResolve(corpus([{ id: "test-a" }]), known(["test-a"]))
    ).not.toThrow();
  });

  it("throws a typed error carrying every issue", () => {
    const mods = corpus([
      { id: "test-a", requires: [{ collection: "mods", id: "test-ghost" }] },
    ]);
    try {
      assertModsResolve(mods, known(["test-a"]));
      throw new Error("expected assertModsResolve to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(ModsResolutionError);
      expect((error as ModsResolutionError).issues).toHaveLength(1);
    }
  });
});

describe("resolveRequirements", () => {
  it("keeps the entry's own order rather than sorting", () => {
    const rows = resolveRequirements(
      [
        { collection: "parts", id: "test-z" },
        { collection: "mods", id: "test-a" },
      ],
      known(["test-a"], ["test-z"])
    );
    expect(rows.map((row) => row.id)).toEqual(["test-z", "test-a"]);
  });

  it("marks an unresolved row rather than dropping it (a failure is not a zero)", () => {
    const rows = resolveRequirements(
      [{ collection: "parts", id: "test-ghost" }],
      known()
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.resolved).toBe(false);
  });

  it("marks a row resolved only against the collection it names", () => {
    const rows = resolveRequirements(
      [{ collection: "mods", id: "test-part" }],
      known([], ["test-part"])
    );
    expect(rows[0]?.resolved).toBe(false);
  });

  it("skips a row naming a collection outside the closed vocabulary", () => {
    expect(
      resolveRequirements(
        [{ collection: "procedures", id: "test-a" }],
        known(["test-a"])
      )
    ).toEqual([]);
  });
});
