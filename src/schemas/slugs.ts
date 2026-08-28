/**
 * Per-locale slug registry validation (I18N-05).
 *
 * > WHERE a collection page has per-locale slugs (e.g. `/en/problems/…`,
 * > `/es/problemas/…`), THE slug registry SHALL map each entry to exactly one
 * > slug per locale, and a CI check SHALL fail on collisions or missing
 * > mappings.
 *
 * `validateSlugRegistry` is the pure core of that CI check: it *returns* the
 * list of issues — empty when the registry is sound — so one run can report a
 * whole bad registry instead of its first problem. T105 wires it into
 * `npm run check:locales` / `verify` and turns a non-empty list into a
 * non-zero exit; T102's routing consumes the registry to emit the routes and
 * the hreflang pairs (I18N-04).
 *
 * Rules, in order of the issue codes:
 *
 * - `missing-slug` — an entry has no slug for a locale, or the slug is empty /
 *   whitespace-only. "Exactly one slug per locale" means both locales, always;
 *   there is no monolingual entry (I18N-06 is the same rule one level down).
 * - `duplicate-slug` — two entries in the **same collection and same locale**
 *   claim the same slug, which is what makes a URL ambiguous. Two entries in
 *   *different* collections may share a slug (the collection segment
 *   disambiguates `/en/parts/x` from `/en/problems/x`), and one entry may
 *   carry the same slug in both locales (many part slugs are the same word in
 *   EN and ES) — neither is a collision.
 * - `unknown-locale` — a locale key outside `["en", "es"]`. Spec §2: "Never
 *   any other value."
 *
 * refs specs/001-foundation (I18N-05)
 */
import { LOCALES, type Locale } from "./entry.ts";

/** `{ [collectionId]: { [entryId]: { en: slug, es: slug } } }`. */
export type SlugRegistry = Readonly<
  Record<string, Readonly<Record<string, Readonly<Record<string, string>>>>>
>;

export type SlugIssueCode =
  "missing-slug" | "duplicate-slug" | "unknown-locale";

export interface SlugRegistryIssue {
  readonly code: SlugIssueCode;
  readonly collection: string;
  readonly entryId: string;
  /** The offending locale key; a `Locale` except on `unknown-locale`. */
  readonly locale: Locale | string;
  /** On `duplicate-slug`, the entry id already holding the slug. */
  readonly conflictsWith?: string;
  readonly message: string;
}

function isKnownLocale(key: string): key is Locale {
  return (LOCALES as readonly string[]).includes(key);
}

/** A slug is only a slug once it survives trimming. */
function normalizeSlug(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

/** Returns every rule violation in the registry; empty array when sound. */
export function validateSlugRegistry(
  registry: SlugRegistry
): readonly SlugRegistryIssue[] {
  const issues: SlugRegistryIssue[] = [];

  for (const [collection, entries] of Object.entries(registry ?? {})) {
    /** `locale -> slug -> the entry id that claimed it first`. */
    const claimed = new Map<Locale, Map<string, string>>();

    for (const [entryId, slugs] of Object.entries(entries ?? {})) {
      for (const key of Object.keys(slugs ?? {})) {
        if (isKnownLocale(key)) continue;
        issues.push({
          code: "unknown-locale",
          collection,
          entryId,
          locale: key,
          message:
            `${collection}/${entryId}: \`${key}\` is not a locale — ` +
            `only ${LOCALES.join(" and ")} exist (spec §2)`,
        });
      }

      for (const locale of LOCALES) {
        const slug = normalizeSlug(slugs?.[locale]);

        if (slug === null) {
          issues.push({
            code: "missing-slug",
            collection,
            entryId,
            locale,
            message:
              `${collection}/${entryId}: no \`${locale}\` slug — every entry ` +
              `needs exactly one slug per locale (I18N-05)`,
          });
          continue;
        }

        const bySlug = claimed.get(locale) ?? new Map<string, string>();
        const holder = bySlug.get(slug);

        if (holder === undefined) {
          bySlug.set(slug, entryId);
          claimed.set(locale, bySlug);
          continue;
        }

        issues.push({
          code: "duplicate-slug",
          collection,
          entryId,
          locale,
          conflictsWith: holder,
          message:
            `${collection}/${entryId}: the \`${locale}\` slug \`${slug}\` is ` +
            `already used by \`${holder}\` — /${locale}/${collection}/${slug} ` +
            `would be ambiguous (I18N-05)`,
        });
      }
    }
  }

  return issues;
}
