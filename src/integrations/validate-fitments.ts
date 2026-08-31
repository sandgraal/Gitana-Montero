/**
 * FIT-02 on the real build path.
 *
 * > **FIT-02** WHEN an entry declares a fitment, THE build SHALL resolve it
 * > against the taxonomy and fail on any reference to a nonexistent ID or an
 * > impossible combination (per VEH-03).
 *
 * "THE build SHALL" is the whole requirement: `validateEntryFitments` being
 * correct and unit-tested proves nothing about the site if nothing calls it
 * before `dist/` is written. This integration is the call. A bogus fitment
 * fails `npm run build` — and therefore `npm run verify` and CI — with a
 * message naming the file, the entry and the field (SCF-04).
 *
 * ## Why an integration and not a `check:*` script
 *
 * Every other merge-blocking check in this repo is a plain-Node script under
 * `scripts/`, and this one deliberately is not. Those scripts read content as
 * *text*; this check has to run the real resolver, which lives in TypeScript
 * and imports the real schemas (FIT-01: the fitment engine is "the only code
 * that interprets fitment queries"). Re-implementing it in `.mjs` would be a
 * second interpreter of fitment queries, which is exactly what FIT-01
 * forbids. Astro's config pipeline compiles TypeScript, so the integration
 * runs the same module the unit tests grade — one implementation, two callers.
 *
 * ## Why `astro:build:start`
 *
 * It is the first hook of a build and it runs before any page is rendered, so
 * a bad fitment fails fast rather than after two minutes of page generation.
 * It deliberately does **not** run in `astro dev`: an author mid-edit should
 * get a broken page, not a dead dev server, and the same check gates every
 * commit through `npm run verify`.
 *
 * ## Why `astro.config.mjs` imports this module *lazily*
 *
 * `scripts/check-hreflang.mjs` and `scripts/lib/audit-targets.mjs` import
 * `astro.config.mjs` under **bare Node**, with no bundler, to read `site`,
 * `base` and `i18n.locales`. Bare Node cannot resolve the extensionless
 * specifiers this module and its imports use (the same constraint
 * `scripts/lib/content-entries.mjs` documents), so a top-level import here
 * would break `check:hreflang` — the config would stop being loadable outside
 * Astro. The config therefore declares a thin integration whose hook body
 * `await import()`s this module, which only ever executes inside a real build,
 * where Vite is doing the resolving.
 *
 * refs specs/001-foundation (FIT-01, FIT-02, SCF-04)
 */
import type { AstroIntegrationLogger } from "astro";
import {
  FitmentResolutionError,
  assertFitmentsResolve,
  buildTaxonomy,
} from "../lib/fitment/index.ts";
import { loadContent, type LoadedEntry } from "../lib/fitment/content.ts";

/**
 * `assertFitmentsResolve` names the entry by id, which is all it can do — it
 * is given entry objects, not paths. SCF-04 asks for the *file*, so the build
 * caller adds what only it knows: which file each failing id came from.
 *
 * Matched on the error's structured `issues` and by exact id equality, never
 * on the rendered message. Substring-matching ids against the message looks
 * equivalent and is not: the market entry `me` matches the word "names".
 *
 * Appended rather than woven in, so the resolver's own message — the part the
 * unit tests grade — reaches the developer verbatim.
 */
function withFileIndex(error: unknown, entries: readonly LoadedEntry[]): Error {
  if (!(error instanceof FitmentResolutionError)) {
    return error instanceof Error ? error : new Error(String(error));
  }

  const failing = new Set(error.issues.map((issue) => issue.entryId));
  const named = entries.flatMap((entry) => {
    const { id } = (entry.data ?? {}) as { id?: unknown };
    return typeof id === "string" && failing.has(id)
      ? [`  ${id} → ${entry.file}`]
      : [];
  });

  if (named.length === 0) return error;

  const augmented = new Error(
    `${error.message}\n\nThe entries named above live in:\n${named.join("\n")}`
  );
  augmented.stack = error.stack;
  return augmented;
}

/**
 * The `astro:build:start` hook body, called by the integration declared in
 * `astro.config.mjs`. Exported as a plain function rather than as an
 * `AstroIntegration` factory so the config can reach it through one lazy
 * `await import()` — see the module docstring.
 *
 * `contentRoot` defaults to the real `src/content/` and exists so the graders
 * in `tests/lib/fitment/build-path.test.ts` can run this exact function over a
 * deliberately broken corpus. Without it the only reachable outcome would be
 * "today's content passes", which is a test that cannot fail: `withFileIndex`
 * and the throw path would have no coverage at all.
 */
export async function runFitmentBuildCheck(
  {
    logger,
  }: {
    logger: Pick<AstroIntegrationLogger, "info">;
  },
  contentRoot?: string
): Promise<void> {
  const { entries, taxonomyEntries } = await loadContent(contentRoot);
  const taxonomy = buildTaxonomy(taxonomyEntries);

  try {
    // Throws on the first build that carries a bad fitment, listing every
    // issue rather than the first — one pass per fix.
    assertFitmentsResolve(
      entries.map((entry) => entry.data),
      taxonomy
    );
  } catch (error) {
    throw withFileIndex(error, entries);
  }

  logger.info(
    `${entries.length} fitments resolve against ` +
      `${taxonomyEntries.length} taxonomy entries (FIT-02)`
  );
}
