/**
 * The garage's boot-stall fix, in a real browser (T2-301 review F1).
 *
 * `[garageSegment].astro`'s boot chain reads:
 *
 *   currentUserIdIfAny(window)
 *     .then((userId) => (userId === null ? settle(true) : load()))
 *     .catch(() => unreachable());
 *
 * Before that `.catch` existed, a rejected boot promise — the dynamic
 * `import("@supabase/supabase-js")` in `getSupabaseClient()` failing because a
 * deploy rotated the chunk hash under an open tab, the network dropped
 * mid-fetch, or an extension/CSP blocked it — left `data-garage-state="boot"`
 * forever: no garage, no sign-in prompt, nothing to click, in both locales.
 * The fix is one `.catch`; this spec is what makes removing it a red build
 * instead of a silent regression.
 *
 * ## Why this only runs for real against the *configured* build
 *
 * `configured` (the page's own build-time flag, `SUPABASE_BROWSER_CONFIG !==
 * null`) decides which markup `[garageSegment].astro` renders at all: when it
 * is `false` the whole app — gate, boot line, `[data-garage-message]` — is
 * replaced by a single static notice, and the closing script's own guard
 * (`if (root && SUPABASE_BROWSER_CONFIG) enhance(root)`) never runs. So an
 * unconfigured build has nothing here to abort *and* nothing that would ever
 * leave "boot" either way — testing it would be green whether or not the
 * `.catch` existed, forever (see `pageWasBuiltConfigured` below for the one
 * surprising detail: the Supabase chunk itself still gets built on an
 * unconfigured site, because Vite emits every statically-reachable dynamic
 * import as its own chunk regardless of whether the runtime branch that calls
 * it ever executes — so "does the chunk file exist" is not a safe test for
 * "is this build configured", only "was this page's markup rendered
 * configured" is).
 *
 * `ci.yml` builds a second, configured `dist-configured/` for this reason:
 * throwaway-but-syntactically-valid Supabase credentials, so this spec has a
 * real gate, a real boot line and a real chunk fetch to break.
 *
 * ## Locating the chunk to abort
 *
 * `@supabase/supabase-js`'s output chunk is named by content hash
 * (`_astro/dist.<hash>.js`), which changes on every dependency bump. Hard
 * -coding that hash would make this spec rot silently the next time the
 * library updates, so it is found the same way a person would: by grepping
 * the built chunks for `GoTrueClient`, the class the library's own auth
 * client is named after and which appears in no other bundle this site ships.
 *
 * refs specs/002-montero-garage (GAR-01′, ACC-01, MIG-03), T2-301 review F1
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test } from "@playwright/test";

import { t } from "../../src/i18n/ui.ts";

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  ".."
);

/** The `dist` directory this run's `webServer` is actually serving. */
const DIST_DIR = path.resolve(REPO_ROOT, process.env["E2E_DIST"] ?? "dist");

const PAGES = [
  { locale: "en" as const, path: "/en/garage/" },
  { locale: "es" as const, path: "/es/taller/" },
];

/**
 * `true` when `path`'s *built HTML* rendered the configured garage app
 * rather than the "accounts are not switched on here" notice.
 *
 * Reads the page `[garageSegment].astro` actually emitted rather than
 * inferring configuration from environment variables or from chunk
 * existence — see the file header on why neither of those is reliable here.
 * `data-garage-gate` only appears inside the `configured ? … : …` branch.
 */
function pageWasBuiltConfigured(distDir: string, servedPath: string): boolean {
  const file = path.join(distDir, servedPath.replace(/^\//, ""), "index.html");
  if (!existsSync(file)) return false;
  return readFileSync(file, "utf8").includes("data-garage-gate");
}

/**
 * The built chunk that contains `@supabase/supabase-js`'s `GoTrueClient` —
 * located by content, not by hash. `null` when no chunk under `_astro/`
 * mentions it at all (a build so old, or so different, that the dependency
 * graph does not even include the library) — distinct from, and rarer than,
 * "this page's markup was not built configured".
 */
function findSupabaseChunk(distDir: string): string | null {
  const astroDir = path.join(distDir, "_astro");
  if (!existsSync(astroDir)) return null;
  for (const entry of readdirSync(astroDir)) {
    if (!entry.endsWith(".js")) continue;
    const full = path.join(astroDir, entry);
    if (readFileSync(full, "utf8").includes("GoTrueClient")) return entry;
  }
  return null;
}

const SUPABASE_CHUNK = findSupabaseChunk(DIST_DIR);

for (const { locale, path: pagePath } of PAGES) {
  test.describe(locale, () => {
    test.beforeEach(async ({ page }) => {
      const configured = pageWasBuiltConfigured(DIST_DIR, pagePath);
      test.skip(
        !configured || SUPABASE_CHUNK === null,
        `${DIST_DIR}${pagePath} was not built with a configured Supabase ` +
          "project (no PUBLIC_SUPABASE_URL/PUBLIC_SUPABASE_ANON_KEY at build " +
          "time), so the garage app never renders and there is no client " +
          "chunk fetch to abort. Run against a configured build " +
          "(E2E_DIST=dist-configured; see ci.yml) to exercise this spec for " +
          "real."
      );

      // `hasStoredSession()` is what sends the boot chain down the branch
      // that asks Supabase who is signed in, rather than settling straight
      // to "signed out" with no network request at all
      // (`currentUserIdIfAny`, `src/lib/supabase/garage.ts`). The value is
      // never parsed — the import that would read it is what gets aborted
      // below — so its shape only has to match `SESSION_STORAGE_KEY_PATTERN`
      // (`^sb-.+-auth-token$`).
      await page.addInitScript(() => {
        window.localStorage.setItem(
          "sb-e2e-fixture-auth-token",
          JSON.stringify({ access_token: "fixture", refresh_token: "fixture" })
        );
      });

      // Stands in for a deploy rotating the chunk hash under an open tab, a
      // dropped network, or a CSP block — `getSupabaseClient()`'s dynamic
      // import rejects the same way for all three, which is the one path
      // this spec needs to exercise.
      await page.route(`**/_astro/${SUPABASE_CHUNK}`, (route) => route.abort());
    });

    test(`surfaces garageUnreachable and leaves the boot state behind`, async ({
      page,
    }) => {
      await page.goto(pagePath);

      const root = page.locator("[data-garage]");
      const message = page.locator("[data-garage-message]");
      const expected = t(locale).garageUnreachable;

      // The regression this guards against: a rejected boot promise with
      // nothing to catch it left `data-garage-state` at its initial "boot"
      // forever. A fixed page always moves on from it — to "signed-out",
      // here, since the gate is what a reachable-but-broken client falls
      // back to.
      await expect(root).not.toHaveAttribute("data-garage-state", "boot", {
        timeout: 10_000,
      });
      await expect(message).toHaveText(expected);

      // Never silent: the caught rejection has to actually say something,
      // not just leave the boot state (a caught rejection that displays
      // nothing is the same stall wearing a `catch`, per the page's own
      // comment).
      expect(expected.length).toBeGreaterThan(0);
    });
  });
}
