/**
 * `check:glossary` — stub until the glossary collection lands (T205).
 *
 * AGENTS.md: "The glossary is authoritative for terminology... Canonical
 * Costa Rican terms in prose... Regional variants... live in the glossary's
 * `aliases` field." Enforcing that (a canonical-term conformance scan of ES
 * prose against the glossary) needs the glossary's own schema and data, which
 * do not exist yet — `src/content/glossary/` holds only a `.gitkeep`, and
 * T205 is explicitly where "Glossary schema + `check:glossary` real
 * implementation" is scoped (`specs/001-foundation/tasks.md`).
 *
 * This script is a real, wired-in `verify` step per SCF-02 — it is not
 * silently skipped — but its check is honest about what it can enforce today:
 * it confirms there is in fact no glossary content yet (so a future PR that
 * *adds* glossary entries before T205 lands a real scanner gets a loud
 * failure here, not a quiet pass) and exits 0 with an explicit message
 * otherwise.
 *
 * Real implementation path (T205, GLO-01/02/04): once
 * `src/content.config.ts` registers a glossary schema with `canonicalTerm`,
 * `aliases`, and `system`, this script becomes: for every entry in every
 * *other* collection, walk `prose.es` for alias occurrences and fail naming
 * the entry, field, and the canonical term the alias should have been.
 *
 * Usage: node scripts/check-glossary.mjs
 *
 * refs specs/001-foundation (SCF-02, GLO-01, GLO-02, GLO-04)
 */
import { CONTENT_ROOT, loadContentEntries } from "./lib/content-entries.mjs";

const STUB_MESSAGE = "no glossary collection yet (T205)";

/**
 * `entries` — every entry across every `src/content/<collection>` directory.
 * Returns a list naming any glossary entry found, since none should exist
 * until T205 registers the real schema and scanner.
 */
export function findPrematureGlossaryEntries(entries) {
  return entries
    .filter((entry) => entry.collection === "glossary")
    .map(
      (entry) =>
        `${entry.file}: a glossary entry exists but T205 has not landed the ` +
        `real \`check:glossary\` scanner yet — either revert this entry until ` +
        `T205, or implement T205 alongside it (a stub cannot validate ` +
        `canonical-term conformance).`
    );
}

async function main() {
  const entries = await loadContentEntries(CONTENT_ROOT);
  const problems = findPrematureGlossaryEntries(entries);

  if (problems.length > 0) {
    console.error(`check:glossary — ${problems.length} problem(s):`);
    for (const problem of problems) console.error(`  • ${problem}`);
    process.exitCode = 1;
    return;
  }

  console.log(
    `check:glossary — ${STUB_MESSAGE}: skipping the canonical-term scan.`
  );
}

if (
  process.argv[1] &&
  new URL(process.argv[1], "file://").pathname ===
    new URL(import.meta.url).pathname
) {
  await main();
}
