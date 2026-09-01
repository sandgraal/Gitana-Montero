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
  currentUserIdIfAny,
  hasStoredSession,
} from "./garage.ts";

/** A `Window` with a real, in-memory `localStorage` exposing `key(i)`. */
function windowWith(
  seed: Record<string, string> = {},
  href = "https://monterogarage.com/en/garage/"
): Window {
  const keys = Object.keys(seed);
  return {
    localStorage: {
      length: keys.length,
      key: (index: number) => keys[index] ?? null,
      getItem: (key: string) => seed[key] ?? null,
    },
    location: { href },
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

describe("currentUserIdIfAny — the composition, not the parts", () => {
  /**
   * The two primitives above are each graded, and that was not enough:
   * dropping the `carriesAuthResponse` branch entirely left every one of
   * those tests green (T2-301 review, M10). What the mutant breaks is the
   * `or`, so the `or` is what these two pin — by observing whether the
   * expensive path was taken, which is the thing the branch decides.
   */
  const SESSION = { "sb-abcdefghijklmnopqrst-auth-token": "{}" };

  it("asks properly when the URL carries a grant but storage is empty", async () => {
    // The magic-link landing: nothing persisted yet, so `hasStoredSession` is
    // false and only the second branch can save this reader from being told
    // to sign in again — a loop with no exit. THIS IS THE M10 MUTANT: delete
    // the `carriesAuthResponse` branch and `ask` is never called.
    const win = windowWith({}, "https://monterogarage.com/en/garage/?code=abc");
    let asked = 0;

    const who = await currentUserIdIfAny(win, async () => {
      asked += 1;
      return "user-1";
    });

    expect(hasStoredSession(win)).toBe(false);
    expect(asked).toBe(1);
    expect(who).toBe("user-1");
  });

  it("does not ask at all when neither branch holds", async () => {
    // The saved download: no session, no grant, so the ~200 kB client is
    // never imported and the reader gets the sign-in prompt immediately.
    const win = windowWith({}, "https://monterogarage.com/en/garage/");
    let asked = 0;

    const who = await currentUserIdIfAny(win, async () => {
      asked += 1;
      return "user-1";
    });

    expect(asked).toBe(0);
    expect(who).toBeNull();
  });

  it("asks when storage has a session, grant or not", async () => {
    // The ordinary returning owner, and the positive control for the pair
    // above: without it, "never asks" would pass by never asking at all.
    const win = windowWith(SESSION, "https://monterogarage.com/es/taller/");
    let asked = 0;

    const who = await currentUserIdIfAny(win, async () => {
      asked += 1;
      return "user-2";
    });

    expect(asked).toBe(1);
    expect(who).toBe("user-2");
  });
});
