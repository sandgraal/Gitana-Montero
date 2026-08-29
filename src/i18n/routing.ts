/**
 * Locale routing primitives (I18N-01, I18N-02, I18N-04).
 *
 * Everything here is locale-independent *data and logic* — no user-facing
 * strings live in this module (those belong to `src/i18n/ui.ts`). Every
 * function is pure and takes `base` as an argument so it can be unit-tested
 * without a Vite/Astro environment; the default comes from the single source
 * of truth for the deploy path, `astro.config.mjs` -> `base`, surfaced by
 * Astro as `import.meta.env.BASE_URL`.
 */

export const LOCALES = ["en", "es"] as const;

export type Locale = (typeof LOCALES)[number];

/** Fallback when `Accept-Language` expresses no usable preference (I18N-02). */
export const DEFAULT_LOCALE: Locale = "en";

/**
 * How each locale names itself. This is locale-independent data, not prose:
 * a language switcher shows every option in its own language, so these are
 * stored once and never duplicated per-locale.
 */
export const LOCALE_NATIVE_NAME: Record<Locale, string> = {
  en: "English",
  es: "Español",
};

/**
 * BCP-47 tags for `<html lang>` and any `lang`/`hreflang` attribute that
 * describes *this* document. Region-tagged on purpose: the prose really is
 * Costa Rican Spanish (AGENTS.md — `usted` register, CR vocabulary), and
 * saying so helps screen readers and translation tools.
 */
export const LOCALE_BCP47: Record<Locale, string> = {
  en: "en",
  es: "es-CR",
};

/**
 * Tags for `<link rel="alternate" hreflang>`. Deliberately *not* region-tagged.
 *
 * hreflang is a targeting signal, not a description: `es-CR` tells a search
 * engine "serve this to Spanish speakers in Costa Rica", so a reader in Mexico
 * or Spain matches no alternate and gets dropped to `x-default` — i.e. English.
 * That would privilege one locale over the other, against I18N-01. The page
 * still declares itself `es-CR` via {@link LOCALE_BCP47}; only the targeting
 * signal is broadened.
 */
export const LOCALE_HREFLANG: Record<Locale, string> = {
  en: "en",
  es: "es",
};

export function isLocale(value: unknown): value is Locale {
  return (
    typeof value === "string" && (LOCALES as readonly string[]).includes(value)
  );
}

/**
 * Normalize a configured base path to either `""` (site at the domain root)
 * or `"/segment"` with no trailing slash, so callers can concatenate freely.
 */
export function normalizeBase(base?: string): string {
  const raw = base ?? readConfiguredBase();
  const trimmed = raw.trim().replace(/\/+$/, "");
  if (trimmed === "") return "";
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

function readConfiguredBase(): string {
  // `import.meta.env.BASE_URL` is always defined under Astro and Vite; the
  // fallback keeps plain-node consumers (scripts, tests) working.
  return import.meta.env?.BASE_URL ?? "/";
}

/** Prefix a root-relative path with the deploy base path. */
export function withBase(path: string, base?: string): string {
  const prefix = normalizeBase(base);
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `${prefix}${suffix}`;
}

/** The site root as served (`/` or `/monterogarage/`). */
export function baseHref(base?: string): string {
  return withBase("/", base);
}

/**
 * The href for `routePath` in `locale`. `routePath` is the locale-independent
 * part of the URL and always starts with `/` (`/` for the home page).
 */
export function localeHref(
  locale: Locale,
  routePath = "/",
  base?: string
): string {
  const route = routePath.startsWith("/") ? routePath : `/${routePath}`;
  return withBase(`/${locale}${route}`, base);
}

/**
 * Split a served pathname into its locale and locale-independent route.
 * Returns `locale: null` for paths that are not under a locale prefix (the
 * root redirect shim and the 404 page).
 */
export function splitLocalePath(
  pathname: string,
  base?: string
): { locale: Locale | null; routePath: string } {
  const prefix = normalizeBase(base);
  let rest = pathname;
  if (prefix !== "" && (rest === prefix || rest.startsWith(`${prefix}/`))) {
    rest = rest.slice(prefix.length);
  }
  if (!rest.startsWith("/")) rest = `/${rest}`;
  const segments = rest.split("/");
  const candidate = segments[1] ?? "";
  if (!isLocale(candidate)) {
    return { locale: null, routePath: rest };
  }
  const remainder = `/${segments.slice(2).join("/")}`;
  return { locale: candidate, routePath: remainder === "//" ? "/" : remainder };
}

export interface AlternateLink {
  /** `hreflang` value: a BCP-47 tag, or `x-default`. */
  hreflang: string;
  /** Root-relative href, base path included. */
  href: string;
}

/**
 * A page's route in each locale. Equal to itself in every locale for pages
 * whose path is locale-independent (`/`), and different per locale wherever
 * the segment is translated (`/glossary/` ↔ `/glosario/` — see
 * `src/i18n/routes.ts`).
 */
export type LocalizedRoutePaths = Readonly<Record<Locale, string>>;

/** The same locale-independent route in every locale. */
export function sameRouteInEveryLocale(routePath = "/"): LocalizedRoutePaths {
  return Object.fromEntries(
    LOCALES.map((locale) => [locale, routePath])
  ) as LocalizedRoutePaths;
}

/**
 * The full `hreflang` set for a page whose route differs per locale (I18N-04):
 * one link per locale plus `x-default`.
 *
 * This is the general form — {@link alternateLinks} is the special case where
 * every locale shares one route. Taking a per-locale map rather than a single
 * path is what makes a translated segment safe: emitting `hreflang="es"
 * href="/es/glossary/"` for a page that is actually served at `/es/glosario/`
 * would point at a URL that was never built, which is precisely the
 * asymmetry `check:hreflang` exists to catch.
 *
 * `x-default` points at the default locale's URL, which is also where the root
 * redirect lands when `Accept-Language` matches nothing (I18N-02) — the two
 * rules agree by construction.
 */
export function localizedAlternateLinks(
  routes: LocalizedRoutePaths,
  base?: string
): AlternateLink[] {
  const links: AlternateLink[] = LOCALES.map((locale) => ({
    hreflang: LOCALE_HREFLANG[locale],
    href: localeHref(locale, routes[locale], base),
  }));
  links.push({
    hreflang: "x-default",
    href: localeHref(DEFAULT_LOCALE, routes[DEFAULT_LOCALE], base),
  });
  return links;
}

/**
 * The full `hreflang` set for a page served at the same route in every locale
 * (I18N-04): one link per locale plus `x-default`.
 */
export function alternateLinks(
  routePath = "/",
  base?: string
): AlternateLink[] {
  return localizedAlternateLinks(sameRouteInEveryLocale(routePath), base);
}

/** Absolute URL for a root-relative href, given the configured `site`. */
export function absoluteUrl(
  href: string,
  site: URL | string | undefined
): string {
  if (!site) return href;
  return new URL(href, site).href;
}

interface AcceptLanguageEntry {
  tag: string;
  quality: number;
  order: number;
}

/**
 * Parse an `Accept-Language` header into tags ordered by descending quality,
 * ties broken by the order they appeared in.
 */
export function parseAcceptLanguage(header: string): AcceptLanguageEntry[] {
  return header
    .split(",")
    .map((part, order): AcceptLanguageEntry | null => {
      const [rawTag, ...params] = part.split(";");
      const tag = (rawTag ?? "").trim().toLowerCase();
      if (tag === "") return null;
      let quality = 1;
      for (const param of params) {
        const [key, value] = param.split("=");
        if ((key ?? "").trim().toLowerCase() !== "q") continue;
        const parsed = Number.parseFloat((value ?? "").trim());
        quality = Number.isFinite(parsed) ? parsed : 0;
      }
      if (quality <= 0) return null;
      return { tag, quality, order };
    })
    .filter((entry): entry is AcceptLanguageEntry => entry !== null)
    .sort((a, b) => b.quality - a.quality || a.order - b.order);
}

/**
 * Pick a locale from an `Accept-Language` header (I18N-02). Matching is on the
 * primary subtag, so `es-CR`, `es-419` and `es` all resolve to `es`. `*` and
 * anything unrecognized fall back to {@link DEFAULT_LOCALE}.
 *
 * Shared deliberately with the client-side root redirect so a future
 * server-side or edge redirect negotiates identically.
 */
export function negotiateLocale(header: string | null | undefined): Locale {
  if (!header) return DEFAULT_LOCALE;
  for (const { tag } of parseAcceptLanguage(header)) {
    const primary = tag.split("-")[0] ?? "";
    if (isLocale(primary)) return primary;
  }
  return DEFAULT_LOCALE;
}

/**
 * Build an `Accept-Language`-shaped string from `navigator.languages`, so the
 * browser-side root redirect can reuse {@link negotiateLocale} verbatim.
 */
export function acceptLanguageFromNavigator(
  languages: readonly string[] | undefined,
  fallback?: string
): string {
  const list = languages && languages.length > 0 ? [...languages] : [];
  if (list.length === 0 && fallback) list.push(fallback);
  return list
    .map((tag, index) => {
      if (index === 0) return tag;
      const quality = Math.max(0.1, 1 - index * 0.1);
      return `${tag};q=${quality.toFixed(1)}`;
    })
    .join(",");
}
