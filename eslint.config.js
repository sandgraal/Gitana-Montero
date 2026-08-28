// @ts-check
import { defineConfig } from "eslint/config";
import eslint from "@eslint/js";
import eslintPluginAstro from "eslint-plugin-astro";
import globals from "globals";
import tseslint from "typescript-eslint";
import gitana from "./scripts/eslint/index.mjs";

export default defineConfig(
  {
    ignores: ["dist/**", ".astro/**", "node_modules/**", "coverage/**"],
  },
  eslint.configs.recommended,
  tseslint.configs.recommended,
  eslintPluginAstro.configs.recommended,
  {
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
  {
    // Astro's own convention for env.d.ts: a triple-slash reference to the
    // generated content-collection/env types, which is declaration-only.
    files: ["src/env.d.ts"],
    rules: {
      "@typescript-eslint/triple-slash-reference": "off",
    },
  },
  {
    // I18N-08: user-facing strings live in src/i18n/ui.ts, never in markup.
    // Scoped to .astro because that is where markup lives; the strings module
    // itself is .ts and is therefore never its own violation.
    files: ["**/*.astro"],
    plugins: { gitana },
    rules: {
      "gitana/no-hardcoded-ui-text": "error",
    },
  }
);
