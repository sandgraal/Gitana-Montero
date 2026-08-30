/**
 * Graders — CONTRACT 6: the auth surface is magic link + Google, and nothing.
 *
 * > **ACC-01** THE site SHALL authenticate users via Supabase Auth with email
 * > magic link and Google OAuth, **and no password flow**.
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
 * 3. **The behaviour** (live tier): the running stack refuses both password
 *    sign-up and the password grant.
 *
 * ## Expected-failure convention
 *
 * `it.fails` is the marker — except in the client-surface suite, which is a
 * plain passing guard and must stay that way.
 *
 * refs specs/002-montero-garage (ACC-01, ACC-04)
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  ALLOWED_AUTH_PROVIDERS,
  KNOWN_EXTERNAL_PROVIDERS,
} from "./contract.ts";
import {
  authSettings,
  detectLiveStack,
  liveTitle,
  passwordGrant,
  passwordSignUp,
  stackOf,
} from "./harness.ts";
import { readSupabaseConfig } from "./sql.ts";

const live = await detectLiveStack();

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

  it.fails("turns off password sign-up in the email provider", () => {
    // The provider ACC-01 *does* want, configured for the half of it ACC-01
    // wants. Magic link and password live in the same `[auth.email]` block.
    const config = readSupabaseConfig();
    const section = config.slice(config.indexOf("[auth.email]")).slice(0, 800);

    expect(config).toContain("[auth.email]");
    expect(section).toMatch(/enable_signup\s*=\s*false/);
  });

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
    it.fails("refuses to create an account with a password", async () => {
      const stack = stackOf(live);

      const response = await passwordSignUp(
        stack,
        "test-t2-201-password@t2-201.invalid",
        "TEST-T2-201-not-a-real-password"
      );

      expect(response.ok).toBe(false);
    });

    it.fails("refuses the password grant", async () => {
      // The other door: even if no account can be created with a password,
      // an account that acquired one some other way must not be able to
      // exchange it for a session.
      const stack = stackOf(live);

      const response = await passwordGrant(
        stack,
        "test-t2-201-password@t2-201.invalid",
        "TEST-T2-201-not-a-real-password"
      );

      expect(response.ok).toBe(false);
      expect(response.status).toBeGreaterThanOrEqual(400);
    });

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
      "POSITIVE CONTROL: the magic-link route is reachable",
      async () => {
        // Every refusal above is satisfied by an auth service that is simply
        // down. ACC-01 requires one way in to work, not zero.
        const stack = stackOf(live);

        const response = await authSettings(stack);

        expect(response.ok).toBe(true);
        expect(response.body).toHaveProperty("external");
      }
    );
  }
);
