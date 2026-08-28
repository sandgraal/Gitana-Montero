/**
 * Puppeteer arrives as a Pa11y dependency (`scripts/check-a11y.mjs`). Its
 * postinstall normally downloads a private ~150 MB Chromium into the npm
 * cache — every install, every CI job, on top of a runner image that already
 * ships Chrome.
 *
 * We never use that copy: both audits resolve an installed browser through
 * `resolveChromePath()` in `scripts/lib/audit-targets.mjs`. Skipping the
 * download here makes that explicit and, more importantly, deterministic —
 * npm's `allowScripts` gate already blocks the postinstall on some npm
 * versions and not others, so without this file whether a browser appears at
 * install time depends on which npm the runner happens to ship.
 *
 * refs specs/001-foundation (SCF-03, SCF-06)
 */
module.exports = {
  skipDownload: true,
};
