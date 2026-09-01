/**
 * Playwright — the constitution's e2e slot, filled (T204).
 *
 * AGENTS.md has named Playwright as this project's e2e tool since phase 0, and
 * `npm run test:e2e` has been documented-but-unimplemented ever since. The
 * T106 review made filling it the job of the first browser-level UI task,
 * which is this one: the vehicle selector's whole promise — "persists across
 * pages and locales" (FIT-03) — is a claim about `localStorage`, navigation
 * and two `<script>` bundles that do not share an instance. There is no way to
 * grade that without a browser, and no way to fake it that would have caught
 * the bugs it is there to catch.
 *
 * ## What belongs here, and what does not
 *
 * Very little. Every rule the site applies is a pure function with unit tests
 * — `matchesVehicle`, `matchesCommunityFilter`, `parseVehicleSelection` — and
 * the markup contracts that fit in rendered HTML are graded through Astro's
 * container API in `tests/locale-switcher.test.ts`, which runs inside
 * `vitest` with no browser, no server and no download. A browser is slow, and
 * a slow gate is a gate people learn to skip.
 *
 * So this suite covers exactly the behaviour that only a real browser has:
 * storage that outlives a navigation, a document that arrives with no
 * JavaScript, and a locale switch that has to land on the *same page* in the
 * other language. Anything provable without a browser is proved without one.
 *
 * ## The browser is the one already installed
 *
 * Nothing here downloads a browser, for the same reason `.puppeteerrc.cjs`
 * turns off Puppeteer's: the CI image already ships Chrome at
 * `/usr/bin/google-chrome`, the audits already drive it through
 * `resolveChromePath()`, and a second private ~150 MB Chromium per install
 * would make this gate the slowest thing in the pipeline. `resolveChromePath`
 * throws with the fix in the message if no Chrome is found, so a missing
 * browser is a sentence rather than a mystery.
 *
 * Because the browser is stock Chrome rather than Playwright's bundled build,
 * this suite is Chromium-only by construction. That is the honest scope: it
 * grades *our* logic, not cross-browser rendering.
 *
 * refs specs/001-foundation (FIT-03, I18N-01, I18N-03, SCF-03)
 */
import { defineConfig, devices } from "@playwright/test";

import { resolveChromePath } from "./scripts/lib/audit-targets.mjs";

/**
 * A fixed port, unlike the audits' port-0 negotiation, because Playwright's
 * `webServer` has to know the URL before the server starts. Overridable so a
 * busy machine is a one-variable fix rather than a config edit.
 */
const PORT = Number(process.env["E2E_PORT"] ?? 4322);
const BASE_URL = `http://127.0.0.1:${PORT}`;

/**
 * Which `dist` directory (`dist/` or `dist-configured/`) this run serves.
 * Defaults to the plain, env-less build every other e2e spec here has always
 * run against. `tests/e2e/garage-unreachable.spec.ts` needs the *configured*
 * build instead — see that file's header for why the garage page only
 * renders its real app, and only then fetches its Supabase client chunk, once
 * `PUBLIC_SUPABASE_URL`/`PUBLIC_SUPABASE_ANON_KEY` were set at build time.
 * `ci.yml` points this at `dist-configured/` for that one spec.
 */
const DIST_DIR = process.env["E2E_DIST"] ?? "dist";

export default defineConfig({
  testDir: "./tests/e2e",
  /*
   * Serial, and one retry in CI only. These tests share one `localStorage`
   * origin, which is the very thing under test; running them in parallel
   * would have them overwrite each other's vehicle. `test.beforeEach` clears
   * it, but a single worker is what makes that guarantee rather than a hope.
   */
  workers: 1,
  fullyParallel: false,
  forbidOnly: Boolean(process.env["CI"]),
  retries: process.env["CI"] ? 1 : 0,
  reporter: process.env["CI"] ? "line" : "list",
  timeout: 30_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
  },

  projects: [
    {
      name: "chrome",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: {
          executablePath: resolveChromePath(),
          // Required inside the GitHub Actions container, harmless locally —
          // the same flag, for the same reason, as `scripts/check-a11y.mjs`.
          args: ["--no-sandbox"],
        },
      },
    },
  ],

  /*
   * The same static server the a11y and Lighthouse gates use, so all three
   * grade the identical artifact: `DIST_DIR` mounted at the site's configured
   * `base`. `npm run test:e2e` builds first, so the server always has
   * something to serve.
   */
  webServer: {
    command: `node scripts/serve-dist.mjs --port ${PORT} --dist ${DIST_DIR}`,
    url: `${BASE_URL}/en/`,
    reuseExistingServer: !process.env["CI"],
    timeout: 60_000,
  },
});
