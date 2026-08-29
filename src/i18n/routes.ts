/**
 * Per-locale collection route segments (I18N-01, I18N-05).
 *
 * A Costa Rican reader looking for the glossary looks for `/es/glosario/`, not
 * `/es/glossary/`. I18N-01 says neither locale is privileged, and leaving the
 * English word in the Spanish URL privileges English in the one place a reader
 * can see it. So the *segment* is per-locale, and this module is the single
 * registry of which segment each collection uses in each locale.
 *
 * ## Why this is not `src/schemas/slugs.ts`
 *
 * I18N-05's registry maps **entries** to slugs (`{ collection: { entryId: {
 * en, es } } }`) — one row per document, checked for collisions inside a
 * collection. This registry maps **collections** to their path segment: one
 * row per collection, and there is exactly one glossary page, not one page per
 * term (GLO-04: "THE glossary SHALL render as a public bilingual reference
 * page", singular; the artboard shows every term as a card on that one page).
 *
 * They are different tables, but the *rule* is identical — exactly one value
 * per locale, no duplicates within a locale, no locale outside `en`/`es`. So
 * this module does not restate the rule: it feeds the registry to
 * {@link validateSlugRegistry}, the same validator I18N-05 uses, and throws at
 * module load if it fails. Module load happens during `astro build`, so a bad
 * registry is a build error rather than a broken link (SCF-04's spirit).
 * `tests/i18n/routes.test.ts` grades the validation itself.
 *
 * When per-entry pages arrive (T401's problem pages and friends), those get
 * `src/schemas/slugs.ts` proper; this registry keeps owning the segment those
 * URLs are nested under.
 *
 * refs specs/001-foundation (I18N-01, I18N-04, I18N-05, GLO-04)
 */
import { LOCALES, type Locale, type LocalizedRoutePaths } from "./routing";
import { validateSlugRegistry } from "../schemas/slugs";

/**
 * Collection id → the path segment it is served under, per locale.
 *
 * Only collections that actually have a page appear here; a collection with no
 * page has no URL to name. Segments are lowercase, hyphenated, and never
 * URL-encoded — `glosario`, not `glosário`.
 */
export const COLLECTION_ROUTE_SEGMENTS = {
  glossary: { en: "glossary", es: "glosario" },
  /** T703a — the public community directory page (COM-01, COM-02). */
  community: { en: "community", es: "comunidad" },
} as const satisfies Readonly<Record<string, Readonly<Record<Locale, string>>>>;

export type CollectionRouteId = keyof typeof COLLECTION_ROUTE_SEGMENTS;

/**
 * The registry name passed to {@link validateSlugRegistry}. It expects a
 * collection→entry→locale nesting; here the "collection" is the registry
 * itself and each "entry" is a collection id, so the issue messages read
 * `collection-routes/glossary: …`.
 */
const REGISTRY_LABEL = "collection-routes";

const registryIssues = validateSlugRegistry({
  [REGISTRY_LABEL]: COLLECTION_ROUTE_SEGMENTS,
});

if (registryIssues.length > 0) {
  throw new Error(
    `COLLECTION_ROUTE_SEGMENTS is not a valid route registry ` +
      `(${registryIssues.length} problem(s)):\n` +
      registryIssues.map((issue) => `  • ${issue.message}`).join("\n") +
      `\nEvery collection page needs exactly one segment per locale, unique ` +
      `within that locale (I18N-05). refs specs/001-foundation`
  );
}

/** The locale-independent route for a collection's page in `locale`. */
export function collectionRoutePath(
  collection: CollectionRouteId,
  locale: Locale
): string {
  return `/${COLLECTION_ROUTE_SEGMENTS[collection][locale]}/`;
}

/**
 * Every locale's route for a collection page, ready for
 * `localizedAlternateLinks` and for the locale switcher — so switching
 * language from `/en/glossary/` lands on `/es/glosario/` and not on a 404.
 */
export function collectionRoutePaths(
  collection: CollectionRouteId
): LocalizedRoutePaths {
  return Object.fromEntries(
    LOCALES.map((locale) => [locale, collectionRoutePath(collection, locale)])
  ) as LocalizedRoutePaths;
}

/**
 * `getStaticPaths` rows for a collection's page: one per locale, carrying the
 * locale's own segment. A page file named `[locale]/[<something>].astro`
 * spreads these to build `/en/glossary/` and `/es/glosario/` from one
 * component (I18N-01: same route, same code, both locales).
 */
export function collectionRouteParams(
  collection: CollectionRouteId,
  segmentParam: string
): { params: Record<string, string> }[] {
  return LOCALES.map((locale) => ({
    params: {
      locale,
      [segmentParam]: COLLECTION_ROUTE_SEGMENTS[collection][locale],
    },
  }));
}
