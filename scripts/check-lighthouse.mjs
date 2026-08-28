/**
 * `test:lighthouse` — SCF-06's score budgets, enforced in CI.
 *
 * > THE site SHALL meet a Lighthouse accessibility score ≥ 95 and performance
 * > ≥ 90 on the home page and one representative content page per collection,
 * > enforced as a CI budget.
 *
 * Runs Lighthouse's own library against the built site (served at its real
 * `base` by `scripts/serve-dist.mjs`) and fails when a category falls under
 * `BUDGETS`. Default — i.e. *mobile* — emulation and throttling: plan.md is
 * mobile-first, and a desktop-emulated run would report a number no visitor
 * on a phone in a parking lot with a dead Montero will ever see.
 *
 * ## Why the library and not `@lhci/cli`
 *
 * `lhci` adds a server, a build-context model and a config file that has to
 * restate the audited URLs as literals — and this repo derives every served
 * path from `astro.config.mjs` on purpose (`scripts/lib/audit-targets.mjs`),
 * so a second hard-coded copy of `/monterogarage/en/` in a `.lighthouserc`
 * is exactly the drift `check:hreflang` was written to prevent. The part of
 * `lhci` this spec actually asks for is the assertion step, which is the
 * `BUDGETS` table below.
 *
 * Usage: node scripts/check-lighthouse.mjs [--dist dist]
 *
 * refs specs/001-foundation (SCF-03, SCF-06)
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import * as chromeLauncher from "chrome-launcher";
import lighthouse from "lighthouse";

import {
  REPO_ROOT,
  auditTargets,
  builtServedPaths,
  resolveChromePath,
  readSiteConfig,
} from "./lib/audit-targets.mjs";
import { startServer } from "./serve-dist.mjs";

/** SCF-06, verbatim. Raising these is a spec change; lowering one is a defect. */
export const BUDGETS = Object.freeze({
  accessibility: 0.95,
  performance: 0.9,
});

/** `0.97` → `"97"`, the way Lighthouse reports a score to a human. */
export function formatScore(score) {
  return score === null || score === undefined
    ? "n/a"
    : String(Math.round(score * 100));
}

/**
 * Compare one run's categories against `BUDGETS`.
 *
 * @returns {{ category: string, score: number|null, budget: number }[]} the
 *   categories that missed, empty when the page is within budget.
 */
export function budgetFailures(categories, budgets = BUDGETS) {
  const failures = [];
  for (const [category, budget] of Object.entries(budgets)) {
    const score = categories?.[category]?.score ?? null;
    // A category that did not run is a failure, not a pass by absence.
    if (score === null || score < budget) {
      failures.push({ category, score, budget });
    }
  }
  return failures;
}

async function runLighthouse(url, { chromePath }) {
  const chrome = await chromeLauncher.launch({
    chromePath,
    // `--no-sandbox` is required inside the GitHub Actions container and is
    // safe here: the only pages this browser loads are files this repository
    // just built, served from localhost.
    chromeFlags: ["--headless=new", "--no-sandbox", "--disable-dev-shm-usage"],
  });
  try {
    const result = await lighthouse(
      url,
      { port: chrome.port, output: "json", logLevel: "error" },
      undefined
    );
    if (!result?.lhr)
      throw new Error(`Lighthouse returned no report for ${url}`);
    return result.lhr;
  } finally {
    chrome.kill();
  }
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
      `test:lighthouse — ${path.relative(REPO_ROOT, distDir)} does not exist; run \`astro build\` first.`
    );
    process.exitCode = 1;
    return;
  }

  const { base, locales } = await readSiteConfig();
  const chromePath = resolveChromePath();
  const builtPaths = await builtServedPaths({ distDir, base });
  const { lighthouse: paths } = auditTargets({ base, locales, builtPaths });

  const server = await startServer({ distDir, base });
  const missed = [];

  try {
    for (const served of paths) {
      const url = `${server.origin}${served}`;
      const lhr = await runLighthouse(url, { chromePath });
      const scores = Object.keys(BUDGETS)
        .map(
          (category) =>
            `${category} ${formatScore(lhr.categories?.[category]?.score)}` +
            `/${formatScore(BUDGETS[category])}`
        )
        .join(", ");
      const failures = budgetFailures(lhr.categories);

      if (failures.length === 0) {
        console.log(`test:lighthouse — OK ${served} (${scores})`);
      } else {
        console.error(
          `test:lighthouse — under budget on ${served} (${scores}):`
        );
        for (const failure of failures) {
          console.error(
            `  • ${failure.category}: ${formatScore(failure.score)} < ${formatScore(failure.budget)}`
          );
        }
        missed.push(served);
      }
    }
  } finally {
    await server.close();
  }

  if (missed.length > 0) {
    console.error(
      `test:lighthouse — FAILED: ${missed.length} page(s) under the SCF-06 budget: ${missed.join(", ")}.`
    );
    process.exitCode = 1;
    return;
  }
  console.log(
    `test:lighthouse — OK: ${paths.length} page(s) at or above accessibility ` +
      `${formatScore(BUDGETS.accessibility)} / performance ${formatScore(BUDGETS.performance)}.`
  );
}

if (
  process.argv[1] &&
  pathToFileURL(process.argv[1]).href === import.meta.url
) {
  await main();
}
