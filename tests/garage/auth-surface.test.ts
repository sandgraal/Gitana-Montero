/**
 * Graders — CONTRACT 6: the auth surface is magic link + Google, and nothing.
 *
 * > **ACC-01** THE site SHALL authenticate users via Supabase Auth with email
 * > magic link and Google OAuth, **and no password flow**.
 *
 * ## OWNER RULING, 2026-08-30 — what "no password flow" means
 *
 * > "No passwords" means **no password can ever authenticate**. Sessions come
 * > only from a magic link or from Google.
 *
 * The stricter reading — that no account may *carry* a password — was put to
 * the owner and **rejected as unachievable on Supabase Auth**. T2-202 proved
 * live that GoTrue bcrypts a random secret even for accounts created without
 * a password, so "carries no password" is not a state the platform can be put
 * in; and every path that blocks creation also breaks the magic-link flow
 * ACC-01 requires.
 *
 * That distinction decides what these graders may assert. Creating an account
 * that has a password is **not** a finding. Getting a session out of one is.
 * The enforcement point is the `password_verification_attempt` hook, which
 * answers a correct password on a real account with
 * `400 "Password sign-in is disabled."` — so that is what is pinned, rather
 * than a refusal at signup.
 *
 * The allow-list is the easy half and it is not the interesting one. What
 * makes ACC-01 a requirement rather than a preference is the closing clause:
 * a password flow that is merely *unused* is still a flow. Supabase Auth
 * ships with email+password enabled and every OAuth provider one config line
 * away; "we did not build a login form for it" is not the same as "it is off",
 * and the difference is a credential-stuffing surface on a site that
 * deliberately holds no passwords to stuff.
 *
 * So this file grades the deny half at three levels, in increasing strength:
 *
 * 1. **The client surface** (always runs, no infrastructure): nothing under
 *    `src/` collects a password or calls a password API. Passes today — there
 *    is no auth code yet — which makes it a regression guard from the moment
 *    T2-202 writes one, and the only grader here that CI can enforce.
 * 2. **The configuration** (declaration tier): `supabase/config.toml` enables
 *    Google, and every other provider it knows about is off.
 * 3. **The behaviour** (live tier): the running stack refuses the password
 *    grant **for an account that really has a password, using the correct
 *    one**, and still lets a real account request a magic link.
 *
 * ## Two of these graders used to be unfalsifiable
 *
 * The T2-201 review found that a stub handing out real password sessions
 * passed all four ACC-01 graders (F3): the password-grant probe asked about an
 * account that had never been created, and GoTrue answers `400 invalid_grant`
 * for an unknown account whether the grant is on or off. A test whose
 * assertion holds regardless of the thing it is testing is not a weak test,
 * it is decoration. It now provisions a real password-bearing account first.
 *
 * The same review found the magic-link positive control was satisfied by a
 * stack that refuses every sign-in (F4), because it only checked that
 * `/auth/v1/settings` answered — so the "refuses passwords" side had no
 * counterweight at all, and a config change that killed email sign-in
 * altogether would have looked like success. It now requests an actual OTP for
 * an actual account.
 *
 * ## Expected-failure convention
 *
 * `it.fails` is the marker — except in the client-surface suite, which is a
 * plain passing guard and must stay that way.
 *
 * refs specs/002-montero-garage (ACC-01, ACC-04)
 */
import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  ALLOWED_AUTH_PROVIDERS,
  KNOWN_EXTERNAL_PROVIDERS,
  testEmail,
} from "./contract.ts";
import {
  adminCreateUser,
  adminDeleteUser,
  authSettings,
  detectLiveStack,
  liveTitle,
  passwordGrant,
  passwordSignUp,
  requestMagicLink,
  stackOf,
} from "./harness.ts";
import { readSupabaseConfig } from "./sql.ts";

const live = await detectLiveStack();

/**
 * Obviously synthetic, obviously not a credential, and never valid anywhere:
 * the accounts it belongs to are created and destroyed inside a single grader
 * against a loopback stack.
 */
const PROBE_PASSWORD = "TEST-T2-201-not-a-real-password";

/**
 * A fresh identity for every run of the file.
 *
 * **This is a defect fix, not a tidy-up** (found by T2-202 against a live
 * stack). The fixture addresses used to be deterministic — `testEmail(
 * "password", "signup")` — and the signup grader created accounts without
 * removing them. So the *second* run against any given stack asked GoTrue to
 * register an address it already knew, got `422 user_already_exists`, and the
 * grader's `expect(response.ok).toBe(false)` passed. It passed because the
 * address was taken, not because password sign-up was refused: an accidental
 * green that survives exactly as long as the stack does, and that a developer
 * re-running the suite locally would hit on their second run.
 *
 * Reproduced before fixing, twice against the same stack: run 1 expected
 * failure, run 2 green for the wrong reason. Both halves are now closed —
 * unique addresses so a collision cannot happen, and teardown so nothing is
 * left behind to collide with.
 */
const RUN_ID = randomUUID().slice(0, 8);

/**
 * Pull a user id out of whatever shape an auth response carries — GoTrue
 * returns a bare user for a confirmation-required signup and a session
 * wrapping one otherwise.
 */
function userIdOf(body: unknown): string | undefined {
  const shape = body as { id?: string; user?: { id?: string } } | null;
  return shape?.id ?? shape?.user?.id;
}

const SRC_DIR = fileURLToPath(new URL("../../src/", import.meta.url));

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      out.push(...sourceFiles(path));
      continue;
    }
    if (/\.(astro|ts|tsx|js|mjs)$/.test(name) && !/\.test\.ts$/.test(name)) {
      out.push(path);
    }
  }
  return out;
}

/* =========================================================================
 * 1. The client surface — always runs, no marker, green today
 * ====================================================================== */

describe("no password ever reaches the client surface (ACC-01)", () => {
  const files = sourceFiles(SRC_DIR);

  it("has source files to scan — the guard is not vacuous", () => {
    // Without this, a broken path turns every grader below into a loop over
    // an empty array that reports green forever.
    expect(files.length).toBeGreaterThan(10);
  });

  it("renders no password input anywhere in src/", () => {
    const offenders = files.filter((path) =>
      /type\s*=\s*["']password["']/.test(readFileSync(path, "utf8"))
    );

    expect(offenders.map((path) => path.replace(SRC_DIR, ""))).toEqual([]);
  });

  it("calls no password-based Supabase auth method", () => {
    // `signInWithPassword` is the one-line way to reintroduce the flow ACC-01
    // forbids, and it would be entirely invisible in a UI review because it
    // needs no markup of its own.
    const offenders = files.filter((path) =>
      /signInWithPassword|signUpWithPassword|grant_type=password|resetPasswordForEmail/.test(
        readFileSync(path, "utf8")
      )
    );

    expect(offenders.map((path) => path.replace(SRC_DIR, ""))).toEqual([]);
  });

  it("POSITIVE CONTROL: the scanner does find a string that is there", () => {
    // Proves the three graders above are reading real bytes, not silently
    // failing to open anything.
    const hits = files.filter((path) =>
      readFileSync(path, "utf8").includes("Montero")
    );

    expect(hits.length).toBeGreaterThan(0);
  });
});

/* =========================================================================
 * 2. The configuration — declaration tier
 * ====================================================================== */

describe("the local stack is configured for exactly two ways in", () => {
  it.fails("enables Google (ACC-01)", () => {
    const config = readSupabaseConfig();
    const section = config.slice(config.indexOf("[auth.external.google]"));

    expect(config).toContain("[auth.external.google]");
    expect(section.slice(0, 400)).toMatch(/enabled\s*=\s*true/);
  });

  it.fails.each(
    KNOWN_EXTERNAL_PROVIDERS.filter(
      (provider) =>
        !(ALLOWED_AUTH_PROVIDERS as readonly string[]).includes(provider)
    ).map((provider) => [provider])
  )("leaves %s disabled", (provider) => {
    // An allow-list is only a guarantee if the deny half is enumerated. A
    // provider left on by a default config is a way into the site nobody
    // reviewed.
    const config = readSupabaseConfig();
    const header = `[auth.external.${provider}]`;
    if (!config.includes(header)) {
      // Absent counts as disabled — that is the honest reading, and it is
      // stated rather than implied so the next reader does not wonder.
      expect(config).not.toContain(header);
      return;
    }
    const section = config.slice(config.indexOf(header)).slice(0, 400);

    expect(section).toMatch(/enabled\s*=\s*false/);
  });

  it.fails("configures the email provider ACC-01 requires", () => {
    // **This grader used to demand `enable_signup = false`, and that was
    // wrong** (T2-201 review, F4). In the Supabase CLI that knob gates *all*
    // new accounts, not the password half — turning it off would break the
    // magic-link sign-up ACC-01 mandates while leaving password sign-in for
    // existing accounts exactly where it was. A grader that forces the
    // implementation to break a requirement in order to pass is worse than no
    // grader.
    //
    // So the config tier now pins only what it can honestly pin — that the
    // email provider exists and is enabled — and the *deny* half of ACC-01
    // moved to where it can actually be proved: the behavioural graders
    // below, which provision a real password-bearing account and demand that
    // no session comes out of it.
    //
    // Whether GoTrue exposes a knob that disables passwords alone is a T2-202
    // finding. If one exists, tighten this grader onto it. If none exists,
    // that is a stop-and-ask, not a reason to quietly weaken the requirement.
    const config = readSupabaseConfig();
    const section = config.slice(config.indexOf("[auth.email]")).slice(0, 800);

    expect(config).toContain("[auth.email]");
    expect(section).toMatch(/enable_signup\s*=\s*true/);
  });

  it.fails(
    "allows no OAuth redirect target outside the site's own origins",
    () => {
      // F9, acknowledged rather than left silent: GoTrue's redirect allow-list
      // (`site_url` + `additional_redirect_urls`) is what stops an open
      // redirect from turning a Google sign-in into a token handoff to someone
      // else's host. Pinned loosely on purpose — the exact preview-deployment
      // origins Vercel needs are T2-202's to determine — but pinned, so the
      // list cannot be left as the CLI's wide-open default.
      const config = readSupabaseConfig();

      expect(config).toMatch(/site_url\s*=/);
      expect(config).not.toMatch(/additional_redirect_urls\s*=\s*\[\s*"\*"/);
    }
  );

  it.fails("does not weaken the boundary with an analytics or ads key", () => {
    // ACC-04 / AGENTS.md: "no third-party analytics or ad SDK with the auth
    // surface". The auth branch is exactly where one tends to arrive.
    const config = readSupabaseConfig();

    expect(config.toLowerCase()).not.toMatch(
      /google[-_]?analytics|gtag|segment|mixpanel|posthog/
    );
  });
});

/* =========================================================================
 * 3. The behaviour — live tier
 * ====================================================================== */

describe.skipIf(!live.available)(
  liveTitle("the running stack refuses passwords", live),
  () => {
    it.fails(
      "a password submitted at signup grants no session, then or later",
      async () => {
        // **OWNER RULING, 2026-08-30 — the ratified reading of ACC-01.**
        // "No passwords" means *no password can ever authenticate*: a session
        // comes only from a magic link or from Google. It does **not** mean no
        // account may carry a password, and this grader used to pin that
        // literal reading — it asserted the signup call itself was refused.
        //
        // The literal reading was rejected as unachievable on Supabase Auth.
        // T2-202 proved live that GoTrue bcrypts a random secret even for
        // accounts created without one, so "carries no password" is not a
        // state the platform can be put in; and every path that blocks
        // creation also breaks the magic-link flow ACC-01 requires. A grader
        // that demands the impossible does not protect the requirement, it
        // just blocks the branch that satisfies it.
        //
        // So what is pinned here is the guarantee that actually matters, along
        // the public path a stranger would take: sign up with a password, and
        // no session comes back — not from the signup call, and not from
        // presenting that same correct password afterwards.
        const stack = stackOf(live);
        const email = testEmail("password-signup", RUN_ID);

        const response = await passwordSignUp(stack, email, PROBE_PASSWORD);
        const created = userIdOf(response.body);

        try {
          // The account may exist afterwards — that is allowed now. What may
          // not exist is a way in.
          expect(response.body).not.toHaveProperty("access_token");
          expect(response.body).not.toHaveProperty("refresh_token");

          // And the password it was created with must not work later either,
          // which is the half a signup-only check would miss entirely.
          const grant = await passwordGrant(stack, email, PROBE_PASSWORD);

          expect(grant.ok).toBe(false);
          expect(grant.body).not.toHaveProperty("access_token");
        } finally {
          if (created) await adminDeleteUser(stack, created);
        }
      }
    );

    it.fails(
      "refuses the password grant FOR AN ACCOUNT THAT REALLY HAS ONE",
      async () => {
        // **The grader that could not fail** (T2-201 review, F3). It used to
        // ask for a session on an account that had never been created, and
        // GoTrue answers `400 invalid_grant` for an unknown account whether
        // the password grant is enabled or disabled. The refusal proved
        // nothing about the configuration — a stub handing out real password
        // sessions passed it, along with all three of its neighbours.
        //
        // To ask the question properly the account has to exist and the
        // password has to be right, so this one provisions both through the
        // admin API first. Now a stack with passwords enabled returns a
        // session here and the grader goes red, which is the whole point.
        //
        // **Owner ruling 2026-08-30** also removed this grader's escape
        // hatch. It used to treat "the admin API refused to mint a
        // password-bearing account" as satisfying ACC-01 by a stronger route
        // — which is the literal reading the ruling rejects, and which would
        // have let the whole assertion be skipped by a `return`. Creating the
        // account is now required, because a grader that cannot set up its
        // own fixture proves nothing about what follows.
        const stack = stackOf(live);
        const email = testEmail("password-grant", RUN_ID);
        const created = await adminCreateUser(stack, {
          email,
          password: PROBE_PASSWORD,
          email_confirm: true,
        });
        const userId = userIdOf(created.body);

        try {
          expect(created.ok).toBe(true);

          const response = await passwordGrant(stack, email, PROBE_PASSWORD);

          expect(response.ok).toBe(false);
          expect(response.body).not.toHaveProperty("access_token");
          // And not merely because the account was unknown — the failure
          // mode that made the original grader vacuous.
          expect(JSON.stringify(response.body)).not.toContain("invalid_grant");
          // The refusal has to come from the deliberate block, not from a
          // wrong password or a missing user. This is the
          // `password_verification_attempt` hook's contract, pinned loosely
          // enough to survive punctuation.
          expect(JSON.stringify(response.body)).toMatch(
            /password sign[- ]?in is disabled/i
          );
        } finally {
          if (userId) await adminDeleteUser(stack, userId);
        }
      }
    );

    it.fails("advertises Google and no other external provider", async () => {
      const stack = stackOf(live);

      const response = await authSettings(stack);
      const external =
        (response.body as { external?: Record<string, boolean> }).external ??
        {};

      expect(external.google).toBe(true);

      const enabled = Object.entries(external)
        .filter(([, on]) => on === true)
        .map(([name]) => name)
        .filter(
          (name) =>
            !(ALLOWED_AUTH_PROVIDERS as readonly string[]).includes(name)
        );
      expect(enabled).toEqual([]);
    });

    it.fails(
      "POSITIVE CONTROL: an existing account can request a magic link",
      async () => {
        // **The control that was satisfied by an auth service refusing
        // everything** (T2-201 review, F4). It used to assert that
        // `GET /auth/v1/settings` returned 200, which a stack that turns away
        // every sign-in also does — so the "refuses passwords" graders above
        // had no counterweight at all.
        //
        // This exercises the flow ACC-01 actually requires, for an account
        // that actually exists: if magic link is broken, or if some later
        // attempt to shut off passwords takes email sign-in down with it, this
        // goes red.
        const stack = stackOf(live);
        const email = testEmail("magiclink", RUN_ID);
        const created = await adminCreateUser(stack, {
          email,
          email_confirm: true,
        });
        const userId = userIdOf(created.body);

        try {
          expect(created.ok).toBe(true);

          const response = await requestMagicLink(stack, email);

          expect(response.ok).toBe(true);
        } finally {
          if (userId) await adminDeleteUser(stack, userId);
        }
      }
    );

    it.fails("POSITIVE CONTROL: Google is a live sign-in option", async () => {
      // The other half of ACC-01's allow-list. Authorising against Google
      // needs a browser, so what is checkable here is that the provider is
      // configured and advertised rather than merely written in a file.
      const stack = stackOf(live);

      const response = await authSettings(stack);
      const external =
        (response.body as { external?: Record<string, boolean> }).external ??
        {};

      expect(response.ok).toBe(true);
      expect(external.google).toBe(true);
    });
  }
);
