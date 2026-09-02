/**
 * Page discovery by glob, for graders written *before* the page exists.
 *
 * ## Why a glob and not an import specifier
 *
 * A grader for a page T502 has not written yet cannot `import` it: a missing
 * specifier is a `astro check` error and a Vitest *collection* error, which
 * looks nothing like an expected failure and stops the file from running at
 * all. `import.meta.glob` is statically analysable, so Vite is happy with a
 * pattern that currently matches four pages and will match six later — and the
 * matched module is compiled through Astro's plugin exactly like a direct
 * import, which a `@vite-ignore` dynamic import would not be.
 *
 * ## The one convention this relies on (say so out loud)
 *
 * `.claude/GRADER-PRINCIPLES.md`: *a "known-pages" sweep is only as complete as
 * its list*. This is the mirror image — a sweep with no list, which instead
 * depends on a **naming convention**: a procedures page is a `.astro` file
 * under `src/pages/` whose path contains `procedure` (any case), and the
 * per-entry *detail* page is the one whose file name names a slug parameter,
 * as `[locale]/[partsSegment]/[partSlug].astro` does for T501.
 *
 * If T502 names its page something else, {@link findProcedureDetailPage}
 * returns `null` and the render graders fail with a message saying exactly
 * that — a loud, one-line fix (rename, or widen the pattern here), never a
 * silent pass. The failure mode this rules out is the expensive one: a grader
 * that quietly matches nothing and reports green.
 *
 * refs specs/001-foundation (PRC-02), .claude/GRADER-PRINCIPLES.md
 */

/**
 * Every Astro page in the repo, keyed by its root-relative path.
 *
 * Root-relative (`/src/pages/…`) rather than test-relative so the keys read
 * the same from `tests/` and from `tests/pages/`, and so the pattern does not
 * silently change meaning if a grader moves.
 */
export const PAGE_MODULES: Record<string, () => Promise<unknown>> =
  import.meta.glob("/src/pages/**/*.astro");

/** Page paths matching `pattern`, sorted, so a failure message is stable. */
export function pageKeysMatching(pattern: RegExp): string[] {
  return Object.keys(PAGE_MODULES)
    .filter((key) => pattern.test(key))
    .sort();
}

/** The convention: a procedures page names the collection in its path. */
export const PROCEDURE_PAGE_PATTERN = /procedure/i;

/**
 * A per-entry detail page names a **slug** parameter in its own file name —
 * `[problemSlug].astro`, `[partSlug].astro`. An index page names a *segment*
 * (`[partsSegment].astro`). That is the whole discriminator.
 */
function isDetailPageKey(key: string): boolean {
  const fileName = key.slice(key.lastIndexOf("/") + 1);
  return /slug/i.test(fileName);
}

export interface DiscoveredPage {
  readonly key: string;
  readonly load: () => Promise<unknown>;
}

function discover(pattern: RegExp, detail: boolean): DiscoveredPage | null {
  const keys = pageKeysMatching(pattern).filter(
    (key) => isDetailPageKey(key) === detail
  );
  const key = keys[0];
  if (key === undefined) return null;
  const load = PAGE_MODULES[key];
  if (load === undefined) return null;
  return { key, load };
}

/** The procedures **detail** page, or `null` while nobody has written one. */
export function findProcedureDetailPage(): DiscoveredPage | null {
  return discover(PROCEDURE_PAGE_PATTERN, true);
}

/** The procedures **index** page, or `null` while nobody has written one. */
export function findProcedureIndexPage(): DiscoveredPage | null {
  return discover(PROCEDURE_PAGE_PATTERN, false);
}

/**
 * The page's default export, or a thrown error that says *which* convention
 * was not met — never `undefined` flowing on into a render call, where it
 * would surface as an unrelated Astro error.
 */
export async function loadPageComponent(
  page: DiscoveredPage | null,
  what: string
): Promise<unknown> {
  if (page === null) {
    throw new Error(
      `no ${what} found under src/pages/ (looked for a .astro path matching ` +
        `${PROCEDURE_PAGE_PATTERN}). T502 has not written it yet, or it is ` +
        `named in a way tests/helpers/page-modules.ts does not recognise — ` +
        `see that file's header. Known pages: ` +
        `${Object.keys(PAGE_MODULES).sort().join(", ")}`
    );
  }

  const module = (await page.load()) as { default?: unknown };
  if (module.default === undefined) {
    throw new Error(`${page.key} has no default export to render`);
  }
  return module.default;
}
