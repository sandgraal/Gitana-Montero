/// <reference path="../.astro/types.d.ts" />

/**
 * The two browser-visible Supabase variables (T2-202, ACC-01).
 *
 * Optional, because there is no Supabase project until the owner provisions
 * one and every build before that must stay green — `src/lib/supabase/config.ts`
 * treats an absent pair as "accounts are off here" rather than as an error.
 * Both carry the `PUBLIC_` prefix Astro requires to expose a value to client
 * code, which is also the reason a value that must stay server-side cannot
 * reach the browser by accident.
 *
 * refs specs/002-montero-garage (ACC-01, MIG-03)
 */
interface ImportMetaEnv {
  /** The Supabase project's API origin, e.g. `https://<ref>.supabase.co`. */
  readonly PUBLIC_SUPABASE_URL?: string;
  /** The **publishable** (anon) key. Never a service-role or secret key. */
  readonly PUBLIC_SUPABASE_ANON_KEY?: string;
}
