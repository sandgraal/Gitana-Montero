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
 * Every content collection is empty today (T104 registered the schemas; the
 * phase-2+ content tasks fill them), so the only pages that exist are the two
 * locale homes, the root redirect shim and the 404. The per-collection
 * representatives are added by `collectionSampleTargets` as soon as a
 * collection has a page to sample — see that function.
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
 *
 * refs specs/001-foundation (SCF-03, SCF-06)
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { readAstroConfig } from "../check-hreflang.mjs";

export const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  ".."
);

/** `"/Gitana-Montero"` — no trailing slash, `""` when the site is at root. */
export function normalizeBase(base) {
  const trimmed = String(base ?? "")
    .trim()
    .replace(/\/+$/, "");
  if (trimmed === "") return "";
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

/**
 * Served paths audited by Pa11y and by the Lighthouse budgets.
 *
 * @param {{ base: string, locales: readonly string[] }} config
 * @returns {{ a11y: string[], lighthouse: string[] }}
 */
export function auditTargets({ base, locales }) {
  const prefix = normalizeBase(base);
  const homes = locales.map((locale) => `${prefix}/${locale}/`);
  return {
    a11y: [...homes, `${prefix}/404.html`],
    lighthouse: [...homes],
  };
}

/**
 * The per-collection representative pages SCF-06 asks for, once collections
 * have pages to sample.
 *
 * Deliberately a stub returning `[]` with the reason attached rather than a
 * silent omission: when a phase-2+ task adds the first `/en/<collection>/…`
 * route, it extends this one function and both audits pick the page up
 * without either script changing. `entryPaths` is the built page list a
 * caller already has (from `dist/`), so this never guesses a URL that was
 * not built.
 *
 * @param {readonly string[]} entryPaths served paths that exist in `dist/`
 * @param {{ base: string, locales: readonly string[] }} config
 * @returns {string[]}
 */
export function collectionSampleTargets(entryPaths, { base, locales }) {
  const prefix = normalizeBase(base);
  const localeHomes = new Set(locales.map((locale) => `${prefix}/${locale}/`));
  const byCollection = new Map();

  for (const served of entryPaths) {
    if (localeHomes.has(served)) continue;
    // `/<base>/<locale>/<collection>/<slug>/` — anything shallower is a
    // section index, not a content page.
    const rest =
      prefix && served.startsWith(prefix)
        ? served.slice(prefix.length)
        : served;
    const segments = rest.split("/").filter(Boolean);
    if (segments.length < 3) continue;
    const [locale, collection] = segments;
    if (!locales.includes(locale)) continue;
    const key = `${locale}/${collection}`;
    if (byCollection.has(key)) continue;
    byCollection.set(key, served);
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
