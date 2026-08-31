/**
 * The two ways in, and the way out. Browser-only (ACC-01).
 *
 * > **ACC-01** THE site SHALL authenticate users via Supabase Auth with email
 * > magic link and Google OAuth, and no password flow.
 *
 * Three functions, one per thing a visitor can do, and deliberately no fourth:
 * there is no password entry point here, and there is none anywhere else under
 * `src/` either — `tests/garage/auth-surface.test.ts` sweeps the whole tree for
 * one on every `npm test`.
 *
 * ## Why the client is imported dynamically
 *
 * `@supabase/supabase-js` is ~100 kB of JavaScript that only matters once a
 * visitor decides to sign in. Loading it eagerly would put it on the critical
 * path of a page whose entire content is a heading, a form and two paragraphs,
 * against SCF-06's performance budget, and it would download for every reader
 * who came for the reference material and will never have an account. So it
 * arrives on the click, from its own chunk.
 *
 * refs specs/002-montero-garage (ACC-01, ACC-02, SHR-01)
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  SUPABASE_BROWSER_CONFIG,
  type SupabaseBrowserConfig,
} from "./config.ts";

let client: SupabaseClient | null = null;

/**
 * The browser client, or `null` when this build has no project configured.
 *
 * Memoised because a second client would keep a second copy of the session and
 * the two would disagree the moment one of them refreshed a token.
 */
export async function getSupabaseClient(
  config: SupabaseBrowserConfig | null = SUPABASE_BROWSER_CONFIG
): Promise<SupabaseClient | null> {
  if (!config) return null;
  if (client) return client;
  const { createClient } = await import("@supabase/supabase-js");
  client = createClient(config.url, config.anonKey, {
    auth: {
      // The link in the email carries the session in the URL fragment; this is
      // what turns it into a signed-in browser without a server round trip.
      detectSessionInUrl: true,
      persistSession: true,
      autoRefreshToken: true,
      flowType: "pkce",
    },
  });
  return client;
}

/** What a sign-in attempt did, in a form the page can render. */
export type AuthOutcome =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: "unconfigured" | "failed" };

/**
 * ACC-01's first way in: email a one-time link.
 *
 * `shouldCreateUser` is true because a first sign-in *is* the sign-up — there
 * is no separate registration step when there is no password to choose.
 * `emailRedirectTo` is an absolute URL back to this page in the locale the
 * visitor is reading, so a Costa Rican reader who asks for a link in Spanish
 * lands back in Spanish (ACC-02).
 */
export async function sendMagicLink(
  email: string,
  redirectTo: string
): Promise<AuthOutcome> {
  const supabase = await getSupabaseClient();
  if (!supabase) return { ok: false, reason: "unconfigured" };
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: redirectTo, shouldCreateUser: true },
  });
  return error ? { ok: false, reason: "failed" } : { ok: true };
}

/** ACC-01's second way in. Redirects the browser to Google on success. */
export async function startGoogleSignIn(
  redirectTo: string
): Promise<AuthOutcome> {
  const supabase = await getSupabaseClient();
  if (!supabase) return { ok: false, reason: "unconfigured" };
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo },
  });
  return error ? { ok: false, reason: "failed" } : { ok: true };
}

/** The signed-in account's email address, or `null`. */
export async function currentEmail(): Promise<string | null> {
  const supabase = await getSupabaseClient();
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.user.email ?? null;
}

/** End the session in this browser. */
export async function signOut(): Promise<AuthOutcome> {
  const supabase = await getSupabaseClient();
  if (!supabase) return { ok: false, reason: "unconfigured" };
  const { error } = await supabase.auth.signOut();
  return error ? { ok: false, reason: "failed" } : { ok: true };
}

/**
 * The narrowest check worth making on an address here.
 *
 * Deliberately not an RFC 5322 parser: the authoritative test of an email
 * address is whether a link sent to it arrives, and GoTrue applies its own
 * validation anyway. This exists so a visitor who typed nothing, or typed
 * their name, gets told so without waiting for a round trip.
 */
export function looksLikeEmail(value: string): boolean {
  const trimmed = value.trim();
  return /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(trimmed);
}
