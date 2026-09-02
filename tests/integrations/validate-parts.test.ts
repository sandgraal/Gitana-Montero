/**
 * The parts build check, on a real corpus (PRT-02, PRT-03, SCF-04).
 *
 * `tests/lib/parts/parts-graph.test.ts` grades the rules; this grades the
 * thing SCF-04 actually asks for — that the build error **names the files**.
 * That half lives in `withFileIndex`, which the lib cannot see and which the
 * lib graders therefore cannot fail on. It is where PR #75's r3910083212 sat:
 * the index kept one file per id, so a `duplicate-entry-id` error — an error
 * that is *by definition* about two or more files — named exactly one of them,
 * as likely as not the correct one.
 *
 * `runPartsBuildCheck` takes a `contentRoot` for precisely this reason, so
 * these run the real hook body over a deliberately broken corpus written to a
 * temp directory rather than over `src/content/`.
 *
 * Part numbers are in the reserved `TEST-` namespace and ids are `test-`
 * prefixed, per `tests/fixtures/schema-fixtures.ts`' rule.
 *
 * refs specs/001-foundation (PRT-02, PRT-03, SCF-04)
 */
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runPartsBuildCheck } from "../../src/integrations/validate-parts.ts";

const roots: string[] = [];

afterEach(() => {
  while (roots.length > 0) {
    const root = roots.pop();
    if (root !== undefined) rmSync(root, { recursive: true, force: true });
  }
});

interface Fixture {
  /** File name under `parts/`, without the extension. */
  readonly file: string;
  readonly id: string;
  readonly oemNumber: string;
}

/** A content root holding exactly these parts entries. */
function corpusOf(fixtures: readonly Fixture[]): string {
  const root = mkdtempSync(path.join(tmpdir(), "t501-parts-"));
  roots.push(root);
  mkdirSync(path.join(root, "parts"), { recursive: true });

  for (const fixture of fixtures) {
    writeFileSync(
      path.join(root, "parts", `${fixture.file}.json`),
      JSON.stringify({
        id: fixture.id,
        fitment: { gens: ["gen3"] },
        oemNumber: fixture.oemNumber,
        system: "engine",
        confidence: "anecdotal",
        sources: [],
        prose: {
          en: { title: "TEST fixture", summary: "Synthetic T501 fixture." },
          es: { title: "PRUEBA", summary: "Ficha sintética de T501." },
        },
      })
    );
  }

  return root;
}

const logger = { info: () => {} };

/** The error `runPartsBuildCheck` throws for `fixtures`, or `null`. */
async function failureFor(fixtures: readonly Fixture[]): Promise<Error | null> {
  try {
    await runPartsBuildCheck({ logger }, corpusOf(fixtures));
    return null;
  } catch (error) {
    return error instanceof Error ? error : new Error(String(error));
  }
}

describe("the build error names every file involved (SCF-04)", () => {
  it("names all three files of a three-way OEM-number collision", async () => {
    const error = await failureFor([
      { file: "alpha", id: "test-parts-alpha", oemNumber: "TEST-A0001" },
      { file: "beta", id: "test-parts-beta", oemNumber: "TEST-A0001" },
      { file: "gamma", id: "test-parts-gamma", oemNumber: "TEST-A0001" },
    ]);

    expect(error).not.toBeNull();
    const message = error?.message ?? "";
    for (const file of ["alpha.json", "beta.json", "gamma.json"]) {
      expect(message, file).toContain(`src/content/parts/${file}`);
    }
  });

  it("names every file of a three-way entry-id collision, not just the first", async () => {
    // The r3910083212 regression: one id, three files, and the file index
    // could only remember one of them.
    const error = await failureFor([
      { file: "alpha", id: "test-parts-same", oemNumber: "TEST-A0001" },
      { file: "beta", id: "test-parts-same", oemNumber: "TEST-A0002" },
      { file: "gamma", id: "test-parts-same", oemNumber: "TEST-A0003" },
    ]);

    expect(error).not.toBeNull();
    const message = error?.message ?? "";
    expect(message).toContain("duplicate");
    for (const file of ["alpha.json", "beta.json", "gamma.json"]) {
      expect(message, file).toContain(`src/content/parts/${file}`);
    }
  });

  it("lists each file exactly once", async () => {
    const error = await failureFor([
      { file: "alpha", id: "test-parts-same", oemNumber: "TEST-A0001" },
      { file: "beta", id: "test-parts-same", oemNumber: "TEST-A0002" },
    ]);

    const message = error?.message ?? "";
    for (const file of ["alpha.json", "beta.json"]) {
      const occurrences = message.split(`src/content/parts/${file}`).length - 1;
      expect(occurrences, file).toBe(1);
    }
  });

  it("names the file behind a dangling supersession pointer", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "t501-parts-"));
    roots.push(root);
    mkdirSync(path.join(root, "parts"), { recursive: true });
    writeFileSync(
      path.join(root, "parts", "alpha.json"),
      JSON.stringify({
        id: "test-parts-alpha",
        fitment: { gens: ["gen3"] },
        oemNumber: "TEST-A0001",
        supersededBy: "test-parts-ghost",
        system: "engine",
        confidence: "anecdotal",
        sources: [],
        prose: {
          en: { title: "TEST fixture", summary: "Synthetic T501 fixture." },
          es: { title: "PRUEBA", summary: "Ficha sintética de T501." },
        },
      })
    );

    let thrown: Error | null = null;
    try {
      await runPartsBuildCheck({ logger }, root);
    } catch (error) {
      thrown = error instanceof Error ? error : new Error(String(error));
    }

    expect(thrown?.message).toContain("test-parts-ghost");
    expect(thrown?.message).toContain("src/content/parts/alpha.json");
  });

  it("passes a corpus whose ids and numbers are all distinct", async () => {
    // Positive control: the slug-coverage half fails these fixtures (they have
    // no ENTRY_SLUGS rows), so the *identity* half is proven clean by the
    // absence of any duplicate/dangling wording rather than by no throw.
    const error = await failureFor([
      { file: "alpha", id: "test-parts-alpha", oemNumber: "TEST-A0001" },
      { file: "beta", id: "test-parts-beta", oemNumber: "TEST-A0002" },
    ]);

    const message = error?.message ?? "";
    expect(message).not.toContain("claim OEM number");
    expect(message).not.toContain("declare `id:");
  });
});
