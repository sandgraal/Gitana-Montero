/**
 * The cheap half of the session question (T2-301).
 *
 * Only the two pure functions are graded here. Everything else in
 * `./garage.ts` is a request against a real database whose *behaviour* is the
 * database's — proved by `tests/garage/`'s live tier against a running stack,
 * where a mocked client would prove nothing at all.
 *
 * What these two decide is worth a unit test on its own: whether the page
 * downloads ~200 kB of Supabase client before telling a signed-out visitor to
 * sign in, and — the direction that actually hurts — whether a signed-in
 * reader is ever shown the sign-in prompt instead of their garage.
 */
import { describe, expect, it } from "vitest";
import {
  SESSION_STORAGE_KEY_PATTERN,
  carriesAuthResponse,
  hasStoredSession,
} from "./garage.ts";

/** A `Window` with a real, in-memory `localStorage` exposing `key(i)`. */
function windowWith(seed: Record<string, string> = {}): Window {
  const keys = Object.keys(seed);
  return {
    localStorage: {
      length: keys.length,
      key: (index: number) => keys[index] ?? null,
      getItem: (key: string) => seed[key] ?? null,
    },
    location: { href: "https://monterogarage.com/en/garage/" },
  } as unknown as Window;
}

describe("hasStoredSession", () => {
  it("finds supabase-js's own persisted session key", () => {
    expect(
      hasStoredSession(
        windowWith({ "sb-abcdefghijklmnopqrst-auth-token": "{}" })
      )
    ).toBe(true);
  });

  it("is false on a browser that has never signed in", () => {
    // The case the whole optimisation exists for: no key, so no client, so no
    // 200 kB download before the sign-in prompt.
    expect(
      hasStoredSession(
        windowWith({
          "monterogarage:vehicle": "{}",
          "monterogarage:locale": "es",
        })
      )
    ).toBe(false);
  });

  it("ignores this site's own preferences, which sit in the same storage", () => {
    expect(SESSION_STORAGE_KEY_PATTERN.test("monterogarage:vehicle")).toBe(
      false
    );
    expect(SESSION_STORAGE_KEY_PATTERN.test("sb-x-auth-token")).toBe(true);
    expect(SESSION_STORAGE_KEY_PATTERN.test("sb--auth-token")).toBe(false);
  });

  it("says no rather than throwing when storage is blocked", () => {
    const hostile = {
      get localStorage(): Storage {
        throw new Error("storage is blocked");
      },
    } as unknown as Window;

    expect(hasStoredSession(hostile)).toBe(false);
  });
});

describe("carriesAuthResponse", () => {
  it("recognises a PKCE code in the query", () => {
    expect(carriesAuthResponse("https://x.test/en/garage/?code=abc")).toBe(
      true
    );
  });

  it("recognises a token in the fragment", () => {
    // The implicit-flow landing: nothing is in storage yet, so without this
    // the page would sign the reader straight back out.
    expect(
      carriesAuthResponse(
        "https://x.test/en/garage/#access_token=abc&type=magiclink"
      )
    ).toBe(true);
  });

  it("recognises an error handed back by the provider", () => {
    expect(
      carriesAuthResponse("https://x.test/en/garage/#error=access_denied")
    ).toBe(true);
    expect(
      carriesAuthResponse("https://x.test/en/garage/?error_description=nope")
    ).toBe(true);
  });

  it("is false for an ordinary visit", () => {
    expect(carriesAuthResponse("https://x.test/en/garage/")).toBe(false);
    expect(carriesAuthResponse("https://x.test/es/taller/#photos")).toBe(false);
  });

  it("is false, not thrown, for something that is not a URL", () => {
    expect(carriesAuthResponse("not a url")).toBe(false);
  });
});
