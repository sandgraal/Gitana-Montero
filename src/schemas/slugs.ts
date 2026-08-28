/**
 * SEAM STUB — declared by T103 [TEST], to be implemented by T104 [PLATFORM].
 *
 * No implementation here: `validateSlugRegistry` throws
 * `not implemented: T104 …`. The graders live in
 * `tests/schemas/slug-registry.test.ts`.
 *
 * ## The contract T104 must satisfy (I18N-05)
 *
 * > WHERE a collection page has per-locale slugs (e.g. `/en/problems/…`,
 * > `/es/problemas/…`), THE slug registry SHALL map each entry to exactly one
 * > slug per locale, and a CI check SHALL fail on collisions or missing
 * > mappings.
 *
 * `validateSlugRegistry` is the pure core of that CI check: it returns the
 * list of issues, empty when the registry is sound. T105 wires it into
 * `npm run check:locales` / `verify` and turns a non-empty list into a
 * non-zero exit; T102 consumes the registry to emit the routes and the
 * hreflang pairs (I18N-04).
 *
 * Rules, in order of the issue codes:
 *
 * - `missing-slug` — an entry has no slug for a locale, or the slug is empty
 *   / whitespace-only. "Exactly one slug per locale" means both locales,
 *   always; there is no monolingual entry (I18N-06 is the same rule one level
 *   down).
 * - `duplicate-slug` — two entries in the **same collection and same locale**
 *   claim the same slug. That is the collision that makes a URL ambiguous.
 *   Scope matters: two entries in *different* collections may share a slug
 *   (the collection segment disambiguates `/en/parts/x` from
 *   `/en/problems/x`), and one entry may legitimately carry the *same* slug
 *   in both locales (many part slugs are identical in EN and ES) — neither is
 *   a collision.
 * - `unknown-locale` — a locale key outside `["en", "es"]`. Spec §2:
 *   "Never any other value."
 *
 * Issues are returned, not thrown, so the check can report every problem in
 * one pass instead of the first one.
 *
 * refs specs/001-foundation (I18N-05)
 */
import type { Locale } from "./entry.ts";
import { SEAM_NOT_IMPLEMENTED } from "./entry.ts";

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

/** Returns every rule violation in the registry; empty array when sound. */
export function validateSlugRegistry(
  registry: SlugRegistry
): readonly SlugRegistryIssue[] {
  void registry;
  throw new Error(
    `${SEAM_NOT_IMPLEMENTED} — validateSlugRegistry is a T103 seam stub in ` +
      `src/schemas/slugs.ts; implement it in T104 ` +
      `(refs specs/001-foundation)`
  );
}
