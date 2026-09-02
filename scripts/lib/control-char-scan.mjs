/**
 * Repo-wide raw-control-byte scanner.
 *
 * Generalizes the scoped regression in `src/schemas/parts.test.ts` ("PR #75,
 * r3910083246"): a NUL byte used as a string-concatenation delimiter went
 * into the source as a **raw byte** rather than an escape sequence, and was
 * therefore invisible in every editor and every diff — it survived Prettier,
 * ESLint, a full review round, and two rebases before a bot reviewer caught
 * it. That fix hard-coded a list of five files under `src/lib/parts/`. This
 * module backs the repo-wide grader
 * (`tests/repo-hygiene/no-control-characters.test.ts`) that replaces the
 * list with an actual sweep of every hand-authored source file.
 *
 * Deliberately a raw-byte text scan, not an AST-aware one: the whole point is
 * to catch bytes that are invisible to *every* tool that understands the
 * file's syntax (formatter, linter, syntax highlighter, diff viewer). An
 * `.astro` file's frontmatter, template, and embedded `<script>`/`<style>`
 * blocks are all just bytes in the same file to this scanner, so nothing
 * about Astro's component syntax needs to be understood for them to be
 * covered.
 *
 * Scope note (a "known-pages" sweep is only as complete as its list —
 * `.claude/GRADER-PRINCIPLES.md`): `DEFAULT_ROOTS` names the three
 * directories the repo treats as hand-authored source, not a list of files.
 * A new directory under any of the three is covered automatically; a new
 * top-level directory of hand-authored source is not, and would need adding
 * here.
 *
 * refs specs/001-foundation
 */
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  ".."
);

/**
 * The three directories this repo actually hand-authors source into.
 * `src/content/**` (335 hand-authored JSON entries as of writing) is
 * deliberately included, not carved out: a hidden control character in a
 * content entry is exactly as invisible, and exactly as capable of surviving
 * review, as one in a `.ts` file — and scanning the real tree today finds no
 * false positives there (see the test file's own coverage assertion).
 */
export const DEFAULT_ROOTS = ["src", "scripts", "tests"];

/**
 * `.astro` is a file *extension* the walk includes; `.astro` is also the
 * Astro build-cache *directory* name the walk must never descend into. Those
 * are unrelated collisions (extension vs. directory name), not a special
 * case — the directory-name exclusion below and the extension allow-list are
 * checked independently.
 */
export const DEFAULT_EXTENSIONS = [
  ".ts",
  ".tsx",
  ".astro",
  ".mjs",
  ".js",
  ".json",
];

export const DEFAULT_EXCLUDE_DIRS = new Set([
  "node_modules",
  "dist",
  "dist-configured",
  ".astro",
  "coverage",
  "playwright-report",
  "test-results",
  ".git",
]);

function codePointRange(start, end) {
  const points = [];
  for (let codePoint = start; codePoint <= end; codePoint += 1) {
    points.push(codePoint);
  }
  return points;
}

/**
 * C0 control range (0x00 through 0x1F), minus the three whitespace controls
 * every source file legitimately contains — tab (0x09), newline (0x0A),
 * carriage return (0x0D) — plus DEL (0x7F).
 *
 * DEL is one code point outside strict C0, called out rather than folded in
 * silently: it is included because it shares the exact hazard class that
 * motivates this whole grader (no visible glyph in most editors and
 * terminals, so a stray one is exactly as invisible to review as a C0 byte),
 * not because the spec's C0 boundary technically covers it. If that turns
 * out to be over-broad in practice (a legitimate fixture that needs a
 * literal DEL byte), narrow the range deliberately — don't just delete the
 * byte from a flagged file.
 *
 * Built from a list of plain numbers via `String.fromCharCode`, not a
 * literal character class in source text, on purpose: naming these bytes by
 * writing them into this file directly is the exact transcription hazard
 * this module exists to catch. Every element below is an ordinary numeric
 * literal; nothing in this file's own source text is a control byte.
 */
const BANNED_CODE_POINTS = [
  ...codePointRange(0x00, 0x08), // NUL .. BS
  0x0b, // VT
  0x0c, // FF
  ...codePointRange(0x0e, 0x1f), // SO .. US
  0x7f, // DEL
];

const CONTROL_CHAR_CLASS = BANNED_CODE_POINTS.map((codePoint) =>
  String.fromCharCode(codePoint)
).join("");

export const CONTROL_CHAR_PATTERN = new RegExp(`[${CONTROL_CHAR_CLASS}]`, "g");

/**
 * Every raw match of `CONTROL_CHAR_PATTERN` in `text`, as 1-based line/column
 * positions (not just a byte offset — a reviewer chasing a report wants to
 * open an editor and go to a place, not do arithmetic first).
 *
 * Pure and file-system-free on purpose: this is the unit the boundary table
 * in the test file exercises directly, without needing to write files to
 * disk for every case in the C0 range.
 */
export function findControlCharacters(text) {
  const found = [];
  // A fresh RegExp per call: a shared `/g` regex carries `lastIndex` state
  // across calls, which would silently skip matches on repeated invocations
  // against the same imported pattern object.
  const pattern = new RegExp(CONTROL_CHAR_PATTERN.source, "g");
  let match;
  while ((match = pattern.exec(text)) !== null) {
    const index = match.index;
    const before = text.slice(0, index);
    const lastNewline = before.lastIndexOf("\n");
    found.push({
      index,
      line: before.split("\n").length,
      column: index - lastNewline,
      codePoint: match[0].codePointAt(0),
    });
    // Every alternative in the class consumes exactly one code unit, so a
    // zero-width match can't happen — guard anyway rather than trust it,
    // since an infinite loop here would hang the whole suite.
    if (match.index === pattern.lastIndex) pattern.lastIndex += 1;
  }
  return found;
}

async function walk(dir, extensions, excludeDirs, found) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (error) {
    if (error && error.code === "ENOENT") return;
    throw error;
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (excludeDirs.has(entry.name)) continue;
      await walk(path.join(dir, entry.name), extensions, excludeDirs, found);
      continue;
    }
    if (!entry.isFile()) continue;
    if (!extensions.has(path.extname(entry.name))) continue;
    found.push(path.join(dir, entry.name));
  }
}

/**
 * Every file this grader is responsible for, as absolute paths, sorted for
 * deterministic output.
 */
export async function listScannableFiles({
  roots = DEFAULT_ROOTS,
  extensions = DEFAULT_EXTENSIONS,
  excludeDirs = DEFAULT_EXCLUDE_DIRS,
  repoRoot = REPO_ROOT,
} = {}) {
  const extSet = new Set(extensions);
  const found = [];
  for (const root of roots) {
    await walk(path.join(repoRoot, root), extSet, excludeDirs, found);
  }
  return found.sort();
}

/**
 * Scans every file `listScannableFiles` returns and reports every raw
 * control-character hit, file paths relative to `repoRoot` so a report reads
 * the same regardless of where the repo is checked out.
 */
export async function scanForControlCharacters(options = {}) {
  const repoRoot = options.repoRoot ?? REPO_ROOT;
  const files = await listScannableFiles(options);
  const violations = [];
  for (const file of files) {
    const buffer = await readFile(file);
    const text = buffer.toString("utf8");
    for (const hit of findControlCharacters(text)) {
      violations.push({ file: path.relative(repoRoot, file), ...hit });
    }
  }
  return { files, violations };
}
