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
 * ## Kind→tier coherence (T207, 2026-08-30)
 *
 * A third rule, and the one T207's task line reserved the decision on: an
 * entry claiming a **documentary tier** (`fsm-confirmed` or `tsb` — the tiers
 * whose whole meaning is "a document says so") must cite at least one source
 * of a **documentary kind** (`fsm`, `tsb`, `manufacturer`). Before it, nothing
 * stopped an `fsm-confirmed` entry whose only citation was a forum thread.
 *
 * **The decision, and why it went this way.** AGENTS.md does not describe
 * `fsm-confirmed` as "very confident"; it defines it: "`fsm-confirmed` means
 * **factory-documented**: the FSM, official spec sheets, factory brochures and
 * catalogues — manufacturer primary literature (owner ruling 2026-08-28)".
 * That is a statement about *what kind of document backs the claim*, so an
 * `fsm-confirmed` entry citing only a forum is not an overconfident claim —
 * it is a mislabelled one, and the label is exactly what a reader uses to
 * decide whether to trust a torque figure on their brakes. A rule that can be
 * checked mechanically and whose failure mode is a reader trusting the wrong
 * number is not a review-time concern.
 *
 * **Why here and not in the schema.** Same reasoning as the tier/source
 * invariant above, and the same precedent: `src/schemas/entry.ts` refines on
 * structural contradictions a shape can see. "Is this evidence the right
 * *class* of evidence for the claim" is content policy — it reads a value in
 * an array and applies an editorial standard to it — and content policy lives
 * on the merge path in this script, where it can also carry the legacy
 * register below. The schema's `CITATION_REQUIRED_TIERS` gate is untouched.
 *
 * **Scope.** Deliberately only the documentary tiers. `community-consensus`
 * has no document in its definition (it is an aggregate of people agreeing),
 * so there is no kind a machine could require of it; the `SOURCE_KINDS`
 * docstring's notes about which kinds suit the weaker tiers stay reader
 * guidance, and `src/schemas/entry.ts` now says so explicitly.
 *
 * **Legacy register.** 19 `vehicles` entries fail this rule on the day it
 * lands, all of them by citing official Mitsubishi pages filed as `vendor`
 * because the `manufacturer` kind did not exist when they were written. They
 * are listed in `KIND_TIER_LEGACY_EXCEPTIONS` (see that constant for the
 * ratchet properties) and are a content follow-up, not a reason to withhold
 * the rule from the entries being written now.
 *
 * Usage: node scripts/check-citations.mjs
 *
 * refs specs/001-foundation (REF-02)
 */
import {
  CONTENT_ROOT,
  DOCUMENTARY_TIERS,
  FACTORY_DOCUMENTED_KINDS,
  KIND_TIER_LEGACY_EXCEPTIONS,
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

const LEGACY_EXCEPTIONS = new Set(KIND_TIER_LEGACY_EXCEPTIONS);

/** The `kind` of every source on an entry, as strings. */
function sourceKinds(data) {
  const sources = data && typeof data === "object" ? data.sources : undefined;
  if (!Array.isArray(sources)) return [];
  return sources.flatMap((source) =>
    source && typeof source === "object" && typeof source.kind === "string"
      ? [source.kind]
      : []
  );
}

/**
 * Kind→tier coherence for one entry (see module docstring): an entry at a
 * documentary tier that cites no documentary source, named by entry id, file,
 * tier, and the kinds it actually cites.
 *
 * Returns `[]` when the tier is not documentary, or when at least one source
 * is `fsm` / `tsb` / `manufacturer`. An entry with *no* sources at all is not
 * reported here — that is `findTierSourceIssues`' finding, and reporting the
 * same entry twice for one mistake sends the author chasing two problems.
 *
 * The legacy register is **not** consulted here: this function answers "does
 * this entry violate the rule", which is what the register's own staleness
 * check needs. Suppression happens in {@link auditCitations}.
 */
export function findKindTierIssues(entry) {
  const { collection, file, data } = entry;
  const confidence =
    data && typeof data === "object" ? data.confidence : undefined;
  if (typeof confidence !== "string") return [];
  if (!DOCUMENTARY_TIERS.includes(confidence)) return [];

  const kinds = sourceKinds(data);
  if (kinds.length === 0) return [];
  if (kinds.some((kind) => FACTORY_DOCUMENTED_KINDS.includes(kind))) return [];

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
        `${file}: entry \`${id}\` claims confidence \`${confidence}\`, which ` +
        `means factory-documented (AGENTS.md, owner ruling 2026-08-28), but ` +
        `its sources are ${kinds.map((kind) => `\`${kind}\``).join(", ")} — ` +
        `none of ${FACTORY_DOCUMENTED_KINDS.map((kind) => `\`${kind}\``).join(", ")}. ` +
        `Either cite the factory document, re-file a source that IS factory ` +
        `literature under \`manufacturer\` (official manufacturer pages, spec ` +
        `sheets, brochures), or lower the tier.`,
    },
  ];
}

/**
 * Register entries that no longer describe a violation — see
 * `KIND_TIER_LEGACY_EXCEPTIONS`. A stale line is a failure, not a shrug: if a
 * fixed (or deleted, or renamed) file could keep its exception silently, the
 * register would outlive the debt and start hiding the next violation to land
 * in that file.
 *
 * Separate from {@link auditCitations} on purpose: every other rule here is a
 * question about one entry, and this one is a question about the *corpus* —
 * asking it of a partial entry list would report every unexamined file as
 * fixed. `main()` calls both.
 */
export function findStaleLegacyExceptions(entries) {
  const violating = new Set(
    entries
      .flatMap((entry) => findKindTierIssues(entry))
      .map((issue) => issue.file)
  );

  return KIND_TIER_LEGACY_EXCEPTIONS.filter((file) => !violating.has(file)).map(
    (file) => ({
      collection: "(register)",
      file,
      field: "KIND_TIER_LEGACY_EXCEPTIONS",
      message:
        `${file}: listed in \`KIND_TIER_LEGACY_EXCEPTIONS\` ` +
        `(scripts/lib/content-entries.mjs) but it no longer violates the ` +
        `kind→tier coherence rule — the exception is stale. Delete that line: ` +
        `the register is a ratchet and only ever shrinks.`,
    })
  );
}

/** Every per-entry rule, with the legacy register applied. */
export function auditCitations(entries) {
  return entries.flatMap((entry) => [
    ...findCitationIssues(entry),
    ...findTierSourceIssues(entry),
    ...findKindTierIssues(entry).filter(
      (issue) => !LEGACY_EXCEPTIONS.has(issue.file)
    ),
  ]);
}

async function main() {
  const entries = await loadContentEntries(CONTENT_ROOT);
  const problems = [
    ...auditCitations(entries),
    ...findStaleLegacyExceptions(entries),
  ];

  if (problems.length > 0) {
    console.error(`check:citations — ${problems.length} problem(s):`);
    for (const problem of problems) console.error(`  • ${problem.message}`);
    process.exitCode = 1;
    return;
  }

  const outstanding = KIND_TIER_LEGACY_EXCEPTIONS.length;

  console.log(
    `check:citations — OK: ${entries.length} entr${entries.length === 1 ? "y" : "ies"} checked, ` +
      `every numeric spec is cited, every tier above first-hand cites a ` +
      `source, and every documentary tier cites a documentary source.`
  );

  if (outstanding > 0) {
    console.log(
      `check:citations — ${outstanding} entr${outstanding === 1 ? "y" : "ies"} ` +
        `still exempt from the kind→tier rule ` +
        `(KIND_TIER_LEGACY_EXCEPTIONS, scripts/lib/content-entries.mjs): ` +
        `pre-\`manufacturer\` citations awaiting the content re-kinding ` +
        `follow-up recorded on T207.`
    );
  }
}

if (
  process.argv[1] &&
  new URL(process.argv[1], "file://").pathname ===
    new URL(import.meta.url).pathname
) {
  await main();
}
