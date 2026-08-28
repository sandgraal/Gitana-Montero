/**
 * Locale-independent site metadata. Values here are shared data — stored once,
 * rendered into both locales — never duplicated into `src/i18n/ui.ts`.
 */

/** The project's name. A proper noun, identical in every locale. */
export const SITE_NAME = "Gitana";

/**
 * Model year of the truck this site is built around. A figure, not prose:
 * it is interpolated into both locales' strings so it exists exactly once
 * (AGENTS.md — "if you find yourself writing the same figure twice, the
 * schema is wrong").
 */
export const TRUCK_YEAR = 2002;

export const REPO_URL = "https://github.com/sandgraal/Gitana-Montero";
export const ISSUES_URL = `${REPO_URL}/issues/new/choose`;
