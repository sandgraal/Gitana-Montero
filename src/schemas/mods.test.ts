/**
 * Implementation-side unit tests for the `mods` collection schema (T601).
 *
 * What this schema alone can decide, within one entry: is a typed reference
 * shaped like an entry id, are the consequence handles unique, does every
 * consequence carry its sentence in **both** locales, can a mod require
 * itself, and can an author demote a suspension mod out of the safety notice.
 *
 * Cross-entry questions — does the reference resolve, does it resolve in the
 * collection it names, does the requirement graph terminate — belong to
 * `src/lib/mods/` and are graded in `tests/lib/mods/mods-graph.test.ts`. The
 * "is this figure cited at all" gate is `check:citations` and is exercised
 * against a mods-shaped entry at the bottom of this file, per the T106-review
 * note carried on the T501 line ("numeric fields added here must come with
 * proof that check:citations fires on them uncited").
 *
 * Every fixture is synthetic in the same sense as
 * `tests/fixtures/schema-fixtures.ts`: `.invalid` URLs and `test-`-prefixed
 * ids. **Nothing here is a real modification anyone should copy.**
 *
 * refs specs/001-foundation (MOD-01, MOD-02)
 */
import { describe, expect, it } from "vitest";
import { issuePaths } from "../../tests/helpers/schema-outcome.ts";
import {
  MOD_IMPACTS,
  MOD_REFERENCE_COLLECTIONS,
  checkModsEntry,
  modReferenceKey,
  modsProse,
  modsSchema,
  modsShared,
} from "./mods";
import { defineEntrySchema } from "./entry";
// The plain-Node citation gate, called directly — the same import
// `tests/check-citations.test.ts` uses.
import { findCitationIssues } from "../../scripts/check-citations.mjs";

function source() {
  return {
    title: "TEST fixture source — not a real document",
    url: "https://example.invalid/t601/source",
    archiveUrl:
      "https://web.archive.org/web/20260101000000/" +
      "https://example.invalid/t601/source",
    accessed: "2026-09-02",
    kind: "forum",
  };
}

interface TestMod {
  [field: string]: unknown;
}

/** A minimal, valid mods entry. Overrides are shallow-merged. */
function makeMod(overrides: TestMod = {}): TestMod {
  return {
    id: "test-mods-alpha",
    fitment: { gens: ["gen3"] },
    system: "body",
    cost: { from: "moderate" },
    difficulty: 3,
    confidence: "community-consensus",
    sources: [source()],
    prose: {
      en: {
        title: "TEST fixture modification",
        summary: "Synthetic T601 fixture.",
        tradeoffs: "Synthetic T601 tradeoffs sentence.",
      },
      es: {
        title: "Modificación de prueba TEST",
        summary: "Entrada sintética de T601.",
        tradeoffs: "Frase sintética de contras de T601.",
      },
    },
    ...overrides,
  };
}

/** The issues `checkModsEntry` alone reports, without the base envelope. */
function refineIssues(entry: unknown): { path: string; message: string }[] {
  const collected: { path: string; message: string }[] = [];
  checkModsEntry(entry, {
    addIssue: (issue) =>
      collected.push({
        path: issue.path.map(String).join("."),
        message: issue.message,
      }),
  });
  return collected;
}

/* -------------------------------------------------------------------------
 * The envelope
 * ---------------------------------------------------------------------- */

describe("the base shape", () => {
  it("accepts a minimal, well-formed entry", () => {
    const outcome = modsSchema.safeParse(makeMod());
    expect(
      outcome.success ? [] : outcome.error.issues.map((i) => i.message)
    ).toEqual([]);
  });

  it("defaults `requires` and `affects` to empty rather than undefined", () => {
    const outcome = modsSchema.safeParse(makeMod());
    expect(outcome.success && outcome.data.requires).toEqual([]);
    expect(outcome.success && outcome.data.affects).toEqual([]);
  });

  it("rejects an unknown field rather than stripping it (SCF-04)", () => {
    expect(
      issuePaths(modsSchema.safeParse(makeMod({ liftHeightInches: 3 })))
    ).not.toEqual([]);
  });

  it("requires the bilingual tradeoffs sentence — MOD-01's own words", () => {
    const entry = makeMod();
    const prose = entry.prose as Record<string, Record<string, unknown>>;
    delete prose.es.tradeoffs;
    expect(issuePaths(modsSchema.safeParse(entry))).toContain(
      "prose.es.tradeoffs"
    );
  });

  it("treats a blank tradeoffs sentence as a missing one (I18N-06)", () => {
    const entry = makeMod();
    const prose = entry.prose as Record<string, Record<string, unknown>>;
    prose.en.tradeoffs = "   ";
    expect(issuePaths(modsSchema.safeParse(entry))).toContain(
      "prose.en.tradeoffs"
    );
  });
});

/* -------------------------------------------------------------------------
 * Typed references — MOD-02
 * ---------------------------------------------------------------------- */

describe("typed references (MOD-02)", () => {
  it("accepts a reference into each collection MOD-02 names", () => {
    for (const collection of MOD_REFERENCE_COLLECTIONS) {
      const outcome = modsSchema.safeParse(
        makeMod({ requires: [{ collection, id: "test-target" }] })
      );
      expect(outcome.success).toBe(true);
    }
  });

  it("rejects a reference into a collection MOD-02 does not name", () => {
    expect(
      issuePaths(
        modsSchema.safeParse(
          makeMod({
            requires: [{ collection: "procedures", id: "test-target" }],
          })
        )
      )
    ).toContain("requires.0.collection");
  });

  it("rejects a bare id with no collection — the discriminator is the point", () => {
    expect(
      issuePaths(
        modsSchema.safeParse(makeMod({ requires: [{ id: "test-target" }] }))
      )
    ).toContain("requires.0.collection");
  });

  it("rejects a part number written where an entry id belongs", () => {
    expect(
      issuePaths(
        modsSchema.safeParse(
          makeMod({ requires: [{ collection: "parts", id: "MR455009" }] })
        )
      )
    ).toContain("requires.0.id");
  });

  it("rejects a file path written where an entry id belongs", () => {
    expect(
      issuePaths(
        modsSchema.safeParse(
          makeMod({
            requires: [{ collection: "mods", id: "mods/test-target.json" }],
          })
        )
      )
    ).toContain("requires.0.id");
  });

  it("refuses a mod that requires itself", () => {
    const issues = refineIssues(
      makeMod({
        requires: [{ collection: "mods", id: "test-mods-alpha" }],
      })
    );
    expect(issues.map((issue) => issue.path)).toContain("requires.0");
  });

  it("allows a *part* with the same id as the entry — different collection", () => {
    // The discriminator's whole purpose: one id can legitimately name a mod
    // and the part that mod is a kit of.
    expect(
      refineIssues(
        makeMod({ requires: [{ collection: "parts", id: "test-mods-alpha" }] })
      )
    ).toEqual([]);
  });

  it("refuses the same prerequisite listed twice", () => {
    const issues = refineIssues(
      makeMod({
        requires: [
          { collection: "parts", id: "test-target" },
          { collection: "parts", id: "test-target" },
        ],
      })
    );
    expect(issues.map((issue) => issue.path)).toContain("requires.1");
  });

  it("does not confuse one id across two collections when de-duplicating", () => {
    expect(
      refineIssues(
        makeMod({
          requires: [
            { collection: "parts", id: "test-target" },
            { collection: "mods", id: "test-target" },
          ],
        })
      )
    ).toEqual([]);
  });

  it("keys a reference by collection *and* id", () => {
    expect(modReferenceKey({ collection: "mods", id: "a" })).not.toBe(
      modReferenceKey({ collection: "parts", id: "a" })
    );
  });
});

/* -------------------------------------------------------------------------
 * Consequences — MOD-01's "what it breaks or affects"
 * ---------------------------------------------------------------------- */

function affectsFixture(overrides: TestMod = {}): TestMod {
  const entry = makeMod({
    affects: [
      { id: "headlamp-aim", system: "electrical", impact: "needs-adjustment" },
    ],
    ...overrides,
  });
  const prose = entry.prose as Record<string, Record<string, unknown>>;
  prose.en.affectsNotes = { "headlamp-aim": "TEST consequence sentence." };
  prose.es.affectsNotes = { "headlamp-aim": "Frase de consecuencia TEST." };
  return entry;
}

describe("consequences (MOD-01)", () => {
  it("accepts a row whose note exists in both locales", () => {
    const outcome = modsSchema.safeParse(affectsFixture());
    expect(
      outcome.success ? [] : outcome.error.issues.map((i) => i.message)
    ).toEqual([]);
  });

  it("accepts every impact in the closed vocabulary", () => {
    for (const impact of MOD_IMPACTS) {
      const entry = affectsFixture();
      (entry.affects as Record<string, unknown>[])[0]!.impact = impact;
      expect(modsSchema.safeParse(entry).success).toBe(true);
    }
  });

  it("rejects an impact outside the vocabulary", () => {
    const entry = affectsFixture();
    (entry.affects as Record<string, unknown>[])[0]!.impact = "makes-it-worse";
    expect(issuePaths(modsSchema.safeParse(entry))).toContain(
      "affects.0.impact"
    );
  });

  it("REQUIRES the note in the locale that is missing it, naming that locale", () => {
    const entry = affectsFixture();
    const prose = entry.prose as Record<string, Record<string, unknown>>;
    delete (prose.es.affectsNotes as Record<string, unknown>)["headlamp-aim"];

    const issues = refineIssues(entry);
    expect(issues.map((issue) => issue.path)).toContain(
      "prose.es.affectsNotes.headlamp-aim"
    );
    expect(issues.map((issue) => issue.path)).not.toContain(
      "prose.en.affectsNotes.headlamp-aim"
    );
  });

  it("treats a whitespace-only note as no note at all", () => {
    const entry = affectsFixture();
    const prose = entry.prose as Record<string, Record<string, unknown>>;
    (prose.en.affectsNotes as Record<string, unknown>)["headlamp-aim"] = "   ";
    expect(refineIssues(entry).map((issue) => issue.path)).toContain(
      "prose.en.affectsNotes.headlamp-aim"
    );
  });

  it("reports a row with no notes at all in both locales, once each", () => {
    const entry = makeMod({
      affects: [{ id: "ride", system: "suspension", impact: "degrades" }],
    });
    const paths = refineIssues(entry).map((issue) => issue.path);
    expect(paths).toContain("prose.en.affectsNotes.ride");
    expect(paths).toContain("prose.es.affectsNotes.ride");
    expect(paths.filter((path) => path.endsWith(".ride"))).toHaveLength(2);
  });

  it("reports a note keyed to a row that does not exist", () => {
    const entry = affectsFixture();
    const prose = entry.prose as Record<string, Record<string, unknown>>;
    (prose.en.affectsNotes as Record<string, unknown>)["speedometer"] =
      "TEST orphan note.";
    expect(refineIssues(entry).map((issue) => issue.path)).toContain(
      "prose.en.affectsNotes.speedometer"
    );
  });

  it("refuses two consequences sharing one handle — the notes are keyed by it", () => {
    const entry = affectsFixture({
      affects: [
        {
          id: "headlamp-aim",
          system: "electrical",
          impact: "needs-adjustment",
        },
        { id: "headlamp-aim", system: "body", impact: "degrades" },
      ],
    });
    const prose = entry.prose as Record<string, Record<string, unknown>>;
    prose.en.affectsNotes = { "headlamp-aim": "TEST consequence sentence." };
    prose.es.affectsNotes = { "headlamp-aim": "Frase de consecuencia TEST." };

    expect(refineIssues(entry).map((issue) => issue.path)).toContain(
      "affects.1.id"
    );
  });

  it("refuses a consequence that points back at the entry itself", () => {
    const entry = affectsFixture();
    (entry.affects as Record<string, unknown>[])[0]!.ref = {
      collection: "mods",
      id: "test-mods-alpha",
    };
    expect(refineIssues(entry).map((issue) => issue.path)).toContain(
      "affects.0.ref"
    );
  });

  it("accepts a consequence pointing at another entry", () => {
    const entry = affectsFixture();
    (entry.affects as Record<string, unknown>[])[0]!.ref = {
      collection: "parts",
      id: "test-other",
    };
    expect(refineIssues(entry)).toEqual([]);
  });
});

/* -------------------------------------------------------------------------
 * Safety — the flag only ever promotes
 * ---------------------------------------------------------------------- */

describe("safety", () => {
  it("refuses `safetyCritical: false` on an already-critical system", () => {
    const issues = refineIssues(
      makeMod({ system: "suspension", safetyCritical: false })
    );
    expect(issues.map((issue) => issue.path)).toContain("safetyCritical");
  });

  it("allows `safetyCritical: true` on a system the list does not catch", () => {
    expect(
      modsSchema.safeParse(
        makeMod({ system: "electrical", safetyCritical: true })
      ).success
    ).toBe(true);
  });

  it("demands the flag when the subject names lifting and the system does not", () => {
    const entry = makeMod({ system: "body" });
    const prose = entry.prose as Record<string, Record<string, unknown>>;
    prose.en.title = "TEST roof lifting points";
    prose.es.title = "Puntos de apoyo TEST del techo";

    expect(refineIssues(entry).map((issue) => issue.path)).toContain(
      "safetyCritical"
    );
  });

  it("stays silent when the subject names lifting and the flag is set", () => {
    const entry = makeMod({ system: "body", safetyCritical: true });
    const prose = entry.prose as Record<string, Record<string, unknown>>;
    prose.en.title = "TEST roof lifting points";
    prose.es.title = "Puntos de apoyo TEST del techo";

    expect(refineIssues(entry)).toEqual([]);
  });

  it("does not demand the flag twice when the system already covers it", () => {
    const entry = makeMod({ system: "suspension" });
    const prose = entry.prose as Record<string, Record<string, unknown>>;
    prose.en.title = "TEST suspension lift";
    prose.es.title = "Levante de suspensión TEST";

    expect(refineIssues(entry)).toEqual([]);
  });
});

/* -------------------------------------------------------------------------
 * The data/prose split, and the citation gate
 * ---------------------------------------------------------------------- */

describe("the data/prose split (AGENTS.md)", () => {
  it("builds cleanly from the shapes this module actually ships", () => {
    expect(() => defineEntrySchema(modsShared, modsProse)).not.toThrow();
  });

  it("refuses the figure if anyone ever moves it into prose", () => {
    // The numeric-prose guard, probed with *this collection's own* figure:
    // `difficulty` is legal in shared data and a build-time throw in prose,
    // before any content is parsed.
    expect(() =>
      defineEntrySchema(modsShared, {
        ...modsProse,
        difficulty: modsShared.difficulty,
      })
    ).toThrow(/numbers are never translated/);
  });

  it("rejects a difficulty outside PRB-01's 1–5 scale", () => {
    for (const difficulty of [0, 6, 2.5]) {
      expect(
        issuePaths(modsSchema.safeParse(makeMod({ difficulty })))
      ).toContain("difficulty");
    }
  });

  it("rejects a cost range that reads backwards", () => {
    expect(
      issuePaths(
        modsSchema.safeParse(
          makeMod({ cost: { from: "significant", to: "minimal" } })
        )
      )
    ).toContain("cost.to");
  });

  /**
   * The T106-review note carried on the T501 line, discharged for this
   * collection: a numeric field added to shared data must come with proof
   * that `check:citations` fires on it when the entry cites nothing.
   */
  it("puts the figure where check:citations walks it, and fires when uncited", () => {
    const cited = findCitationIssues({
      collection: "mods",
      file: "mods/test-mods-alpha.json",
      data: makeMod(),
    });
    expect(cited).toEqual([]);

    const uncited = findCitationIssues({
      collection: "mods",
      file: "mods/test-mods-alpha.json",
      data: makeMod({ sources: [], confidence: "anecdotal" }),
    });
    expect(uncited.map((issue) => issue.field)).toContain("difficulty");
  });
});
