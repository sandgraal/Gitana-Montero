/**
 * `check:locales` — SCF-02's named "locale check" step.
 *
 * This is deliberately a *secondary* sweep, not the primary gate: `astro
 * build` already refuses to build any entry whose `prose.en` / `prose.es` is
 * missing or blank (I18N-06, enforced structurally by
 * `defineEntrySchema` in `src/schemas/entry.ts`). What this script adds that
 * the Zod gate does not:
 *
 * - A human-readable report across every collection in one run, without
 *   needing a full `astro build` first (useful in CI's `links-a11y` job,
 *   which runs `npm run check:links --if-present` on its own runner with no
 *   build step, and for local iteration).
 * - The `data.id` === file-derived Astro entry id check (T104 review): two
 *   ids that can silently diverge because nothing in the Zod schema compares
 *   an entry's declared `id` field against the id Astro's glob loader
 *   generates from the file's path. A content file saved under the wrong
 *   name would pass every schema check and still break every cross-reference
 *   that keys off the real Astro entry id.
 *
 * Usage: node scripts/check-locales.mjs
 *
 * refs specs/001-foundation (SCF-02, I18N-06)
 */
import { LOCALES } from "../src/i18n/routing.ts";
import {
  CONTENT_ROOT,
  blankStringPaths,
  deriveAstroEntryId,
  formatPath,
  loadContentEntries,
} from "./lib/content-entries.mjs";

/**
 * @typedef {object} LocaleIssue
 * @property {string} collection
 * @property {string} file
 * @property {import("../src/i18n/routing.ts").Locale} [locale] Absent on the
 *   "no prose block at all" issue, present once a specific locale is known.
 * @property {string} message
 */

/**
 * Locale-completeness problems for one entry: missing `prose` entirely,
 * missing a locale, or a present-but-blank string anywhere inside a locale
 * (the same "a stub is not a locale" rule `defineEntrySchema` enforces).
 *
 * @returns {LocaleIssue[]}
 */
export function findLocaleIssues(entry) {
  const { collection, file, data } = entry;
  const issues = [];
  const prose = data && typeof data === "object" ? data.prose : undefined;

  if (typeof prose !== "object" || prose === null || Array.isArray(prose)) {
    issues.push({
      collection,
      file,
      message: `${file}: missing \`prose\` — every entry needs prose.${LOCALES.join(
        " and prose."
      )} (I18N-06)`,
    });
    return issues;
  }

  for (const locale of LOCALES) {
    const localeProse = prose[locale];
    if (typeof localeProse !== "object" || localeProse === null) {
      issues.push({
        collection,
        file,
        locale,
        message: `${file}: missing \`prose.${locale}\` (I18N-06 — both or neither)`,
      });
      continue;
    }
    for (const blankPath of blankStringPaths(localeProse)) {
      issues.push({
        collection,
        file,
        locale,
        message: `${file}: \`prose.${locale}.${formatPath(blankPath)}\` is blank — a present-but-empty locale field is a missing translation (I18N-06)`,
      });
    }
  }

  return issues;
}

/**
 * The `data.id` === file-derived Astro entry id check (T104 review).
 *
 * Returns `null` when the entry is sound, or an issue naming both ids
 * otherwise. `missing-id` fires first: an entry with no declared `id` at all
 * fails the schema separately, but naming it here too keeps the report
 * self-contained.
 */
export function findIdMismatch(entry) {
  const { collection, file, relativePath, data } = entry;
  const expected = deriveAstroEntryId(relativePath);
  const actual = data && typeof data === "object" ? data.id : undefined;

  if (typeof actual !== "string" || actual.trim() === "") {
    return {
      collection,
      file,
      message: `${file}: no \`id\` field — Astro would derive \`${expected}\` for this file; every entry declares \`data.id\` explicitly so it can be cross-referenced`,
    };
  }

  if (actual !== expected) {
    return {
      collection,
      file,
      expected,
      actual,
      message: `${file}: \`data.id\` is \`${actual}\`, but Astro derives \`${expected}\` from this file's path — the two ids have diverged. Rename the file to match \`data.id\`, or fix \`data.id\` to match the file.`,
    };
  }

  return null;
}

/** Run both audits across every entry. Returns `{ localeIssues, idIssues }`. */
export function auditEntries(entries) {
  const localeIssues = entries.flatMap(findLocaleIssues);
  const idIssues = entries
    .map(findIdMismatch)
    .filter((issue) => issue !== null);
  return { localeIssues, idIssues };
}

async function main() {
  const entries = await loadContentEntries(CONTENT_ROOT);
  const { localeIssues, idIssues } = auditEntries(entries);
  const problems = [...localeIssues, ...idIssues];

  if (problems.length > 0) {
    console.error(`check:locales — ${problems.length} problem(s):`);
    for (const problem of problems) console.error(`  • ${problem.message}`);
    process.exitCode = 1;
    return;
  }

  console.log(
    `check:locales — OK: ${entries.length} entr${entries.length === 1 ? "y" : "ies"} checked, ` +
      `every one carries both locales and a file-consistent id.`
  );
}

if (
  process.argv[1] &&
  new URL(process.argv[1], "file://").pathname ===
    new URL(import.meta.url).pathname
) {
  await main();
}
