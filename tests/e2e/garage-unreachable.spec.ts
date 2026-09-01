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
 * ## Detection has to fail loudly, not skip quietly (review F1)
 *
 * `pageWasBuiltConfigured()` decides "configured" from one string —
 * `data-garage-gate` — sourced from `[garageSegment].astro`'s markup. That
 * string can drift from the component (a legitimate attribute rename) without
 * either file *knowing* it broke the other. A first version of this spec
 * treated that drift the same as "this is genuinely the plain build": both
 * `test.skip`, both green, and the whole point of this suite — catching the
 * T2-301 boot-stall regression — goes dark silently.
 *
 * So the CI step that runs this file against the configured build also sets
 * `E2E_EXPECT_CONFIGURED=1` (`ci.yml`) — an independent claim, not derived
 * from parsing any markup, that *this* run's `dist` was built with a
 * Supabase project configured. When that claim is true, "no page looks
 * configured" is not a reason to skip any more; it is exactly the drift this
 * note describes, and the run fails loudly instead — both at module load
 * (catches every page losing the marker at once, e.g. a self-consistent
 * rename) and per test (catches just one locale losing it). Only when
 * `E2E_EXPECT_CONFIGURED` is unset — the plain-`dist/` run in the same CI
 * job, and `npm run test:e2e` locally — does "not configured" fall back to an
 * honest skip.
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

/**
 * CI's independent claim that *this run's* build was made with a Supabase
 * project configured — set only alongside `E2E_DIST=dist-configured`
 * (`ci.yml`). Never derived from `pageWasBuiltConfigured()` itself: the whole
 * point is a second, unrelated source of truth for "should be configured" to
 * check the markup-sniffing one against (see the file header, "Detection has
 * to fail loudly, not skip quietly").
 */
const EXPECT_CONFIGURED = process.env["E2E_EXPECT_CONFIGURED"] === "1";

const PAGES = [
  { locale: "en" as const, path: "/en/garage/" },
  { locale: "es" as const, path: "/es/taller/" },
];

/**
 * The one attribute that only exists inside `[garageSegment].astro`'s
 * `configured ? … : …` branch — an *attribute*, matched at attribute
 * boundaries, not a bare substring. `.includes()` would also match a renamed
 * `data-garage-gate-open` or a `data-garage-gate2`, silently widening what
 * counts as "found" the next time a nearby attribute is added; the
 * lookaround below requires the character on each side (if any) to be
 * neither a word character nor a hyphen, so only the exact token counts.
 */
const CONFIGURED_MARKER = /(?<![\w-])data-garage-gate(?![\w-])/;

/**
 * `true` when `servedPath`'s *built HTML* rendered the configured garage app
 * rather than the "accounts are not switched on here" notice.
 *
 * Reads the page `[garageSegment].astro` actually emitted rather than
 * inferring configuration from environment variables or from chunk
 * existence — see the file header on why neither of those is reliable here.
 */
function pageWasBuiltConfigured(distDir: string, servedPath: string): boolean {
  const file = path.join(distDir, servedPath.replace(/^\//, ""), "index.html");
  if (!existsSync(file)) return false;
  return CONFIGURED_MARKER.test(readFileSync(file, "utf8"));
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

/**
 * Loud, at module load, before a single test runs: if CI declared this run's
 * build configured but *every* page in `PAGES` disagrees, that is not "this
 * happens to be the plain build" (CI would not have set the env var) — it is
 * `CONFIGURED_MARKER` (or the chunk lookup) having drifted from what the
 * build actually contains. Throwing here fails the whole file load rather
 * than reporting a row of green skips, which is the failure mode review
 * finding F1 was about: a detection string that quietly stops detecting
 * anything must break CI, not un-wire the suite it is part of.
 */
if (EXPECT_CONFIGURED) {
  const anyPageConfigured = PAGES.some(({ path: pagePath }) =>
    pageWasBuiltConfigured(DIST_DIR, pagePath)
  );
  if (!anyPageConfigured || SUPABASE_CHUNK === null) {
    throw new Error(
      "garage-unreachable — E2E_EXPECT_CONFIGURED=1 (this run's build is " +
        "supposed to have a Supabase project configured) but " +
        (!anyPageConfigured
          ? `no page under ${DIST_DIR} contains the ${CONFIGURED_MARKER} ` +
            "marker. Either [garageSegment].astro no longer renders " +
            "`data-garage-gate` when configured (update CONFIGURED_MARKER " +
            "to match), or this build genuinely was not made with " +
            "PUBLIC_SUPABASE_URL/PUBLIC_SUPABASE_ANON_KEY set (check the CI " +
            "step that builds dist-configured/). "
          : "") +
        (SUPABASE_CHUNK === null
          ? `no chunk under ${DIST_DIR}/_astro contains "GoTrueClient". `
          : "") +
        "Failing the whole file rather than skipping every test: a stale " +
        "detection string here must break CI, not silently stop catching " +
        "the T2-301 boot-stall regression this suite exists for."
    );
  }
}

for (const { locale, path: pagePath } of PAGES) {
  test.describe(locale, () => {
    test.beforeEach(async ({ page }) => {
      const configured = pageWasBuiltConfigured(DIST_DIR, pagePath);
      const chunkFound = SUPABASE_CHUNK !== null;

      if (!configured || !chunkFound) {
        if (EXPECT_CONFIGURED) {
          // Same reasoning as the module-level check above, for the case
          // where only *this* locale's page lost the marker (e.g. an
          // asymmetric rename) while another page in `PAGES` kept it, so the
          // module-level "at least one" check passed.
          throw new Error(
            `garage-unreachable — E2E_EXPECT_CONFIGURED=1 but ${pagePath} ` +
              (!configured
                ? `does not contain the ${CONFIGURED_MARKER} marker `
                : "") +
              (!chunkFound ? "and no Supabase chunk was found " : "") +
              "— failing loudly instead of skipping (review F1: a silent " +
              "skip here is exactly how this spec's regression coverage " +
              "would go dark)."
          );
        }
        test.skip(
          true,
          `${DIST_DIR}${pagePath} was not built with a configured Supabase ` +
            "project (no PUBLIC_SUPABASE_URL/PUBLIC_SUPABASE_ANON_KEY at " +
            "build time), so the garage app never renders and there is no " +
            "client chunk fetch to abort. Run against a configured build " +
            "(E2E_DIST=dist-configured E2E_EXPECT_CONFIGURED=1; see " +
            "ci.yml) to exercise this spec for real."
        );
      }

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
