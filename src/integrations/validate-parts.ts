/**
 * PRT-02 and PRT-03 on the real build path.
 *
 * > **PRT-03** IF two parts entries claim the same OEM number with conflicting
 * > fitment, THEN THE build SHALL fail.
 *
 * "THE build SHALL fail" is the whole requirement. `findPartIssues` being
 * correct and unit-tested proves nothing about the site if nothing calls it
 * before `dist/` is written; this integration is the call. A duplicated OEM
 * number, a supersession pointer that resolves to nothing, a supersession
 * loop, or a vendor id that names no seller fails `npm run build` — and
 * therefore `npm run verify` and CI — with a message naming **every file
 * involved**, not just an entry id (SCF-04).
 *
 * The naming matters more here than anywhere else in the repo: a duplicate-OEM
 * failure is by definition about two files, and an error that names one of
 * them sends the author to the file that is probably correct.
 *
 * ## Why an integration and not a `check:*` script
 *
 * The same division `src/integrations/validate-fitments.ts` records for
 * FIT-02, for the same reason. The rules are TypeScript that the unit tests
 * grade directly (`tests/lib/parts/parts-graph.test.ts`); re-implementing them
 * in a plain-Node `.mjs` script would be a second implementation of "is this
 * OEM number unique", and the second one is always the one that drifts.
 *
 * ## Why `astro:build:start`, and the `.ts` specifiers
 *
 * Both verbatim from the FIT-02 hook: it is the first hook of a build so a bad
 * corpus fails fast rather than after two minutes of page generation, it
 * deliberately does not run in `astro dev` (an author mid-edit should get a
 * broken page, not a dead dev server), and every import along this module's
 * chain carries its `.ts` extension because Astro resolves a hook's dynamic
 * import through Node's own ESM resolver rather than through Vite. That is
 * also why `src/lib/parts/part-numbers.ts` exists as its own dependency-free
 * module — see its docstring.
 *
 * ## The slug half (I18N-05)
 *
 * Checked here too, and for the same "the build is where it counts" reason: a
 * parts entry with no row in `src/i18n/entry-slugs.ts` is a page that was
 * never built, and a row naming no entry is a URL that 404s. Neither is
 * visible to `validateSlugRegistry`, which can only see the registry — it
 * cannot see the corpus. Only a build can compare the two.
 *
 * refs specs/001-foundation (PRT-01, PRT-02, PRT-03, I18N-05, SCF-04)
 */
import type { AstroIntegrationLogger } from "astro";
import {
  PartsResolutionError,
  assertPartsResolve,
  readParts,
  readSellers,
  type PartIssue,
} from "../lib/parts/index.ts";
import { loadContent, type LoadedEntry } from "../lib/fitment/content.ts";
import { slugRegistryIds } from "../i18n/entry-slugs.ts";

/** The collection this check is about, and the one it reads vendors from. */
const PARTS_COLLECTION = "parts";
const COMMUNITY_COLLECTION = "community";

/**
 * `findPartIssues` names entries by id, which is all it can do — it is given
 * entry objects, not paths. SCF-04 asks for the *file*, so the build caller
 * adds what only it knows.
 *
 * Every id an issue mentions is listed, `entryId` and `relatedEntryIds`
 * together, because the duplicate-OEM case is precisely the one where naming
 * a single file is worse than useless. Matched by exact id equality, never by
 * substring-matching the rendered message — the trap
 * `validate-fitments.ts` records (the market id `me` matches the word
 * "names").
 */
function withFileIndex(error: unknown, entries: readonly LoadedEntry[]): Error {
  if (!(error instanceof PartsResolutionError)) {
    return error instanceof Error ? error : new Error(String(error));
  }

  /**
   * `id -> every file that declares it`, not just the first (PR #75,
   * r3910083212).
   *
   * The first version kept one file per id, which is wrong for exactly the
   * issue that most needs the information: a `duplicate-entry-id` failure is
   * *by definition* about two or more files sharing one id, and a report that
   * named only the first one sent the author to the file that is as likely as
   * not the correct one. One id can legitimately map to several files here —
   * that is the bug being reported, so the index has to be able to represent
   * it.
   */
  const filesById = new Map<string, string[]>();
  for (const entry of entries) {
    const { id } = (entry.data ?? {}) as { id?: unknown };
    if (typeof id !== "string") continue;
    const files = filesById.get(id) ?? [];
    files.push(entry.file);
    filesById.set(id, files);
  }

  const mentioned = (issue: PartIssue): string[] => [
    issue.entryId,
    ...issue.relatedEntryIds,
  ];

  const named = [...new Set(error.issues.flatMap(mentioned))]
    .sort()
    .flatMap((id) =>
      [...(filesById.get(id) ?? [])].sort().map((file) => `  ${id} → ${file}`)
    );

  if (named.length === 0) return error;

  const augmented = new Error(
    `${error.message}\n\nThe entries named above live in:\n${named.join("\n")}`
  );
  augmented.stack = error.stack;
  return augmented;
}

/**
 * I18N-05's corpus half: registry and content agree about which parts pages
 * exist. Returns the problems rather than throwing, so one build reports all
 * of them.
 */
function slugCoverageProblems(entries: readonly LoadedEntry[]): string[] {
  const entryIds = entries.flatMap((entry) => {
    const { id } = (entry.data ?? {}) as { id?: unknown };
    return typeof id === "string" ? [{ id, file: entry.file }] : [];
  });

  const registered = new Set(slugRegistryIds(PARTS_COLLECTION));
  const present = new Set(entryIds.map((entry) => entry.id));

  const missing = entryIds
    .filter((entry) => !registered.has(entry.id))
    .map(
      (entry) =>
        `${entry.file}: entry \`${entry.id}\` has no row in ENTRY_SLUGS.parts ` +
        `(src/i18n/entry-slugs.ts), so no page is built for it in either ` +
        `locale — add \`{ en, es }\` slugs (I18N-05).`
    );

  const orphaned = [...registered]
    .filter((id) => !present.has(id))
    .sort()
    .map(
      (id) =>
        `src/i18n/entry-slugs.ts: ENTRY_SLUGS.parts lists \`${id}\`, and no ` +
        `entry in src/content/parts/ has that id — the row builds a URL that ` +
        `renders nothing (I18N-05).`
    );

  return [...missing, ...orphaned];
}

/**
 * The `astro:build:start` hook body, called by the integration declared in
 * `astro.config.mjs`. Exported as a plain function rather than as an
 * `AstroIntegration` factory so the config can reach it through one lazy
 * `await import()` — see the module docstring and `validate-fitments.ts`.
 *
 * `contentRoot` defaults to the real `src/content/` and exists so graders can
 * run this exact function over a deliberately broken corpus. Without it the
 * only reachable outcome would be "today's content passes", which is a test
 * that cannot fail.
 */
export async function runPartsBuildCheck(
  {
    logger,
  }: {
    logger: Pick<AstroIntegrationLogger, "info">;
  },
  contentRoot?: string
): Promise<void> {
  const { entries } = await loadContent(contentRoot);
  const partEntries = entries.filter(
    (entry) => entry.collection === PARTS_COLLECTION
  );
  const communityEntries = entries.filter(
    (entry) => entry.collection === COMMUNITY_COLLECTION
  );

  const parts = readParts(partEntries.map((entry) => entry.data));
  const sellers = readSellers(communityEntries.map((entry) => entry.data));

  try {
    // Throws on the first build that carries a broken parts graph, listing
    // every issue rather than the first — one pass per fix.
    assertPartsResolve(parts, sellers);
  } catch (error) {
    throw withFileIndex(error, partEntries);
  }

  const slugProblems = slugCoverageProblems(partEntries);
  if (slugProblems.length > 0) {
    throw new Error(
      `${slugProblems.length} parts slug problem(s):\n` +
        slugProblems.map((problem) => `  • ${problem}`).join("\n") +
        `\nrefs specs/001-foundation (I18N-05)`
    );
  }

  logger.info(
    `${parts.length} part number${parts.length === 1 ? " is" : "s are"} ` +
      `unique, every supersession pointer resolves, and every vendor names a ` +
      `seller (PRT-01, PRT-02, PRT-03)`
  );
}
