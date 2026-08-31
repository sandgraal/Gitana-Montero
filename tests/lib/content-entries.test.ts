/**
 * Graders for the shared content-entry loader (`scripts/lib/content-entries.mjs`)
 * every T105 check script builds on.
 *
 * refs specs/001-foundation (SCF-02, REF-02, I18N-07)
 */
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  CONFIDENCE_TIERS as CONFIDENCE_TIERS_MJS,
  DOCUMENTARY_TIERS,
  FACTORY_DOCUMENTED_KINDS as FACTORY_DOCUMENTED_KINDS_MJS,
  KIND_TIER_LEGACY_EXCEPTIONS,
  RESERVED_ENTRY_FIELDS as RESERVED_ENTRY_FIELDS_MJS,
  TIERS_REQUIRING_SOURCES,
  blankStringPaths,
  deriveAstroEntryId,
  formatPath,
  listCollectionNames,
  loadContentEntries,
  numericLeaves,
  readEntryData,
  stringLeaves,
} from "../../scripts/lib/content-entries.mjs";
import {
  CITATION_REQUIRED_TIERS,
  CONFIDENCE_TIERS,
  FACTORY_DOCUMENTED_KINDS,
  RESERVED_ENTRY_FIELDS,
  SOURCE_KINDS,
} from "../../src/schemas/entry.ts";

const created: string[] = [];

afterEach(async () => {
  await Promise.all(
    created.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))
  );
});

async function makeContentRoot(files: Record<string, string>): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), "content-entries-"));
  created.push(dir);
  for (const [relative, contents] of Object.entries(files)) {
    const full = path.join(dir, relative);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, contents, "utf8");
  }
  return dir;
}

describe("RESERVED_ENTRY_FIELDS", () => {
  it("stays in sync with src/schemas/entry.ts's export", () => {
    // scripts/lib/content-entries.mjs cannot import entry.ts directly (see
    // its docstring on this constant) — this is the seam that keeps the two
    // lists from drifting apart silently.
    expect([...RESERVED_ENTRY_FIELDS_MJS].sort()).toEqual(
      [...RESERVED_ENTRY_FIELDS].sort()
    );
  });
});

describe("CONFIDENCE_TIERS", () => {
  it("stays in sync with src/schemas/entry.ts's export, order included", () => {
    // Order is the contract here (same as the real export it mirrors), so
    // this is not a sorted-set comparison like RESERVED_ENTRY_FIELDS above.
    expect([...CONFIDENCE_TIERS_MJS]).toEqual([...CONFIDENCE_TIERS]);
  });
});

describe("TIERS_REQUIRING_SOURCES", () => {
  it("is every tier stronger than first-hand", () => {
    expect([...TIERS_REQUIRING_SOURCES]).toEqual([
      "fsm-confirmed",
      "tsb",
      "community-consensus",
    ]);
  });

  it("excludes first-hand and anecdotal", () => {
    expect(TIERS_REQUIRING_SOURCES).not.toContain("first-hand");
    expect(TIERS_REQUIRING_SOURCES).not.toContain("anecdotal");
  });
});

describe("the kind→tier coherence rule's constants (T207)", () => {
  it("DOCUMENTARY_TIERS mirrors CITATION_REQUIRED_TIERS", () => {
    // Same tier set, two questions: the schema asks whether a document is
    // cited at all, check:citations asks whether it is the right kind of
    // document. If they drift, one of those questions starts being asked
    // about a tier the other has never heard of.
    expect([...DOCUMENTARY_TIERS]).toEqual([...CITATION_REQUIRED_TIERS]);
  });

  it("FACTORY_DOCUMENTED_KINDS mirrors src/schemas/entry.ts's export", () => {
    expect([...FACTORY_DOCUMENTED_KINDS_MJS]).toEqual([
      ...FACTORY_DOCUMENTED_KINDS,
    ]);
  });

  it("every documentary kind is a real source kind", () => {
    for (const kind of FACTORY_DOCUMENTED_KINDS_MJS) {
      expect(SOURCE_KINDS).toContain(kind);
    }
  });

  it("excludes every kind that is somebody reporting a document", () => {
    for (const kind of [
      "forum",
      "video",
      "vendor",
      "reference",
      "first-hand",
    ]) {
      expect(FACTORY_DOCUMENTED_KINDS_MJS).not.toContain(kind);
    }
  });

  it("holds no duplicate legacy exceptions", () => {
    // A path listed twice would survive one deletion and keep suppressing.
    expect(new Set(KIND_TIER_LEGACY_EXCEPTIONS).size).toBe(
      KIND_TIER_LEGACY_EXCEPTIONS.length
    );
  });

  it("lists legacy exceptions as repo-relative POSIX content paths", () => {
    // The register is matched against `loadContentEntries`' `file` field; an
    // absolute or backslashed path would silently never match and the
    // exception would do nothing (while the staleness check flagged it).
    for (const file of KIND_TIER_LEGACY_EXCEPTIONS) {
      expect(file.startsWith("src/content/")).toBe(true);
      expect(file).not.toContain("\\");
    }
  });
});

describe("deriveAstroEntryId", () => {
  it("strips the extension and slugifies each path segment", () => {
    expect(deriveAstroEntryId("g3-tcase-chain-stretch.md")).toBe(
      "g3-tcase-chain-stretch"
    );
  });

  it("slugifies segments the way github-slugger does (spaces, case)", () => {
    expect(deriveAstroEntryId("Some Entry.md")).toBe("some-entry");
  });

  it("joins nested directories with /", () => {
    expect(deriveAstroEntryId("sub/dir/file.json")).toBe("sub/dir/file");
  });

  it("drops a trailing /index segment", () => {
    expect(deriveAstroEntryId("g3-tcase/index.md")).toBe("g3-tcase");
  });
});

describe("readEntryData", () => {
  it("parses YAML frontmatter out of a Markdown file", async () => {
    const dir = await makeContentRoot({
      "x.md": "---\nid: alpha\nfitment:\n  gens: [gen3]\n---\nbody text\n",
    });
    const data = (await readEntryData(path.join(dir, "x.md"))) as Record<
      string,
      unknown
    >;
    expect(data.id).toBe("alpha");
    expect(data.fitment).toEqual({ gens: ["gen3"] });
  });

  it("returns {} for a Markdown file with no frontmatter", async () => {
    const dir = await makeContentRoot({ "x.md": "just body text\n" });
    expect(await readEntryData(path.join(dir, "x.md"))).toEqual({});
  });

  it("parses a .json entry", async () => {
    const dir = await makeContentRoot({ "x.json": '{"id":"alpha"}' });
    expect(await readEntryData(path.join(dir, "x.json"))).toEqual({
      id: "alpha",
    });
  });

  it("parses a .yaml entry", async () => {
    const dir = await makeContentRoot({ "x.yaml": "id: alpha\n" });
    expect(await readEntryData(path.join(dir, "x.yaml"))).toEqual({
      id: "alpha",
    });
  });
});

describe("listCollectionNames / loadContentEntries", () => {
  it("lists every subdirectory of the content root as a collection", async () => {
    const dir = await makeContentRoot({
      "vehicles/.gitkeep": "",
      "problems/.gitkeep": "",
    });
    expect(await listCollectionNames(dir)).toEqual(["problems", "vehicles"]);
  });

  it("returns [] for a content root that does not exist", async () => {
    expect(
      await listCollectionNames(path.join(tmpdir(), "definitely-not-there"))
    ).toEqual([]);
  });

  it("skips files that do not match the entry extensions, and drafts", async () => {
    const dir = await makeContentRoot({
      "problems/.gitkeep": "",
      "problems/notes.txt": "not an entry",
      "problems/_draft.md": "---\nid: draft\n---\n",
      "problems/real.md": "---\nid: real\n---\n",
    });
    const entries = await loadContentEntries(dir);
    expect(entries.map((e) => e.relativePath)).toEqual(["real.md"]);
  });

  it("walks nested directories and reports repo-root-relative file paths", async () => {
    const dir = await makeContentRoot({
      "problems/sub/nested.md": "---\nid: nested\n---\n",
    });
    const entries = await loadContentEntries(dir);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.collection).toBe("problems");
    expect(entries[0]?.relativePath).toBe("sub/nested.md");
    expect((entries[0]?.data as { id: string }).id).toBe("nested");
  });
});

describe("blankStringPaths", () => {
  it("finds a blank string nested inside an object", () => {
    expect(blankStringPaths({ title: "ok", summary: "   " })).toEqual([
      ["summary"],
    ]);
  });

  it("finds nothing when every string is non-blank", () => {
    expect(blankStringPaths({ title: "ok", nested: { a: "fine" } })).toEqual(
      []
    );
  });

  it("walks arrays with numeric path segments", () => {
    expect(blankStringPaths({ list: ["ok", ""] })).toEqual([["list", 1]]);
  });
});

describe("stringLeaves / numericLeaves / formatPath", () => {
  it("collects every string leaf with its path", () => {
    expect(stringLeaves({ a: "x", b: { c: "y" } })).toEqual([
      { path: ["a"], value: "x" },
      { path: ["b", "c"], value: "y" },
    ]);
  });

  it("collects every numeric leaf with its path", () => {
    expect(numericLeaves({ torqueNm: 88, sub: { psi: 32 }, s: "no" })).toEqual([
      { path: ["torqueNm"], value: 88 },
      { path: ["sub", "psi"], value: 32 },
    ]);
  });

  it("formats a mixed path with array indices bracketed", () => {
    expect(formatPath(["sources", 0, "url"])).toBe("sources[0].url");
  });
});
