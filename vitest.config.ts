import { getViteConfig } from "astro/config";
import { defineConfig } from "vitest/config";

/**
 * Vitest runs through Astro's own Vite config (`getViteConfig`) rather than a
 * bare `defineConfig`, so tests can import modules that resolve the virtual
 * `astro:content` module — notably `src/content.config.ts` itself.
 *
 * That matters for T103: without it, the only thing gradeable is the schema
 * *factory*, and a collection could bypass the factory entirely and still
 * pass every grader. `tests/schemas/collections.test.ts` grades the real
 * registered collections, which is only possible from inside Astro's Vite
 * pipeline.
 *
 * refs specs/001-foundation (I18N-06, SCF-01, SCF-04)
 */
export default getViteConfig(
  defineConfig({
    test: {
      include: [
        "src/**/*.{test,spec}.{ts,mts}",
        "tests/**/*.{test,spec}.{ts,mts}",
      ],
      /*
       * `tests/e2e/` belongs to Playwright (T204). Its specs import
       * `@playwright/test`, whose `test()` throws when it is called outside
       * the Playwright runner, so without this exclusion `npm test` fails on
       * files it was never meant to run. The two suites are deliberately
       * separate commands — `npm test` must stay fast and browser-free, and
       * `npm run test:e2e` needs a built `dist/` and a real Chrome.
       */
      exclude: ["node_modules/**", "dist/**", "tests/e2e/**"],
      environment: "node",
      passWithNoTests: false,
    },
  })
);
