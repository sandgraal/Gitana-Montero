/**
 * The browser's view of the Supabase project — read once, validated once.
 *
 * Two environment variables and nothing else:
 *
 * - `PUBLIC_SUPABASE_URL` — the project's API origin.
 * - `PUBLIC_SUPABASE_ANON_KEY` — the **publishable** key. It is designed to be
 *   shipped to every visitor; row-level security, not secrecy, is what keeps
 *   one user's garage out of another's browser (SHR-01).
 *
 * Both are `PUBLIC_`-prefixed because Astro only exposes that prefix to client
 * code, so a variable that is *not* meant for the browser cannot reach it by
 * accident. Neither is committed: they are set in `.env.local` for development
 * and in the Vercel project for deployments (see
 * `specs/002-montero-garage/HANDOFF-T2-202-SUPABASE.md`).
 *
 * ## Absent is a supported state, not an error
 *
 * There is no Supabase project yet — provisioning one is an owner action — and
 * every build until there is one must stay green: `astro build`, the a11y
 * sweep and the link check all run with these unset. So a missing pair yields
 * `null` and the sign-in page renders an honest "not switched on here" notice
 * instead of a form that cannot work. What is *not* tolerated is a pair that is
 * present and wrong; that throws, because a silently misconfigured auth surface
 * is worse than one that is visibly off.
 *
 * refs specs/002-montero-garage (ACC-01, ACC-02, MIG-03)
 */

/** A validated, browser-safe Supabase configuration. */
export interface SupabaseBrowserConfig {
  readonly url: string;
  readonly anonKey: string;
}

/** Thrown when a key that must never reach a browser is handed to one. */
export const SECRET_KEY_REFUSED =
  "refusing a Supabase secret key in browser configuration";

/** Thrown when the URL is present but unusable. */
export const BAD_URL = "PUBLIC_SUPABASE_URL is not an http(s) URL";

/**
 * `true` when `key` is one of Supabase's *secret* key shapes.
 *
 * Both generations are covered, because both are one careless copy-paste from
 * the dashboard away and both would hand every visitor the ability to read and
 * delete every user's data with RLS bypassed entirely:
 *
 * - the legacy service-role JWT, whose payload claims `"role":"service_role"`;
 * - the current `sb_secret_…` API key.
 *
 * AGENTS.md: user data never leaves Supabase, and no service key exists in this
 * repo. This makes the second half structural rather than a rule people
 * remember.
 */
export function isSecretKey(key: string): boolean {
  const trimmed = key.trim();
  if (trimmed.startsWith("sb_secret_")) return true;
  const [, payload] = trimmed.split(".");
  if (!payload) return false;
  try {
    const decoded = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    return /"role"\s*:\s*"service_role"/.test(decoded);
  } catch {
    // Not base64, so not a JWT this cares about. A key it cannot read is not
    // a key it may declare safe, but it is also not evidence of a secret —
    // and `createClient` will reject it soon enough.
    return false;
  }
}

/**
 * Read the pair out of an environment, or `null` when it is not configured.
 *
 * Takes the environment as an argument so it is a pure function with a unit
 * test, rather than something only observable by rebuilding the site.
 *
 * @throws when the pair is present but malformed, or when the key is a secret.
 */
export function readSupabaseConfig(
  env: Record<string, unknown>
): SupabaseBrowserConfig | null {
  const url =
    typeof env.PUBLIC_SUPABASE_URL === "string"
      ? env.PUBLIC_SUPABASE_URL.trim()
      : "";
  const anonKey =
    typeof env.PUBLIC_SUPABASE_ANON_KEY === "string"
      ? env.PUBLIC_SUPABASE_ANON_KEY.trim()
      : "";

  if (url === "" || anonKey === "") return null;

  if (isSecretKey(anonKey)) {
    throw new Error(
      `${SECRET_KEY_REFUSED}: PUBLIC_SUPABASE_ANON_KEY looks like a ` +
        `service-role or secret key. Use the publishable (anon) key — the ` +
        `secret one bypasses row-level security (AGENTS.md; ` +
        `refs specs/002-montero-garage ACC-01, SHR-01)`
    );
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`${BAD_URL}: ${url}`);
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error(`${BAD_URL}: ${url}`);
  }

  return { url: parsed.origin, anonKey };
}

/**
 * This build's configuration. `null` on every build that has no project yet.
 *
 * Resolved at build time: Astro inlines `import.meta.env.PUBLIC_*`, so the
 * sign-in page knows before it renders whether there is anything to sign in to.
 */
export const SUPABASE_BROWSER_CONFIG: SupabaseBrowserConfig | null =
  readSupabaseConfig({
    // Named one at a time rather than by spreading `import.meta.env`, because
    // that is the form Vite statically replaces in a client bundle. A spread
    // would work today and break silently the day it does not.
    PUBLIC_SUPABASE_URL: import.meta.env.PUBLIC_SUPABASE_URL,
    PUBLIC_SUPABASE_ANON_KEY: import.meta.env.PUBLIC_SUPABASE_ANON_KEY,
  });
