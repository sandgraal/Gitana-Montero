/**
 * Shared inputs for the two post-build audits CI runs on the built site:
 * `scripts/check-a11y.mjs` (Pa11y, AGENTS.md's named a11y tool) and
 * `scripts/check-lighthouse.mjs` (SCF-06's score budgets).
 *
 * Everything here is *derived*, never restated: the served paths come from
 * `astro.config.mjs` (`base`, `i18n.locales`) through
 * `scripts/check-hreflang.mjs`'s `readAstroConfig`, so adding a locale or
 * moving the deploy path cannot leave a stale copy of the audit list behind —
 * the same rule `check:hreflang` already follows.
 *
 * ## Which pages are audited, and why only these
 *
 * SCF-06: "the home page and one representative content page per collection".
 * Both audits call `builtServedPaths()` on `dist/` and feed the result to
 * `auditTargets()`, so the per-collection representatives appear in the target
 * set the moment a collection has a page — no edit to either script, and
 * never a URL that was not actually built. Today that set is the two locale
 * homes, the 404, and the glossary index in each locale (T205); the remaining
 * collections have no page yet.
 *
 * - **`/<locale>/` (both locales, a11y + Lighthouse).** The home page SCF-06
 *   names, once per locale: `/es/` is not a translation of an audited page,
 *   it is an audited page (I18N-01, equal footing).
 * - **`/404.html` (a11y only).** I18N-08 makes the error page real localized
 *   UI, so it gets the same rule-level a11y sweep. It is left out of the
 *   Lighthouse budget because a 404 is not a page a visitor loads on purpose;
 *   its performance number would be a metric nobody acts on.
 * - **`/` (neither).** The root shim is a locale *decision*, not a page: it
 *   redirects via JS on load, so an audit of it audits `/en/` a second time
 *   under a misleading label. Its markup contract (the locale links and their
 *   `data-locale-choice` attributes) is graded by
 *   `tests/locale-switcher.test.ts` instead, which is where a redirect page's
 *   behaviour can actually be asserted.
 * - **One page per collection per locale (a11y + Lighthouse)**, chosen by
 *   `collectionSampleTargets` from what `dist/` actually contains: the
 *   collection's first entry page, or its index page when the collection has
 *   no entry pages (the glossary, GLO-04).
 *
 * refs specs/001-foundation (SCF-03, SCF-06)
 */
import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { readAstroConfig } from "../check-hreflang.mjs";

export const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  ".."
);

/** `"/monterogarage"` — no trailing slash, `""` when the site is at root. */
export function normalizeBase(base) {
  const trimmed = String(base ?? "")
    .trim()
    .replace(/\/+$/, "");
  if (trimmed === "") return "";
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

/**
 * Every page `astro build` wrote, as the path it is *served* at.
 *
 * The audits derive their per-collection samples from this rather than from
 * the content collections, for the same reason `check:hreflang` walks `dist/`:
 * a page that failed to build is a page that cannot be audited, and inventing
 * its URL would fail the audit for the wrong reason.
 *
 * @returns {Promise<string[]>} sorted served paths, e.g. `/monterogarage/en/`
 */
export async function builtServedPaths({ distDir, base }) {
  const prefix = normalizeBase(base);

  async function walk(dir) {
    const found = [];
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) found.push(...(await walk(full)));
      else if (entry.isFile() && entry.name.endsWith(".html")) found.push(full);
    }
    return found;
  }

  if (!existsSync(distDir)) return [];

  const files = await walk(distDir);
  return files
    .map((file) => {
      const relative = path.relative(distDir, file).split(path.sep).join("/");
      // `en/index.html` is served at `/en/`; `404.html` stays `404.html`.
      return `${prefix}/${relative.replace(/(^|\/)index\.html$/, "$1")}`;
    })
    .sort();
}

/**
 * Served paths audited by Pa11y and by the Lighthouse budgets.
 *
 * `builtPaths` is what `builtServedPaths()` found in `dist/`; passing it is
 * what turns SCF-06's "one representative content page per collection" on.
 * It defaults to `[]` so the locale homes are still audited if a caller has
 * no build listing — never the other way round, because an empty target set
 * is an audit that passes by auditing nothing.
 *
 * @param {{ base: string, locales: readonly string[], builtPaths?: readonly string[] }} config
 * @returns {{ a11y: string[], lighthouse: string[] }}
 */
export function auditTargets({ base, locales, builtPaths = [] }) {
  const prefix = normalizeBase(base);
  const homes = locales.map((locale) => `${prefix}/${locale}/`);
  const samples = collectionSampleTargets(builtPaths, { base, locales });
  return {
    a11y: [...homes, `${prefix}/404.html`, ...samples],
    lighthouse: [...homes, ...samples],
  };
}

/**
 * The per-collection representative pages SCF-06 asks for: the first built
 * page of each `<locale>/<collection>` pair, in path order.
 *
 * Returns `[]` while every collection is empty, which is the state today —
 * but it is wired into `auditTargets()`, so when a phase-2+ task builds the
 * first `/en/problems/<slug>/` page both audits pick it up with no edit to
 * either script. `entryPaths` is the built page list from `dist/`
 * (`builtServedPaths`), so this never guesses a URL that was not built.
 *
 * "First in path order" is a deliberate, boring rule: the sample has to be
 * stable across runs or a budget regression looks like a flake.
 *
 * ## Entry page preferred, collection index as the fallback (T205)
 *
 * A collection whose only page is its index — the glossary is the first, and
 * GLO-04 asks for exactly one page, not one per term — would otherwise be
 * audited by nothing at all, because `/<locale>/glossary/` is two segments
 * deep and the entry-page rule wants three. That is a silent hole in SCF-06:
 * the requirement is "one representative content page per collection", and
 * when a collection has no entry pages, its index *is* the representative
 * page. So each `<locale>/<collection>` pair resolves to its first entry page
 * if it has one and to its index otherwise — never to both, so the audit
 * budget still grows by one page per collection per locale.
 *
 * @param {readonly string[]} entryPaths served paths that exist in `dist/`
 * @param {{ base: string, locales: readonly string[] }} config
 * @returns {string[]}
 */
export function collectionSampleTargets(entryPaths, { base, locales }) {
  const prefix = normalizeBase(base);
  const localeHomes = new Set(locales.map((locale) => `${prefix}/${locale}/`));
  /** `locale/collection -> first entry page`, the preferred sample. */
  const byCollection = new Map();
  /** `locale/collection -> its index page`, used only when there is no entry. */
  const indexes = new Map();

  // Sorted here, not assumed sorted: "first per collection" is only stable if
  // the input order is.
  for (const served of [...entryPaths].sort()) {
    if (localeHomes.has(served)) continue;
    const rest =
      prefix && served.startsWith(prefix)
        ? served.slice(prefix.length)
        : served;
    const segments = rest.split("/").filter(Boolean);
    // `/<base>/<locale>/<collection>/` is the section index;
    // `/<base>/<locale>/<collection>/<slug>/` is a content page.
    if (segments.length < 2) continue;
    const [locale, collection] = segments;
    if (!locales.includes(locale)) continue;
    const key = `${locale}/${collection}`;

    if (segments.length === 2) {
      if (!indexes.has(key)) indexes.set(key, served);
      continue;
    }
    if (byCollection.has(key)) continue;
    byCollection.set(key, served);
  }

  for (const [key, served] of indexes) {
    if (!byCollection.has(key)) byCollection.set(key, served);
  }

  return [...byCollection.values()].sort();
}

/**
 * Where Chrome is. Both audits drive a real browser, and neither downloads
 * one: `.puppeteerrc.cjs` disables Puppeteer's bundled-Chromium download so
 * the install is the same size (and the same speed) on every machine and in
 * CI, and both tools are pointed at a Chrome that is already there — the
 * runner image's `/usr/bin/google-chrome` in CI, the installed browser
 * locally.
 *
 * Throws with the fix in the message rather than falling back to a headless
 * shell that scores differently from the browser the budgets were set with.
 */
export function resolveChromePath(env = process.env) {
  const explicit = env.PUPPETEER_EXECUTABLE_PATH || env.CHROME_PATH;
  if (explicit) {
    if (!existsSync(explicit)) {
      throw new Error(
        `Chrome not found at ${explicit} (from ` +
          `${env.PUPPETEER_EXECUTABLE_PATH ? "PUPPETEER_EXECUTABLE_PATH" : "CHROME_PATH"}).`
      );
    }
    return explicit;
  }

  const candidates = [
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }

  throw new Error(
    "No Chrome executable found. Set CHROME_PATH (or " +
      "PUPPETEER_EXECUTABLE_PATH) to an installed Chrome/Chromium binary. " +
      "Tried: " +
      candidates.join(", ")
  );
}

/** `{ site, base, locales }` from `astro.config.mjs`. */
export async function readSiteConfig() {
  return readAstroConfig(path.join(REPO_ROOT, "astro.config.mjs"));
}
