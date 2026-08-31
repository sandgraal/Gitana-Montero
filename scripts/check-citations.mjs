/**
 * `check:citations` (REF-02, and the tier/source invariant AGENTS.md's
 * "Facts" section states: "cite what you actually read, or lower the
 * confidence tier").
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
 * ## Tier/source invariant (added 2026-08-30, post citation-erratum)
 *
 * A second, independent rule this script enforces: an entry claiming a
 * confidence tier stronger than `first-hand` — `fsm-confirmed`, `tsb`, or
 * `community-consensus` — must cite at least one source, even if it has no
 * numeric shared data at all (e.g. a glossary entry, whose "spec" is a
 * definition, not a number `numericLeaves` would ever see). `first-hand`
 * (the owner's own truck) and `anecdotal` (unsourced by definition) are the
 * only tiers a sourceless entry may claim.
 *
 * This is deliberately a check-script rule, not a schema tightening:
 * `src/schemas/entry.ts`'s `CITATION_REQUIRED_TIERS` gate stays scoped to
 * `fsm-confirmed`/`tsb`, where claiming "a document says so" with an empty
 * `sources` array is a structural contradiction a schema refinement can see
 * outright. Whether "the community really did agree" needs a citation is
 * content policy, not a shape a schema can validate — exactly the kind of
 * rule this script (not `defineEntrySchema`) exists to hold on the
 * merge-blocking path. See `scripts/lib/content-entries.mjs`'s
 * `TIERS_REQUIRING_SOURCES` for the tier list and how it stays in sync with
 * `src/schemas/entry.ts`'s `CONFIDENCE_TIERS`.
 *
 * Usage: node scripts/check-citations.mjs
 *
 * refs specs/001-foundation (REF-02)
 */
import {
  CONTENT_ROOT,
  RESERVED_ENTRY_FIELDS,
  TIERS_REQUIRING_SOURCES,
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

/**
 * Tier/source invariant for one entry (see module docstring): an entry
 * claiming a confidence tier stronger than `first-hand` with an empty (or
 * missing) `sources` array is a problem, named by entry id, file, and tier.
 * Returns `[]` when the tier does not require a source, or the entry has at
 * least one.
 */
export function findTierSourceIssues(entry) {
  const { collection, file, data } = entry;
  const confidence =
    data && typeof data === "object" ? data.confidence : undefined;
  if (typeof confidence !== "string") return [];
  if (!TIERS_REQUIRING_SOURCES.includes(confidence)) return [];

  const sources = data && typeof data === "object" ? data.sources : undefined;
  if (Array.isArray(sources) && sources.length > 0) return [];

  const id =
    data && typeof data === "object" && typeof data.id === "string"
      ? data.id
      : file;

  return [
    {
      collection,
      file,
      field: "sources",
      message:
        `${file}: entry \`${id}\` claims confidence \`${confidence}\`, ` +
        `which is stronger than \`first-hand\`, but cites no sources ` +
        `(AGENTS.md "Facts" — a tier above \`first-hand\` needs at least ` +
        `one source; cite what you read or lower the tier to \`first-hand\` ` +
        `or \`anecdotal\`).`,
    },
  ];
}

export function auditCitations(entries) {
  return entries.flatMap((entry) => [
    ...findCitationIssues(entry),
    ...findTierSourceIssues(entry),
  ]);
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
      `every numeric spec is cited and every tier above first-hand cites a source.`
  );
}

if (
  process.argv[1] &&
  new URL(process.argv[1], "file://").pathname ===
    new URL(import.meta.url).pathname
) {
  await main();
}
