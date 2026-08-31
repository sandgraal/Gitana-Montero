/**
 * The browser-configuration reader, graded against environments with a known
 * answer (T2-202, ACC-01, SHR-01).
 *
 * Two properties are worth a test here and the rest are not:
 *
 * 1. **Absent is a state, not a failure.** Every build until the owner
 *    provisions a project has neither variable, and `astro build`, the a11y
 *    sweep and the link check all have to stay green through that. A reader
 *    that threw would take the whole site down over a page that says "accounts
 *    are not switched on yet".
 * 2. **A secret key never reaches a browser.** AGENTS.md says user data never
 *    leaves Supabase and no service key exists in this repo; the service-role
 *    key bypasses row-level security entirely, so shipping one to every visitor
 *    would hand them every user's garage. This is one careless copy-paste from
 *    the dashboard, which is exactly the kind of mistake that deserves a
 *    structural guard rather than a rule in a document.
 *
 * refs specs/002-montero-garage (ACC-01, SHR-01, MIG-03)
 */
import { describe, expect, it } from "vitest";
import {
  BAD_URL,
  SECRET_KEY_REFUSED,
  isSecretKey,
  readSupabaseConfig,
} from "./config";

/** A JWT-shaped string with the given role claim. Not a credential anywhere. */
function fakeKey(role: string): string {
  const encode = (value: object) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  return [
    encode({ alg: "HS256", typ: "JWT" }),
    encode({ iss: "supabase", ref: "example", role }),
    "TEST-NOT-A-SIGNATURE",
  ].join(".");
}

const URL_OK = "https://abcdefghijklm.supabase.co";

describe("readSupabaseConfig", () => {
  it("returns null when nothing is configured — the state of every build today", () => {
    expect(readSupabaseConfig({})).toBeNull();
  });

  it("returns null when only one half of the pair is set", () => {
    expect(readSupabaseConfig({ PUBLIC_SUPABASE_URL: URL_OK })).toBeNull();
    expect(
      readSupabaseConfig({ PUBLIC_SUPABASE_ANON_KEY: fakeKey("anon") })
    ).toBeNull();
  });

  it("treats blank strings as absent, not as configuration", () => {
    // An env var set to "" is what a half-filled Vercel project looks like.
    expect(
      readSupabaseConfig({
        PUBLIC_SUPABASE_URL: "   ",
        PUBLIC_SUPABASE_ANON_KEY: "",
      })
    ).toBeNull();
  });

  it("reads a configured pair", () => {
    expect(
      readSupabaseConfig({
        PUBLIC_SUPABASE_URL: `${URL_OK}/`,
        PUBLIC_SUPABASE_ANON_KEY: fakeKey("anon"),
      })
    ).toEqual({ url: URL_OK, anonKey: fakeKey("anon") });
  });

  it("accepts a local stack, so the graders' own target is configurable", () => {
    expect(
      readSupabaseConfig({
        PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
        PUBLIC_SUPABASE_ANON_KEY: fakeKey("anon"),
      })?.url
    ).toBe("http://127.0.0.1:54321");
  });

  it("REFUSES a service-role key instead of shipping it to every visitor", () => {
    expect(() =>
      readSupabaseConfig({
        PUBLIC_SUPABASE_URL: URL_OK,
        PUBLIC_SUPABASE_ANON_KEY: fakeKey("service_role"),
      })
    ).toThrow(SECRET_KEY_REFUSED);
  });

  it("REFUSES the current `sb_secret_` key shape too", () => {
    expect(() =>
      readSupabaseConfig({
        PUBLIC_SUPABASE_URL: URL_OK,
        PUBLIC_SUPABASE_ANON_KEY: "sb_secret_TEST-not-a-real-key",
      })
    ).toThrow(SECRET_KEY_REFUSED);
  });

  it("says why the key was refused, not merely that it was", () => {
    expect(() =>
      readSupabaseConfig({
        PUBLIC_SUPABASE_URL: URL_OK,
        PUBLIC_SUPABASE_ANON_KEY: fakeKey("service_role"),
      })
    ).toThrow(/bypasses row-level security/);
  });

  it("throws on a URL that is present and unusable", () => {
    // Present-and-wrong is a misconfiguration a build should surface. Absent
    // is not.
    expect(() =>
      readSupabaseConfig({
        PUBLIC_SUPABASE_URL: "not a url",
        PUBLIC_SUPABASE_ANON_KEY: fakeKey("anon"),
      })
    ).toThrow(BAD_URL);
  });

  it("throws on a non-http scheme", () => {
    expect(() =>
      readSupabaseConfig({
        PUBLIC_SUPABASE_URL: "javascript:alert(1)",
        PUBLIC_SUPABASE_ANON_KEY: fakeKey("anon"),
      })
    ).toThrow(BAD_URL);
  });

  it("ignores values that are not strings", () => {
    expect(
      readSupabaseConfig({
        PUBLIC_SUPABASE_URL: 42,
        PUBLIC_SUPABASE_ANON_KEY: { key: "no" },
      })
    ).toBeNull();
  });
});

describe("isSecretKey", () => {
  it.each<[string, boolean]>([
    ["sb_secret_abc", true],
    ["sb_publishable_abc", false],
    ["", false],
    ["not-a-jwt", false],
  ])("%s → %s", (key, expected) => {
    expect(isSecretKey(key)).toBe(expected);
  });

  it("reads the role claim out of a legacy JWT key", () => {
    expect(isSecretKey(fakeKey("service_role"))).toBe(true);
    expect(isSecretKey(fakeKey("anon"))).toBe(false);
    // The one that would be a false negative if the check matched the whole
    // token rather than the decoded payload.
    expect(isSecretKey(fakeKey("authenticated"))).toBe(false);
  });
});
