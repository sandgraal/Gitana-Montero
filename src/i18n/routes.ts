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
  /**
   * T2-202 — the sign-in / account page (002 ACC-01, ACC-02).
   *
   * Not a content collection: it has no entries and never will. It is here
   * because this registry is what `BaseLayout` reads to emit hreflang pairs
   * and what the locale switcher reads to cross between `/en/sign-in/` and
   * `/es/ingresar/` — and a second registry with the same rule, for the same
   * job, is how the two drift apart. The type is
   * `Record<string, Record<Locale, string>>`, so "collection" was always the
   * *usual* caller rather than the only permitted one.
   */
  signIn: { en: "sign-in", es: "ingresar" },
  /**
   * T2-301 — the garage: a user's vehicles and their profiles (002 GAR-01′).
   *
   * The ES segment is **`taller`**, not `garaje`. That is the glossary's
   * ruling, not a preference: `all-general-taller` is the canonical term and
   * lists `garaje` as an alias tagged `ES`/`MX` — Spain and Mexico — which is
   * exactly the kind of regional variant AGENTS.md keeps out of prose and out
   * of URLs. In Costa Rica the place where the work happens is the taller, and
   * the ES sign-in page has been saying "Ingrese a su taller" since T2-202. A
   * `/es/garaje/` would have been the English word wearing a Spanish accent.
   */
  garage: { en: "garage", es: "taller" },
  /**
   * T401 — the symptom-driven problem finder (PRB-01…PRB-05).
   *
   * **The ES segment is `problemas`, deliberately, and not `fallas`.** The
   * glossary designates `falla` as the canonical Costa Rican term for a
   * *fault* (`all-general-falla`, EN headword "fault"), with `avería` as the
   * peninsular alias to keep out of prose — and `problema` appears nowhere in
   * that entry's aliases, so nothing in GLO-02 is engaged either way. The
   * choice was made on three other grounds:
   *
   * 1. **They are not the same concept at this level.** A `falla` is the thing
   *    that failed; a `problems` entry is the documented *case* — symptoms,
   *    diagnosis, causes, fix paths — of which the fallas are the `causes`
   *    field. The schema draws that line explicitly, and naming the section
   *    after its own sub-part would blur it.
   * 2. **Symmetry (I18N-01).** The glossary's EN headword for `falla` is
   *    "fault", not "problem". Taking `fallas` in ES while EN stays `problems`
   *    would narrow the section's meaning in one locale only — the precise
   *    asymmetry "neither locale privileged" exists to prevent — and the
   *    honest symmetric alternative, `/en/faults/`, contradicts the spec's own
   *    collection name.
   * 3. **The artboard and the spec agree.** I18N-05's worked example is
   *    `/es/problemas/…`, and the ES problem artboard's breadcrumb reads
   *    "Problemas".
   *
   * Contrast `garage` → `taller` above, where the glossary *did* rule on the
   * exact concept (`garaje` is a tagged ES/MX alias of the canonical
   * `taller`). Here it did not, so the deciding argument is the concept
   * boundary, not the vocabulary.
   */
  problems: { en: "problems", es: "problemas" },
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
