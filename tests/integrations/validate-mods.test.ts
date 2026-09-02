/**
 * The mods build check, on a real corpus (MOD-02, I18N-05, SCF-04).
 *
 * `tests/lib/mods/mods-graph.test.ts` grades the rules; this grades the two
 * things only the build can do:
 *
 * 1. **The error names the files** (SCF-04). That half lives in
 *    `withFileIndex`, which the lib cannot see and which the lib graders
 *    therefore cannot fail on. It matters most for the
 *    `reference-wrong-collection` case, where the file the author needs is in
 *    a *different collection* from the entry the issue is reported against.
 * 2. **MOD-02's "the build resolves" is true of the actual build**, not of a
 *    function nobody calls. `runModsBuildCheck` takes a `contentRoot` so these
 *    run the real hook body over a deliberately broken corpus written to a
 *    temp directory rather than over `src/content/`.
 *
 * Ids are `test-`-prefixed per `tests/fixtures/schema-fixtures.ts`' rule.
 *
 * refs specs/001-foundation (MOD-01, MOD-02, I18N-05, SCF-04)
 */
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runModsBuildCheck } from "../../src/integrations/validate-mods.ts";

/**
 * The slug registry, mocked so these fixtures are not required to keep
 * `src/i18n/entry-slugs.ts` in sync. One test deliberately drops a row to
 * grade the coverage half.
 */
let slugRows: readonly string[] = [];

vi.mock("../../src/i18n/entry-slugs.ts", () => ({
  slugRegistryIds: (collection: string) =>
    collection === "mods" ? slugRows : [],
}));

const roots: string[] = [];

afterEach(() => {
  slugRows = [];
  while (roots.length > 0) {
    const root = roots.pop();
    if (root !== undefined) rmSync(root, { recursive: true, force: true });
  }
});

interface ModFixture {
  /** File name under `mods/`, without the extension. */
  readonly file: string;
  readonly id: string;
  readonly requires?: readonly { collection: string; id: string }[];
}

interface PartFixture {
  readonly file: string;
  readonly id: string;
}

function entryBody(id: string, extra: Record<string, unknown>) {
  return JSON.stringify({
    id,
    fitment: { gens: ["gen3"] },
    system: "body",
    confidence: "anecdotal",
    sources: [],
    prose: {
      en: { title: "TEST fixture", summary: "Synthetic T601 fixture." },
      es: { title: "Entrada TEST", summary: "Entrada sintética de T601." },
    },
    ...extra,
  });
}

/** A content root holding these mods (and optionally these parts). */
function corpusOf(
  mods: readonly ModFixture[],
  parts: readonly PartFixture[] = []
): string {
  const root = mkdtempSync(path.join(tmpdir(), "t601-mods-"));
  roots.push(root);
  mkdirSync(path.join(root, "mods"), { recursive: true });
  mkdirSync(path.join(root, "parts"), { recursive: true });

  for (const mod of mods) {
    writeFileSync(
      path.join(root, "mods", `${mod.file}.json`),
      entryBody(mod.id, {
        cost: { from: "moderate" },
        difficulty: 2,
        requires: mod.requires ?? [],
        affects: [],
      })
    );
  }

  for (const part of parts) {
    writeFileSync(
      path.join(root, "parts", `${part.file}.json`),
      entryBody(part.id, { oemNumber: "TEST-M0001" })
    );
  }

  // Every mods entry has a slug row unless a test says otherwise.
  slugRows = mods.map((mod) => mod.id);
  return root;
}

const logger = { info: () => {} };

async function runOver(root: string): Promise<Error | null> {
  try {
    await runModsBuildCheck({ logger }, root);
    return null;
  } catch (error) {
    return error instanceof Error ? error : new Error(String(error));
  }
}

describe("runModsBuildCheck", () => {
  it("passes a corpus whose references all resolve", async () => {
    const root = corpusOf(
      [
        {
          file: "alpha",
          id: "test-alpha",
          requires: [{ collection: "parts", id: "test-widget" }],
        },
        { file: "beta", id: "test-beta" },
      ],
      [{ file: "widget", id: "test-widget" }]
    );
    expect(await runOver(root)).toBeNull();
  });

  it("passes an empty corpus — zero references all resolve", async () => {
    expect(await runOver(corpusOf([]))).toBeNull();
  });

  it("FAILS the build on a requirement that names nothing", async () => {
    const root = corpusOf([
      {
        file: "alpha",
        id: "test-alpha",
        requires: [{ collection: "parts", id: "test-ghost" }],
      },
    ]);
    const error = await runOver(root);
    expect(error?.message).toContain("test-ghost");
    expect(error?.message).toContain("MOD-02");
  });

  it("names the file of the entry that carries the bad reference (SCF-04)", async () => {
    const root = corpusOf([
      {
        file: "alpha",
        id: "test-alpha",
        requires: [{ collection: "mods", id: "test-ghost" }],
      },
    ]);
    expect(await runOver(root).then((error) => error?.message)).toContain(
      "mods/alpha.json"
    );
  });

  it("names BOTH files on a wrong-collection reference", async () => {
    /*
     * The case that most needs the file index and that the lib cannot
     * provide: `test-widget` exists as a *part*, and the file the author has
     * to open is in the other collection. Naming only the mods file would
     * send them to the file that is arguably correct.
     */
    const root = corpusOf(
      [
        {
          file: "alpha",
          id: "test-alpha",
          requires: [{ collection: "mods", id: "test-widget" }],
        },
      ],
      [{ file: "widget", id: "test-widget" }]
    );
    const message = (await runOver(root))?.message ?? "";
    expect(message).toContain("mods/alpha.json");
    expect(message).toContain("parts/widget.json");
  });

  it("names every file sharing a duplicated id, not just the first", async () => {
    const root = corpusOf([
      { file: "alpha-one", id: "test-alpha" },
      { file: "alpha-two", id: "test-alpha" },
    ]);
    const message = (await runOver(root))?.message ?? "";
    expect(message).toContain("mods/alpha-one.json");
    expect(message).toContain("mods/alpha-two.json");
  });

  it("FAILS the build on a requirement loop, naming every file in it", async () => {
    const root = corpusOf([
      {
        file: "alpha",
        id: "test-alpha",
        requires: [{ collection: "mods", id: "test-beta" }],
      },
      {
        file: "beta",
        id: "test-beta",
        requires: [{ collection: "mods", id: "test-alpha" }],
      },
    ]);
    const message = (await runOver(root))?.message ?? "";
    expect(message).toContain("loop");
    expect(message).toContain("mods/alpha.json");
    expect(message).toContain("mods/beta.json");
  });

  it("reports every problem in one build rather than only the first", async () => {
    const root = corpusOf([
      {
        file: "alpha",
        id: "test-alpha",
        requires: [
          { collection: "parts", id: "test-ghost-one" },
          { collection: "mods", id: "test-ghost-two" },
        ],
      },
    ]);
    expect((await runOver(root))?.message).toContain("2 mods problem(s)");
  });

  it("FAILS an entry with no slug row — a page nobody built (I18N-05)", async () => {
    const root = corpusOf([{ file: "alpha", id: "test-alpha" }]);
    slugRows = [];
    const message = (await runOver(root))?.message ?? "";
    expect(message).toContain("ENTRY_SLUGS.mods");
    expect(message).toContain("mods/alpha.json");
  });

  it("FAILS a slug row with no entry — a URL that renders nothing (I18N-05)", async () => {
    const root = corpusOf([{ file: "alpha", id: "test-alpha" }]);
    slugRows = ["test-alpha", "test-orphan"];
    expect((await runOver(root))?.message).toContain("test-orphan");
  });

  it("checks references before slugs, so one fix at a time", async () => {
    const root = corpusOf([
      {
        file: "alpha",
        id: "test-alpha",
        requires: [{ collection: "mods", id: "test-ghost" }],
      },
    ]);
    slugRows = [];
    const message = (await runOver(root))?.message ?? "";
    expect(message).toContain("test-ghost");
    expect(message).not.toContain("ENTRY_SLUGS.mods");
  });
});
