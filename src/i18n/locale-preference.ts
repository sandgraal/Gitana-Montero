/**
 * Locale preference persistence (I18N-03) and the decision the root redirect
 * makes (I18N-02).
 *
 * The site is statically hosted, so there is no server to read
 * `Accept-Language` on `/`. The browser stands in for it: `navigator.languages`
 * is the same preference list the header is built from, and
 * `negotiateLocale` — the one implementation, shared with any future
 * server-side redirect — picks from it.
 *
 * An explicit choice always beats negotiation. The choice is written to both
 * `localStorage` (for this code) and a cookie (so an edge/server redirect can
 * read it later without JavaScript).
 */

import {
  DEFAULT_LOCALE,
  acceptLanguageFromNavigator,
  baseHref,
  isLocale,
  localeHref,
  negotiateLocale,
  type Locale,
} from "./routing";

export const LOCALE_STORAGE_KEY = "gitana:locale";
export const LOCALE_COOKIE_NAME = "gitana_locale";
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

/** Read a locale out of a `document.cookie` string. Pure, for testing. */
export function readLocaleCookie(cookieString: string): Locale | null {
  for (const part of cookieString.split(";")) {
    const [name, ...rest] = part.split("=");
    if ((name ?? "").trim() !== LOCALE_COOKIE_NAME) continue;
    const value = decodeURIComponent(rest.join("=").trim());
    if (isLocale(value)) return value;
  }
  return null;
}

/**
 * The locale to serve someone who arrived at `/`: their stored choice if they
 * ever made one, otherwise `Accept-Language` negotiation, otherwise `en`.
 */
export function resolveInitialLocale(input: {
  storedLocale?: string | null;
  acceptLanguage?: string | null;
}): Locale {
  if (isLocale(input.storedLocale)) return input.storedLocale;
  return negotiateLocale(input.acceptLanguage ?? null);
}

function safeReadStorage(win: Window): string | null {
  try {
    return win.localStorage.getItem(LOCALE_STORAGE_KEY);
  } catch {
    // Storage can throw in private mode or with third-party cookies blocked.
    return null;
  }
}

/** The visitor's remembered choice, from `localStorage` or the cookie. */
export function readStoredLocale(win: Window): Locale | null {
  const fromStorage = safeReadStorage(win);
  if (isLocale(fromStorage)) return fromStorage;
  return readLocaleCookie(win.document.cookie);
}

/** Persist an explicit locale choice for subsequent visits (I18N-03). */
export function storeLocale(locale: Locale, win: Window): void {
  try {
    win.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // Non-fatal: the cookie below still carries the choice.
  }
  const path = baseHref();
  win.document.cookie = `${LOCALE_COOKIE_NAME}=${locale}; path=${path}; max-age=${ONE_YEAR_SECONDS}; SameSite=Lax`;
}

/**
 * Record the locale when the visitor uses the switcher. Delegated, so it keeps
 * working for switchers rendered after load.
 */
export function rememberLocaleFromClick(root: Document): void {
  root.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) return;
    const link = target.closest("[data-locale-choice]");
    const choice = link?.getAttribute("data-locale-choice");
    if (isLocale(choice)) storeLocale(choice, root.defaultView ?? window);
  });
}

/**
 * Send a visitor who landed on the site root to their locale. Called only by
 * the root redirect page.
 */
export function redirectRootToLocale(win: Window): Locale {
  const locale = resolveInitialLocale({
    storedLocale: readStoredLocale(win),
    acceptLanguage: acceptLanguageFromNavigator(
      win.navigator?.languages,
      win.navigator?.language
    ),
  });
  const target = localeHref(locale, "/");
  if (win.location.pathname !== target) {
    win.location.replace(target);
  }
  return locale;
}

export { DEFAULT_LOCALE };
