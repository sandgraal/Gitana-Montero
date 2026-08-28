/**
 * `check:citations` (REF-02).
 *
 * > IF a numeric value in any reference entry lacks a source citation, THEN
 * > `check:citations` SHALL fail naming the entry and field.
 *
 * `defineEntrySchema` already refuses an entry whose `confidence` claims
 * `fsm-confirmed` or `tsb` ("a document says so") while `sources` is empty
 * (`CITATION_REQUIRED_TIERS` in `src/schemas/entry.ts`) — but that check
 * fires on the *tier*, not on the presence of a number. An entry sitting at
 * `community-consensus` or `first-hand` with an uncited torque figure passes
 * that gate cleanly and is exactly the gap AGENTS.md closes with "every
 * numeric spec carries a source" and REF-02 closes with this script: any
 * numeric value anywhere in an entry's shared data — regardless of
 * confidence tier — needs at least one `sources` entry.
 *
 * Scope: the fixed entry envelope (`id`, `fitment`, `confidence`, `sources`,
 * `prose`) is never scanned for "numeric specs" needing a citation.
 * `fitment.years.{from,to}` are numbers, but they describe which vehicles an
 * entry applies to, not a fact the entry is asserting — the taxonomy itself
 * is the source, not a forum thread. Everything else at the top level of an
 * entry is collection-specific shared data (torque figures, part numbers,
 * capacities, intervals…), which is exactly what REF-02 means by "numeric
 * spec value". `prose` can never carry a number at all — `defineEntrySchema`
 * throws at define time if it does — so it is excluded structurally, not
 * scanned defensively.
 *
 * Granularity note: the schema does not yet map an individual field to the
 * specific source that backs it (that is a richer per-field citation model
 * than T104 built). Until that lands, "cited" means "this entry's `sources`
 * array is non-empty" — coarser than REF-02's ideal but a real, enforced
 * floor: an entry with a numeric spec and zero sources fails, named by field.
 *
 * Usage: node scripts/check-citations.mjs
 *
 * refs specs/001-foundation (REF-02)
 */
import {
  CONTENT_ROOT,
  RESERVED_ENTRY_FIELDS,
  formatPath,
  loadContentEntries,
  numericLeaves,
} from "./lib/content-entries.mjs";

const RESERVED = new Set(RESERVED_ENTRY_FIELDS);

/** The subset of `data` REF-02 considers "shared data", per the module docstring. */
function sharedData(data) {
  if (typeof data !== "object" || data === null) return {};
  const out = {};
  for (const [key, value] of Object.entries(data)) {
    if (RESERVED.has(key)) continue;
    out[key] = value;
  }
  return out;
}

/**
 * Citation problems for one entry: every numeric field named, if `sources`
 * is empty. Returns `[]` when the entry has no numeric shared data, or has
 * at least one source.
 */
export function findCitationIssues(entry) {
  const { collection, file, data } = entry;
  const sources = data && typeof data === "object" ? data.sources : undefined;
  if (Array.isArray(sources) && sources.length > 0) return [];

  const numbers = numericLeaves(sharedData(data));
  if (numbers.length === 0) return [];

  return numbers.map(({ path, value }) => ({
    collection,
    file,
    field: formatPath(path),
    message: `${file}: field \`${formatPath(path)}\` is a numeric spec (${value}) but this entry cites no sources (REF-02 — every numeric spec carries a source).`,
  }));
}

export function auditCitations(entries) {
  return entries.flatMap(findCitationIssues);
}

async function main() {
  const entries = await loadContentEntries(CONTENT_ROOT);
  const problems = auditCitations(entries);

  if (problems.length > 0) {
    console.error(`check:citations — ${problems.length} problem(s):`);
    for (const problem of problems) console.error(`  • ${problem.message}`);
    process.exitCode = 1;
    return;
  }

  console.log(
    `check:citations — OK: ${entries.length} entr${entries.length === 1 ? "y" : "ies"} checked, ` +
      `every numeric spec is cited.`
  );
}

if (
  process.argv[1] &&
  new URL(process.argv[1], "file://").pathname ===
    new URL(import.meta.url).pathname
) {
  await main();
}
