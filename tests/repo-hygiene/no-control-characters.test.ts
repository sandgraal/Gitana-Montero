/**
 * Repo-wide sibling to the scoped regression pinned in
 * `src/schemas/parts.test.ts` ("PR #75, r3910083246"): a NUL byte used as a
 * string-concatenation delimiter went into the source as a **raw byte**
 * rather than an escape sequence, and was therefore invisible in every
 * editor and every diff — it survived Prettier, ESLint, a full review
 * round, and two rebases before a bot reviewer caught it. That fix hard-
 * coded a list of five files under `src/lib/parts/`. This suite generalizes
 * it: every hand-authored file under `src/`, `scripts/`, and `tests/` (see
 * `scripts/lib/control-char-scan.mjs` for the exact extension/root scope and
 * its reasoning) is swept, not just the five that happened to be involved
 * last time.
 *
 * This is pure grading infrastructure with no corresponding [PLATFORM]
 * change, so — unlike a spec-task grader — it is written to run and pass
 * today (Vitest, not `it.fails`): the repo is clean of this defect class as
 * of writing, and this suite is what keeps that true.
 *
 * refs specs/001-foundation
 */
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  findControlCharacters,
  listScannableFiles,
  REPO_ROOT,
  scanForControlCharacters,
} from "../../scripts/lib/control-char-scan.mjs";

function formatViolation(violation: {
  file: string;
  line: number;
  column: number;
  codePoint: number | undefined;
}) {
  // `codePoint` is only ever undefined if a match is somehow an empty
  // string, which the pattern (every alternative consumes one code unit)
  // cannot produce — the fallback is for the type checker, not a real case.
  const hex = (violation.codePoint ?? 0).toString(16).padStart(4, "0");
  return `${violation.file}:${violation.line}:${violation.column} (U+${hex})`;
}

// ---------------------------------------------------------------------------
// "A test that cannot fail is worse than none" (GRADER-PRINCIPLES.md): a
// sweep whose glob is silently wrong scans zero files and "passes" forever.
// This pins that the walk actually reaches all three roots.
// ---------------------------------------------------------------------------
describe("scan coverage (positive control)", () => {
  it("scans a plausible, nonzero number of files across src/, scripts/, and tests/", async () => {
    const files = await listScannableFiles();
    const relative = files.map((file) => path.relative(REPO_ROOT, file));

    // The repo has 500+ scannable files as of writing (T105+). A count this
    // low would mean the walk stopped almost immediately — a wrong root, a
    // wrong extension list, or an exclude pattern eating everything.
    expect(files.length).toBeGreaterThan(400);

    // At least one known file from each root, so a single root silently
    // resolving to nothing can't hide behind the other two carrying the
    // count.
    expect(relative).toContain(path.join("src", "schemas", "parts.ts"));
    expect(relative).toContain(path.join("scripts", "check-links.mjs"));
    expect(relative).toContain(path.join("tests", "audit-targets.test.ts"));

    // Hand-authored content JSON is in scope too (see the module docstring
    // for why) — assert at least one made it into the file list, not just
    // that the directory exists.
    const contentJson = relative.filter(
      (file) =>
        file.startsWith(path.join("src", "content") + path.sep) &&
        file.endsWith(".json")
    );
    expect(contentJson.length).toBeGreaterThan(0);
  });

  it("never descends into node_modules, dist, or the Astro build cache", async () => {
    const files = await listScannableFiles();
    const relative = files.map((file) =>
      // `path.relative` returns backslash-separated segments on Windows;
      // normalize to forward slashes so these patterns match the walker's
      // actual behavior on every platform, not just the one this suite
      // happens to run on (r3910854923).
      path.relative(REPO_ROOT, file).replace(/\\/g, "/")
    );
    for (const file of relative) {
      expect(file).not.toMatch(/(^|\/)node_modules(\/|$)/);
      expect(file).not.toMatch(/(^|\/)dist(\/|$)/);
      // The build-cache directory, not the .astro *file extension* — a
      // trailing slash in the pattern is what tells them apart.
      expect(file).not.toMatch(/(^|\/)\.astro\//);
    }
  });
});

// ---------------------------------------------------------------------------
// The live check. Passes today; that's the point (see the docstring above).
// ---------------------------------------------------------------------------
describe("the repo tree today", () => {
  it("carries no raw C0 control bytes (or DEL) in any hand-authored source file", async () => {
    const { violations } = await scanForControlCharacters();
    expect(violations, violations.map(formatViolation).join("\n")).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Boundary table for the pure matcher, independent of the file-tree walk.
// Every code point is named by its plain numeric value (see
// `control-char-scan.mjs` for why no `\uXXXX`-style escape or raw byte is
// typed directly into this file either).
// ---------------------------------------------------------------------------
describe("findControlCharacters (boundary table)", () => {
  const TAB = 0x09;
  const LF = 0x0a;
  const CR = 0x0d;
  const SPACE = 0x20;
  const TILDE = 0x7e;

  const cases: Array<[string, number, boolean]> = [
    ["NUL — the exact byte from the PR #75 incident", 0x00, true],
    ["BS, the last of the leading C0 run", 0x08, true],
    ["VT, immediately after the tab gap", 0x0b, true],
    ["FF, immediately before the newline gap", 0x0c, true],
    ["SO, the first of the trailing C0 run", 0x0e, true],
    ["US, the last of the trailing C0 run", 0x1f, true],
    ["DEL, one past strict C0 but same hazard class", 0x7f, true],
    ["TAB — legitimate whitespace, must not be flagged", TAB, false],
    ["LF — legitimate whitespace, must not be flagged", LF, false],
    ["CR — legitimate whitespace, must not be flagged", CR, false],
    ["SPACE — first printable ASCII above the C0 range", SPACE, false],
    ["'~' — last printable ASCII below DEL", TILDE, false],
  ];

  it.each(cases)("%s (U+%s)", (_name, codePoint, shouldFlag) => {
    const text = `before${String.fromCharCode(codePoint)}after`;
    const matches = findControlCharacters(text);
    if (shouldFlag) {
      expect(matches).toHaveLength(1);
      expect(matches[0].codePoint).toBe(codePoint);
    } else {
      expect(matches).toHaveLength(0);
    }
  });

  it("finds every hit, not just the first, and reports 1-based line/column", () => {
    const text = `line one${String.fromCharCode(0x00)}\nline two${String.fromCharCode(
      0x7f
    )}end`;
    const matches = findControlCharacters(text);
    expect(matches).toHaveLength(2);
    expect(matches[0]).toMatchObject({ line: 1, column: 9, codePoint: 0x00 });
    expect(matches[1]).toMatchObject({ line: 2, column: 9, codePoint: 0x7f });
  });

  // "The ban is on the raw byte appearing in the file, not the escape
  // sequence naming it" — a source file that spells a control character out
  // as an escape sequence (six ordinary printable characters: backslash,
  // "u", and four hex digits) carries no raw control byte at all, and must
  // not be flagged.
  it("does not flag the escape-sequence spelling of NUL — only the literal byte", () => {
    const escapeSequenceSpelling = "\\u0000"; // 6 printable chars: \ u 0 0 0 0
    expect(escapeSequenceSpelling).toHaveLength(6);
    const text = `const delimiter = "${escapeSequenceSpelling}"; // not a raw byte`;
    expect(findControlCharacters(text)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// "Mutation-test the probe corpus itself" (GRADER-PRINCIPLES.md): prove the
// grader can fail, on a real file inside the actually-scanned tree — not a
// unit-tested helper in isolation, which is what the boundary table above
// already covers.
// ---------------------------------------------------------------------------
describe("mutation-test the probe corpus", () => {
  const scratchDir = path.join(
    REPO_ROOT,
    "tests",
    "repo-hygiene",
    "__scratch__"
  );
  const fixturePath = path.join(scratchDir, "mutation-fixture.ts");

  afterEach(async () => {
    // Belt and suspenders: remove the whole scratch directory even if an
    // assertion above threw mid-test, so a failed run never leaves a raw
    // control byte sitting in the tree for the next run (or a reviewer) to
    // trip over.
    await rm(scratchDir, { recursive: true, force: true });
  });

  it("goes red on a real control byte written into the scanned tree, then green once it's removed", async () => {
    await mkdir(scratchDir, { recursive: true });

    const cleanLine = "export const scratch = 1;\n";
    const mutatedLine = `// TEST-CTRL${String.fromCharCode(0x00)}marker\n`;

    // Red: write the mutation and confirm the scoped scan (this file's
    // directory is under `tests/`, one of the three scanned roots) finds it,
    // names the right file, and reports a plausible position.
    await writeFile(fixturePath, cleanLine + mutatedLine, "utf8");
    const dirty = await scanForControlCharacters({ roots: ["tests"] });
    const hit = dirty.violations.find((v) =>
      v.file.endsWith(
        path.join("tests", "repo-hygiene", "__scratch__", "mutation-fixture.ts")
      )
    );
    expect(hit, JSON.stringify(dirty.violations)).toBeDefined();
    expect(hit!.codePoint).toBe(0x00);
    expect(hit!.line).toBe(2); // the mutated line is the second line

    // Green: rewrite the same file without the byte and confirm the scan
    // clears — proves the grader isn't just permanently red once it's seen
    // this filename once.
    await writeFile(
      fixturePath,
      cleanLine + "// TEST-CTRL clean marker\n",
      "utf8"
    );
    const clean = await scanForControlCharacters({ roots: ["tests"] });
    expect(
      clean.violations.find((v) => v.file.endsWith("mutation-fixture.ts"))
    ).toBeUndefined();
  });

  it("still catches the byte when it isn't the first thing in the file (positive control on position)", async () => {
    await mkdir(scratchDir, { recursive: true });
    const padding = "// padding\n".repeat(3);
    const content = `${padding}const x${String.fromCharCode(0x1f)} = 1;\n`;
    await writeFile(fixturePath, content, "utf8");

    const { violations } = await scanForControlCharacters({ roots: ["tests"] });
    const hit = violations.find((v) => v.file.endsWith("mutation-fixture.ts"));
    expect(hit).toBeDefined();
    expect(hit!.codePoint).toBe(0x1f);
    expect(hit!.line).toBe(4);
  });
});
