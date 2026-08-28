/**
 * Locale-independent site metadata. Values here are shared data — stored once,
 * rendered into both locales — never duplicated into `src/i18n/ui.ts`.
 */

/** The platform's name. A proper noun, identical in every locale. */
export const SITE_NAME = "Montero Garage";

/**
 * The owner's own truck — user page #1, the template every other garage is
 * shaped by (002 MIG-04). A proper noun: it is the *truck's* name, never the
 * site's, and it is identical in every locale. When prose means the platform,
 * it uses `SITE_NAME`; when it means this particular 2002 Montero, it uses
 * this.
 */
export const TRUCK_NAME = "Gitana Blanca";

/**
 * Model year of `TRUCK_NAME`. A figure, not prose: it is interpolated into
 * both locales' strings so it exists exactly once (AGENTS.md — "if you find
 * yourself writing the same figure twice, the schema is wrong").
 */
export const TRUCK_YEAR = 2002;

export const REPO_URL = "https://github.com/sandgraal/monterogarage";
export const ISSUES_URL = `${REPO_URL}/issues/new/choose`;
