/**
 * `test:a11y` — the rule-level accessibility sweep SCF-03 makes
 * merge-blocking, run with Pa11y (AGENTS.md's named a11y tool).
 *
 * Two runners, on purpose:
 *
 * - **axe-core** catches the machine-checkable WCAG failures with the lowest
 *   false-positive rate in the industry.
 * - **HTML CodeSniffer** (Pa11y's default) checks WCAG 2.1 AA techniques axe
 *   does not implement, notably some of the structure and language rules that
 *   matter most to a bilingual site: a `lang` attribute that is missing or
 *   disagrees with the text is a *content* bug here, not a lint nit.
 *
 * Only `error`-level issues fail the run. Warnings and notices are printed —
 * they are how a reviewer notices a page drifting — but a check that fails on
 * advisory notices is a check people learn to rerun until it passes.
 *
 * This is the rule-level half of the a11y gate; the *score* half (SCF-06's
 * "accessibility ≥ 95") is `scripts/check-lighthouse.mjs`. Both are needed:
 * a score of 96 can still ship a page with a real WCAG error, and a page with
 * no axe errors can still score below the budget on the checks Lighthouse
 * weights that axe does not run.
 *
 * Usage: node scripts/check-a11y.mjs [--dist dist]
 *
 * refs specs/001-foundation (SCF-03, SCF-06, I18N-08)
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import pa11y from "pa11y";

import {
  REPO_ROOT,
  auditTargets,
  builtServedPaths,
  resolveChromePath,
  readSiteConfig,
} from "./lib/audit-targets.mjs";
import { startServer } from "./serve-dist.mjs";

/** WCAG 2.1 AA — the level this site holds itself to. */
export const STANDARD = "WCAG2AA";

/**
 * Audit one already-served URL.
 *
 * @returns {Promise<{ url: string, errors: object[], advisories: object[] }>}
 */
export async function auditUrl(url, { chromePath, timeout = 60000 } = {}) {
  const results = await pa11y(url, {
    standard: STANDARD,
    runners: ["axe", "htmlcs"],
    includeWarnings: true,
    includeNotices: false,
    timeout,
    chromeLaunchConfig: {
      executablePath: chromePath,
      // `--no-sandbox` is required inside the GitHub Actions container and is
      // safe here: the only pages this browser ever loads are files this
      // repository just built, served from localhost.
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
    },
  });

  const issues = results.issues ?? [];
  return {
    url,
    errors: issues.filter((issue) => issue.type === "error"),
    advisories: issues.filter((issue) => issue.type !== "error"),
  };
}

function describe(issue) {
  const where = issue.selector ? ` at \`${issue.selector}\`` : "";
  return `${issue.code}${where}: ${issue.message}`;
}

async function main() {
  const argv = process.argv.slice(2);
  const distFlag = argv.indexOf("--dist");
  const distDir = path.resolve(
    REPO_ROOT,
    distFlag === -1 ? "dist" : (argv[distFlag + 1] ?? "dist")
  );

  if (!existsSync(distDir)) {
    console.error(
      `test:a11y — ${path.relative(REPO_ROOT, distDir)} does not exist; run \`astro build\` first.`
    );
    process.exitCode = 1;
    return;
  }

  const { base, locales } = await readSiteConfig();
  const chromePath = resolveChromePath();
  const builtPaths = await builtServedPaths({ distDir, base });
  const { a11y: paths } = auditTargets({ base, locales, builtPaths });

  const server = await startServer({ distDir, base });
  let failures = 0;

  try {
    for (const served of paths) {
      const url = `${server.origin}${served}`;
      const { errors, advisories } = await auditUrl(url, { chromePath });

      if (errors.length === 0) {
        console.log(
          `test:a11y — OK ${served} (${STANDARD}, axe + htmlcs)` +
            (advisories.length > 0
              ? ` — ${advisories.length} advisory note(s)`
              : "")
        );
      } else {
        failures += errors.length;
        console.error(`test:a11y — ${errors.length} error(s) on ${served}:`);
        for (const issue of errors) console.error(`  • ${describe(issue)}`);
      }

      for (const issue of advisories) {
        console.log(`  · advisory on ${served}: ${describe(issue)}`);
      }
    }
  } finally {
    await server.close();
  }

  if (failures > 0) {
    console.error(
      `test:a11y — FAILED: ${failures} ${STANDARD} error(s) across ${paths.length} page(s).`
    );
    process.exitCode = 1;
    return;
  }
  console.log(
    `test:a11y — OK: ${paths.length} page(s) clean at ${STANDARD} (axe + htmlcs).`
  );
}

if (
  process.argv[1] &&
  pathToFileURL(process.argv[1]).href === import.meta.url
) {
  await main();
}
