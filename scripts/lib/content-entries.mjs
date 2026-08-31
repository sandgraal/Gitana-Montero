/**
 * Shared content-entry loader for the T105 check scripts.
 *
 * `check:locales`, `check:citations`, `check:links` and the ES `usted`-register
 * lint all need the same thing: every entry in every `src/content/<collection>`
 * directory, as plain data, with enough path information to name the offending
 * file. None of them can go through `astro:content` — that virtual module only
 * exists inside Astro's Vite pipeline, and these are plain-Node CLI scripts
 * that also run in a CI job with no build step (`link-check.yml`'s weekly
 * `link-check` job runs `check:links` on its own runner). So this module
 * re-derives the same file set `src/content.config.ts`'s `glob()` loader
 * would, using the same pattern
 * and the same id-generation algorithm Astro's non-legacy glob loader uses
 * (`generateIdDefault` in `astro/dist/content/loaders/glob.js`) — reimplemented
 * here from `github-slugger`, the exact package Astro calls internally, so a
 * file's derived id matches what `astro:content` would give it byte for byte.
 *
 * refs specs/001-foundation (SCF-02, REF-02, I18N-07)
 */
import { readFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { load as parseYaml } from "js-yaml";
import { slug as githubSlug } from "github-slugger";

export const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  ".."
);

export const CONTENT_ROOT = path.join(REPO_ROOT, "src", "content");

/**
 * The fixed entry envelope every collection's schema assembles — kept in sync
 * with `RESERVED_ENTRY_FIELDS` in `src/schemas/entry.ts` by
 * `tests/check-citations.test.ts` (which imports the real export and asserts
 * the two lists are equal).
 *
 * Not imported directly from `entry.ts`: that module (transitively) imports
 * sibling `.ts` files by extensionless specifier, which is how TypeScript
 * project references normally work but is not something plain Node's loader
 * resolves — and these check scripts run under plain `node`, not `tsx`/Vite,
 * including in `link-check.yml`'s weekly `link-check` job, which has no
 * build step. `entry.ts` itself resolves fine (Node 24 strips its own
 * erasable-syntax types), but its
 * import of `../i18n/routing` (no extension) does not.
 */
export const RESERVED_ENTRY_FIELDS = [
  "id",
  "fitment",
  "confidence",
  "sources",
  "prose",
];

/**
 * The confidence tiers, strongest evidence first — kept in sync with
 * `CONFIDENCE_TIERS` in `src/schemas/entry.ts` by
 * `tests/lib/content-entries.test.ts` (which imports the real export and
 * asserts the two arrays are equal, order included: this list's index order
 * is part of the contract, same as the source it mirrors).
 *
 * Duplicated here for the same reason `RESERVED_ENTRY_FIELDS` is duplicated
 * above: `entry.ts` cannot be imported by plain-`node` scripts (see that
 * constant's docstring for why).
 */
export const CONFIDENCE_TIERS = [
  "fsm-confirmed",
  "tsb",
  "community-consensus",
  "first-hand",
  "anecdotal",
];

/**
 * Tiers a `check:citations` entry must cite at least one source to claim —
 * every tier stronger than `first-hand` (AGENTS.md "Facts": "cite what you
 * actually read, or lower the confidence tier"). `first-hand` (the owner's
 * own truck) and `anecdotal` (unsourced by definition) are the only tiers
 * that may sit at zero sources.
 *
 * This is a strictly wider net than `src/schemas/entry.ts`'s
 * `CITATION_REQUIRED_TIERS` (`fsm-confirmed`/`tsb` only, enforced at parse
 * time because claiming "a document says so" with no document is a
 * structural contradiction the schema can see). `community-consensus` is
 * schema-legal with zero sources — a shape a schema refinement cannot tell
 * apart from "the community really did agree, offline" — so this is a
 * policy check-script rule (like REF-02's numeric-spec rule below), not a
 * schema tightening.
 */
export const TIERS_REQUIRING_SOURCES = CONFIDENCE_TIERS.slice(
  0,
  CONFIDENCE_TIERS.indexOf("first-hand")
);

/**
 * The **documentary tiers** — the tiers whose whole meaning is "a document
 * says so", and therefore the left-hand side of T207's kind→tier coherence
 * rule.
 *
 * Mirrors `CITATION_REQUIRED_TIERS` in `src/schemas/entry.ts` exactly, and is
 * pinned to it by `tests/lib/content-entries.test.ts`. Same tier set, two
 * different questions: the schema asks *is there a document at all*, this
 * script asks *is it the kind of document the tier claims*.
 *
 * Duplicated here rather than imported for the reason `RESERVED_ENTRY_FIELDS`
 * is — see that constant's docstring.
 */
export const DOCUMENTARY_TIERS = ["fsm-confirmed", "tsb"];

/**
 * The **documentary kinds** — AGENTS.md's "factory-documented" set: the FSM,
 * the bulletins, and manufacturer primary literature (owner ruling
 * 2026-08-28, which widened the top tier from the FSM alone).
 *
 * Mirrors `FACTORY_DOCUMENTED_KINDS` in `src/schemas/entry.ts`, pinned by
 * `tests/lib/content-entries.test.ts`.
 */
export const FACTORY_DOCUMENTED_KINDS = ["fsm", "tsb", "manufacturer"];

/**
 * Entries that violate the kind→tier coherence rule today and are exempt from
 * it **until the content follow-up lands** — a ratchet, not an amnesty.
 *
 * ## Why this register exists
 *
 * T207 introduced the rule (see `findKindTierIssues` in
 * `scripts/check-citations.mjs`). Its first run against real content found 19
 * `vehicles` entries at `fsm-confirmed` whose strongest citation is
 * `www.mitsubishi-motors.com` — Mitsubishi's own site — filed as `vendor`,
 * because T201 was written before the `manufacturer` kind existed (added
 * 2026-08-28, `fix/001-source-kinds-v2`). That is precisely the mis-filing the
 * amendment was made to fix, and the amendment did not re-kind the content it
 * was made for.
 *
 * So the finding is real, the *tier* is very likely right, and the repair is a
 * content change — re-kinding those citations — that belongs to a
 * content-researcher with a fact-check pass, not to the schema task that
 * surfaced it. Shipping the rule with this register keeps the gate live for
 * every new and every re-touched entry (which is the point: the T207 content
 * half writes the first entries it governs) instead of deferring the rule
 * until the backlog clears.
 *
 * ## The properties that keep it from rotting
 *
 * - **Self-cleaning.** A listed file that no longer violates the rule is a
 *   *stale exception* and fails `check:citations` by itself, naming the line
 *   to delete. The register can only shrink, and it cannot silently outlive
 *   the debt.
 * - **Closed.** Adding a path here is a code change in a reviewed file, on a
 *   branch whose diff shows it. No entry can grandfather itself.
 * - **Loud.** `check:citations` prints the outstanding count on every green
 *   run, so the debt is in every CI log until it is zero.
 *
 * Paths are repo-relative POSIX, exactly as `loadContentEntries` reports
 * `file`.
 *
 * ## Re-kind sweep (`fix/001-source-rekind-sweep`, 2026-08-31)
 *
 * 18 of the original 19 entries were re-kinded: `www.mitsubishi-motors.com`
 * and `www.mitsubishicars.com` citations to `manufacturer` (both are
 * manufacturer primary literature — the former Mitsubishi Motors Corp's
 * global site, the latter Mitsubishi Motors Sales of America's, confirmed by
 * opening the archived snapshot of each and reading the page/PDF), and
 * `en.wikipedia.org` citations to `reference` (an encyclopedia, not a forum
 * thread). Both re-kinds land squarely in the eight ratified `SOURCE_KINDS`
 * (`src/schemas/entry.ts`) and each now satisfies `FACTORY_DOCUMENTED_KINDS`
 * or was never claiming to.
 *
 * `combos-gen3-au.json` stays listed: its only source is
 * `xr793.com/wp-content/uploads/2023/04/2004-Mitsubishi-Pajero-AUS.pdf`, an
 * enthusiast PDF-brochure archive ("Dezo's Garage") that reproduces a genuine
 * Mitsubishi Motors Australia brochure (confirmed by opening the archived PDF
 * — its metadata, cover copy, and footer publication code
 * `PAJERONP0309` all match). The reproduction is not the manufacturer,
 * though, so per the ratified taxonomy `xr793.com` stays `vendor` regardless
 * of what it reproduces — `vendor` is not a `FACTORY_DOCUMENTED_KINDS` kind,
 * and this entry has no second source to fall back on. Fixing it needs either
 * a genuine `fsm`/`tsb`/`manufacturer` citation added (a sourcing task, out
 * of a kind-only sweep's scope) or the tier lowered (a tier change, also out
 * of scope here) — so one entry remains, correctly, not a stale exception.
 */
export const KIND_TIER_LEGACY_EXCEPTIONS = [
  "src/content/vehicles/combos-gen3-au.json",
];

/** Same extensions `ENTRY_PATTERN` in `src/content.config.ts` loads. */
const ENTRY_EXTENSIONS = new Set(["md", "mdx", "json", "yaml", "yml"]);

/**
 * Files whose name starts with `_` are drafts/notes and are never loaded —
 * mirrors `ENTRY_PATTERN`'s `[^_]*` in `src/content.config.ts`.
 */
function isDraftName(basename) {
  return basename.startsWith("_");
}

/** Recursively list every entry file under `dir`, as POSIX paths relative to `dir`. */
async function walkEntryFiles(dir, prefix = "") {
  let dirents;
  try {
    dirents = await readdir(dir, { withFileTypes: true });
  } catch (error) {
    if (error && error.code === "ENOENT") return [];
    throw error;
  }

  const found = [];
  for (const dirent of dirents) {
    const relative = prefix === "" ? dirent.name : `${prefix}/${dirent.name}`;
    if (dirent.isDirectory()) {
      found.push(
        ...(await walkEntryFiles(path.join(dir, dirent.name), relative))
      );
      continue;
    }
    if (!dirent.isFile()) continue;
    if (isDraftName(dirent.name)) continue;
    const ext = dirent.name.split(".").pop();
    if (!ext || !ENTRY_EXTENSIONS.has(ext.toLowerCase())) continue;
    found.push(relative);
  }
  return found.sort();
}

/** The `src/content/` subdirectory names — one per registered collection. */
export async function listCollectionNames(contentRoot = CONTENT_ROOT) {
  if (!existsSync(contentRoot)) return [];
  const dirents = await readdir(contentRoot, { withFileTypes: true });
  return dirents
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
}

/**
 * Astro's non-legacy `glob()` loader id, reimplemented (see module docstring).
 *
 * `relativePath` is the entry file's POSIX path relative to the collection's
 * base directory (`src/content/<collection>/`), extension included — exactly
 * what `walkEntryFiles` returns.
 *
 * **Omitted branch (T105 review, F3):** Astro's real `generateIdDefault`
 * checks `data.slug` *before* deriving anything from the path — `if
 * (data.slug) return String(data.slug)` — and only falls through to the
 * path-derived slug this function computes when no `slug` key is present.
 * This function never reads `data` and always takes the path branch.
 * Unreachable today: every collection's schema is `defineEntrySchema`'s
 * `.strict()` shape (`src/schemas/entry.ts`), which has no `slug` field, so
 * a `slug` key in frontmatter is an `unrecognized_keys` schema failure, not
 * a silently-honored id override. But `check:locales`'s
 * `findSlugFieldIssues` (`scripts/check-locales.mjs`) still flags any entry
 * `data` carrying a `slug` key on sight — belt-and-suspenders against this
 * exact divergence (an entry whose real Astro id is silently *not* what
 * `deriveAstroEntryId` says) if a future collection ever relaxes the schema
 * to allow one.
 */
export function deriveAstroEntryId(relativePath) {
  const withoutExt = relativePath.replace(/\.[^./]+$/, "");
  const segments = withoutExt.split("/");
  const slug = segments.map((segment) => githubSlug(segment)).join("/");
  return slug.replace(/\/index$/, "");
}

/** Strip a `---\n...\n---` YAML frontmatter block from a Markdown/MDX file. */
function extractFrontmatter(raw) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(raw);
  if (!match) return {};
  const parsed = parseYaml(match[1]);
  return parsed && typeof parsed === "object" ? parsed : {};
}

/** Parse one entry file's data, by extension. Never throws on empty input. */
export async function readEntryData(filePath) {
  const ext = path.extname(filePath).slice(1).toLowerCase();
  const raw = await readFile(filePath, "utf8");

  if (ext === "json") {
    return raw.trim() === "" ? {} : JSON.parse(raw);
  }
  if (ext === "yaml" || ext === "yml") {
    const parsed = parseYaml(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  }
  // .md / .mdx
  return extractFrontmatter(raw);
}

/**
 * @typedef {object} ContentEntry
 * @property {string} collection
 * @property {string} relativePath POSIX path relative to the collection dir.
 * @property {string} file Path relative to the repo root, for error messages.
 * @property {string} absolutePath
 * @property {unknown} data Parsed frontmatter / data, `{}` if unparseable.
 */

/** Every entry across every `src/content/<collection>` directory. */
export async function loadContentEntries(contentRoot = CONTENT_ROOT) {
  const collections = await listCollectionNames(contentRoot);
  /** @type {ContentEntry[]} */
  const entries = [];

  for (const collection of collections) {
    const collectionDir = path.join(contentRoot, collection);
    const relativePaths = await walkEntryFiles(collectionDir);
    for (const relativePath of relativePaths) {
      const absolutePath = path.join(collectionDir, relativePath);
      const data = await readEntryData(absolutePath);
      entries.push({
        collection,
        relativePath,
        file: path.relative(REPO_ROOT, absolutePath).split(path.sep).join("/"),
        absolutePath,
        data,
      });
    }
  }

  return entries;
}

/** Paths of every blank / whitespace-only string reachable inside `value`. */
export function blankStringPaths(value, path_ = []) {
  const found = [];
  const walk = (node, at) => {
    if (typeof node === "string") {
      if (node.trim().length === 0) found.push(at);
      return;
    }
    if (Array.isArray(node)) {
      node.forEach((item, index) => walk(item, [...at, index]));
      return;
    }
    if (typeof node === "object" && node !== null) {
      for (const [key, child] of Object.entries(node))
        walk(child, [...at, key]);
    }
  };
  walk(value, path_);
  return found;
}

/** Every string leaf inside `value`, with its dotted/bracketed path. */
export function stringLeaves(value, at = []) {
  const found = [];
  const walk = (node, path_) => {
    if (typeof node === "string") {
      found.push({ path: path_, value: node });
      return;
    }
    if (Array.isArray(node)) {
      node.forEach((item, index) => walk(item, [...path_, index]));
      return;
    }
    if (typeof node === "object" && node !== null) {
      for (const [key, child] of Object.entries(node))
        walk(child, [...path_, key]);
    }
  };
  walk(value, at);
  return found;
}

/** Every numeric leaf inside `value`, with its dotted/bracketed path. */
export function numericLeaves(value, at = []) {
  const found = [];
  const walk = (node, path_) => {
    if (typeof node === "number" && Number.isFinite(node)) {
      found.push({ path: path_, value: node });
      return;
    }
    if (Array.isArray(node)) {
      node.forEach((item, index) => walk(item, [...path_, index]));
      return;
    }
    if (typeof node === "object" && node !== null) {
      for (const [key, child] of Object.entries(node))
        walk(child, [...path_, key]);
    }
  };
  walk(value, at);
  return found;
}

/** Render a path array (`["fitment", "years", "from"]`) as `fitment.years.from`. */
export function formatPath(path_) {
  return path_
    .map((segment, index) =>
      typeof segment === "number"
        ? `[${segment}]`
        : index === 0
          ? segment
          : `.${segment}`
    )
    .join("");
}
