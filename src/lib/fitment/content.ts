/**
 * Reading `src/content/` off disk for the build-time fitment check (FIT-02).
 *
 * ## Why not `astro:content`
 *
 * FIT-02 is a check *about the whole corpus* — "does every entry's fitment
 * resolve against the taxonomy" — and it has to run before pages are rendered,
 * inside an Astro integration hook. `getCollection()` is not available there,
 * and a check that only ran once a page happened to query a collection would
 * be a check that silently stops covering an entry the day nothing links to
 * it. So this module re-derives the same file set `src/content.config.ts`'s
 * `glob()` loader would, from the same pattern.
 *
 * It is the TypeScript twin of `scripts/lib/content-entries.mjs`, which does
 * the same job for the plain-Node `check:*` scripts, and it deliberately
 * borrows that module's rules — same extensions, same `_`-prefixed draft
 * exclusion — so the two never disagree about what "an entry" is. The two
 * cannot be one module: those scripts run under bare `node` with no bundler
 * and cannot import `.ts` files that use extensionless specifiers.
 *
 * The resolver's *input* is entry objects, and nothing here interprets them —
 * `src/lib/fitment/index.ts` is still the only code that reads a fitment
 * (FIT-01).
 *
 * refs specs/001-foundation (FIT-01, FIT-02, SCF-01)
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** `src/content/`, resolved from this module rather than from `process.cwd()`. */
export const CONTENT_ROOT = fileURLToPath(
  new URL("../../content/", import.meta.url)
);

/** The collection whose entries *are* the taxonomy (VEH-01). */
export const TAXONOMY_COLLECTION = "vehicles";

/** Same extensions `ENTRY_PATTERN` in `src/content.config.ts` loads. */
const ENTRY_EXTENSIONS = new Set([".json", ".yaml", ".yml", ".md", ".mdx"]);

/** One entry as read from disk, with enough path to name the file (SCF-04). */
export interface LoadedEntry {
  readonly collection: string;
  /** Repo-relative POSIX path, for error messages. */
  readonly file: string;
  readonly data: unknown;
}

export interface LoadedContent {
  /** Every entry in every collection — everything that declares a fitment. */
  readonly entries: readonly LoadedEntry[];
  /** The `vehicles` subset, which is what `buildTaxonomy` is built from. */
  readonly taxonomyEntries: readonly unknown[];
}

/** Mirrors `ENTRY_PATTERN`'s `[^_]*`: `_draft.json` is notes, not an entry. */
function isDraft(name: string): boolean {
  return name.startsWith("_");
}

function* walk(dir: string, prefix: string): Generator<[string, string]> {
  for (const item of readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
    a.name < b.name ? -1 : a.name > b.name ? 1 : 0
  )) {
    if (isDraft(item.name)) continue;
    const relative = prefix === "" ? item.name : `${prefix}/${item.name}`;
    if (item.isDirectory()) {
      yield* walk(path.join(dir, item.name), relative);
      continue;
    }
    if (!item.isFile()) continue;
    if (!ENTRY_EXTENSIONS.has(path.extname(item.name).toLowerCase())) continue;
    yield [path.join(dir, item.name), relative];
  }
}

/**
 * Parses one entry file.
 *
 * `js-yaml` is imported **lazily**, and only when a YAML or Markdown entry is
 * actually present. Every entry in the corpus is JSON today, and this module
 * is reachable from `astro.config.mjs`: a top-level import would make a
 * devDependency load-bearing for `astro build` in every environment, to parse
 * a file format nothing currently uses. The day a `.md` entry lands, the
 * import happens then.
 */
async function parseEntry(absolutePath: string): Promise<unknown> {
  const raw = readFileSync(absolutePath, "utf8");
  const extension = path.extname(absolutePath).toLowerCase();

  if (extension === ".json") {
    return raw.trim() === "" ? {} : JSON.parse(raw);
  }

  const { load } = await import("js-yaml");

  if (extension === ".yaml" || extension === ".yml") {
    const parsed = load(raw);
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  }

  // `.md` / `.mdx` — the human text is a body, the entry data is frontmatter.
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(raw);
  if (match === null) return {};
  const parsed = load(match[1] ?? "");
  return typeof parsed === "object" && parsed !== null ? parsed : {};
}

/** Every entry under `contentRoot`, in a stable (collection, path) order. */
export async function loadContent(
  contentRoot: string = CONTENT_ROOT
): Promise<LoadedContent> {
  const collections = readdirSync(contentRoot, { withFileTypes: true })
    .filter((item) => item.isDirectory())
    .map((item) => item.name)
    .sort();

  const entries: LoadedEntry[] = [];
  const taxonomyEntries: unknown[] = [];

  for (const collection of collections) {
    for (const [absolutePath, relative] of walk(
      path.join(contentRoot, collection),
      ""
    )) {
      const data = await parseEntry(absolutePath);
      entries.push({
        collection,
        file: `src/content/${collection}/${relative}`,
        data,
      });
      if (collection === TAXONOMY_COLLECTION) taxonomyEntries.push(data);
    }
  }

  return { entries, taxonomyEntries };
}
