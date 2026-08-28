import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  LOCALE_COOKIE_NAME,
  LOCALE_STORAGE_KEY,
  readLocaleCookie,
  readStoredLocale,
  redirectRootToLocale,
  resolveInitialLocale,
  storeLocale,
} from "./locale-preference";

/** A window stub with just the surface the locale-preference module touches. */
function makeWindow(options: {
  languages?: string[];
  language?: string;
  stored?: string | null;
  cookie?: string;
  storageThrows?: boolean;
  pathname?: string;
}) {
  const store = new Map<string, string>();
  if (options.stored) store.set(LOCALE_STORAGE_KEY, options.stored);
  const replace = vi.fn();
  return {
    replace,
    win: {
      localStorage: {
        getItem(key: string) {
          if (options.storageThrows) throw new Error("blocked");
          return store.get(key) ?? null;
        },
        setItem(key: string, value: string) {
          if (options.storageThrows) throw new Error("blocked");
          store.set(key, value);
        },
      },
      document: { cookie: options.cookie ?? "" },
      navigator: {
        languages: options.languages,
        language: options.language,
      },
      location: { pathname: options.pathname ?? "/", replace },
    } as unknown as Window,
    store,
  };
}

describe("readLocaleCookie", () => {
  it("finds the locale cookie among others", () => {
    expect(readLocaleCookie(`a=1; ${LOCALE_COOKIE_NAME}=es; b=2`)).toBe("es");
  });

  it("ignores an unsupported or absent value", () => {
    expect(readLocaleCookie(`${LOCALE_COOKIE_NAME}=fr`)).toBeNull();
    expect(readLocaleCookie("a=1")).toBeNull();
    expect(readLocaleCookie("")).toBeNull();
  });
});

describe("resolveInitialLocale (I18N-02 + I18N-03)", () => {
  it("prefers a stored choice over the browser's languages", () => {
    expect(
      resolveInitialLocale({
        storedLocale: "en",
        acceptLanguage: "es-CR,es;q=0.9",
      })
    ).toBe("en");
  });

  it("negotiates when nothing was stored", () => {
    expect(
      resolveInitialLocale({ storedLocale: null, acceptLanguage: "es-CR" })
    ).toBe("es");
  });

  it("falls back to en when neither says anything usable", () => {
    expect(
      resolveInitialLocale({ storedLocale: "fr", acceptLanguage: "de-DE" })
    ).toBe("en");
    expect(resolveInitialLocale({})).toBe("en");
  });
});

describe("persistence", () => {
  it("reads the choice from localStorage", () => {
    const { win } = makeWindow({ stored: "es" });
    expect(readStoredLocale(win)).toBe("es");
  });

  it("falls back to the cookie when localStorage is unavailable", () => {
    const { win } = makeWindow({
      storageThrows: true,
      cookie: `${LOCALE_COOKIE_NAME}=es`,
    });
    expect(readStoredLocale(win)).toBe("es");
  });

  it("writes both localStorage and a cookie so a server redirect can read it", () => {
    const { win, store } = makeWindow({});
    storeLocale("es", win);
    expect(store.get(LOCALE_STORAGE_KEY)).toBe("es");
    expect(win.document.cookie).toContain(`${LOCALE_COOKIE_NAME}=es`);
    expect(win.document.cookie).toContain("SameSite=Lax");
  });

  it("still records the cookie when localStorage throws", () => {
    const { win } = makeWindow({ storageThrows: true });
    expect(() => storeLocale("en", win)).not.toThrow();
    expect(win.document.cookie).toContain(`${LOCALE_COOKIE_NAME}=en`);
  });
});

describe("redirectRootToLocale (I18N-02)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("sends a Spanish-speaking visitor to /es/", () => {
    const { win, replace } = makeWindow({ languages: ["es-CR", "es", "en"] });
    expect(redirectRootToLocale(win)).toBe("es");
    expect(replace).toHaveBeenCalledWith("/es/");
  });

  it("sends everyone else to /en/", () => {
    const { win, replace } = makeWindow({ languages: ["de-DE", "fr"] });
    expect(redirectRootToLocale(win)).toBe("en");
    expect(replace).toHaveBeenCalledWith("/en/");
  });

  it("honours a stored choice over the browser's languages", () => {
    const { win, replace } = makeWindow({
      languages: ["es-CR"],
      stored: "en",
    });
    expect(redirectRootToLocale(win)).toBe("en");
    expect(replace).toHaveBeenCalledWith("/en/");
  });

  it("does not redirect a page that is already the target", () => {
    const { win, replace } = makeWindow({
      languages: ["en"],
      pathname: "/en/",
    });
    redirectRootToLocale(win);
    expect(replace).not.toHaveBeenCalled();
  });
});
