/**
 * SEAM STUB — declared by T103 [TEST], to be implemented by T104 [PLATFORM].
 *
 * This file contains **no implementation**. Every export below throws
 * `not implemented: T104 …` when touched. It exists only so the graders in
 * `tests/schemas/` compile and fail for a single, legible reason today.
 *
 * ## Why the schemas live here and not in `src/content.config.ts`
 *
 * `astro:content` is a virtual module: Vitest cannot resolve it without the
 * Astro Vite plugin, so anything importing it is not unit-testable. Keep the
 * Zod building blocks in this plain module (Zod comes from `astro/zod`, the
 * same instance `astro:content` re-exports) and have `src/content.config.ts`
 * import them to call `defineCollection`. SCF-01 is still satisfied: the
 * collections are *defined in* `content.config.ts`, they are just *built
 * from* this module.
 *
 * ## The contract T104 must satisfy
 *
 * - `LOCALES` — exactly `["en", "es"]`, in that order. Spec §2 "Locale":
 *   never any other value.
 * - `localeSchema` — accepts only those two literals.
 * - `CONFIDENCE_TIERS` — the five tiers of spec §2, ordered **strongest
 *   evidence first** (index 0 = strongest). The total order is ratified by
 *   the owner (2026-08-27) and graded exactly:
 *   `["fsm-confirmed", "tsb", "community-consensus", "first-hand",
 *   "anecdotal"]`. `first-hand` sits between `community-consensus` and
 *   `anecdotal`, not at the end of the chain as spec §2 originally listed
 *   it. See `tests/schemas/entry-primitives.test.ts`.
 * - `confidenceSchema` — accepts only those five tiers.
 * - `SOURCE_KINDS` / `sourceSchema` — plan.md "Content conventions": every
 *   source carries `{ title, url, archiveUrl, accessed, kind }`, all
 *   required. AGENTS.md requires the archive URL at citation time.
 *   **`url` and `archiveUrl` must reject non-http(s) schemes.** Note that
 *   `z.string().url()` in `astro/zod` accepts `javascript:alert(1)`, so a
 *   bare `.url()` is not enough — constrain the protocol.
 * - `fitmentSchema` — the T104 *placeholder* shape (spec §2 "Fitment"):
 *   `gens` required and non-empty, the rest optional. Validating gen/market/
 *   engine IDs against the taxonomy is FIT-02, i.e. T203, not T104.
 * - `defineEntrySchema(shared, prose)` — the one factory every collection
 *   schema is built from. It produces
 *   `{ id, fitment, confidence, sources, ...shared, prose: { en, es } }`
 *   where:
 *   - both locales are required with no escape hatch (I18N-06);
 *   - the per-locale prose objects and the entry object reject unknown keys
 *     (SCF-04 wants a named field, not a silent strip);
 *   - **prose string fields reject blank and whitespace-only values** — a
 *     present-but-empty locale is a locale that is lacking, which is the
 *     obvious loophole for shipping a monolingual entry past I18N-06;
 *   - **`id` rejects the empty string** for the same reason;
 *   - the factory **throws at define time** if the prose shape declares a
 *     numeric field — the structural half of AGENTS.md "numbers are never
 *     translated". The thrown error must name the offending field. The check
 *     recurses: `optional` / `nullable` / `default` wrappers and `array`,
 *     `object`, `union`, `tuple` and `record` children all count, and
 *     `bigint` counts as numeric. A one-level check is not a check —
 *     `specs: z.object({ torqueNm: z.number() })` duplicates a figure per
 *     locale exactly like a top-level field would.
 *
 * `defineEntrySchema` is also the only sanctioned way to build a collection
 * schema. `src/content.config.ts` must call it rather than hand-rolling a
 * shape, because `tests/schemas/collections.test.ts` grades the *registered*
 * collections, not just this factory.
 *
 * Activation: delete this stub body, implement for real, then remove the
 * `.fails` marker from each grader in `tests/schemas/` and delete
 * `tests/schemas/seam-contract.test.ts` (see its header).
 *
 * refs specs/001-foundation (I18N-05, I18N-06, SCF-01, SCF-04)
 */
import type { z } from "astro/zod";

/** Message prefix the T103 canary grader asserts on. Do not reword. */
export const SEAM_NOT_IMPLEMENTED = "not implemented: T104";

const seam = (symbol: string): never => {
  throw new Error(
    `${SEAM_NOT_IMPLEMENTED} — ${symbol} is a T103 seam stub in ` +
      `src/schemas/entry.ts; implement it in T104 ` +
      `(refs specs/001-foundation)`
  );
};

/** A stub value that throws the seam error on any property access. */
const seamValue = <T extends object>(symbol: string): T =>
  new Proxy({} as T, {
    get: (_target, property) => seam(`${symbol}.${String(property)}`),
    has: () => seam(`${symbol} (\`in\` check)`),
    ownKeys: () => seam(`${symbol} (key enumeration)`),
  });

/* -------------------------------------------------------------------------
 * The structural schema surface the graders use.
 *
 * Deliberately loose so T104 can return fully-typed `z.ZodObject`s without
 * the graders needing an edit — implementers must not touch `tests/`.
 * ---------------------------------------------------------------------- */

export interface SchemaIssue {
  readonly code: string;
  readonly path: readonly PropertyKey[];
  readonly message: string;
  /** Present on `unrecognized_keys` issues. */
  readonly keys?: readonly string[];
}

export type SafeParseOutcome =
  | { readonly success: true; readonly data: unknown }
  | {
      readonly success: false;
      readonly error: { readonly issues: readonly SchemaIssue[] };
    };

export interface ParsingSchema {
  safeParse(value: unknown): SafeParseOutcome;
}

/* -------------------------------------------------------------------------
 * Locales — spec §2 "Locale", I18N-06
 * ---------------------------------------------------------------------- */

export type Locale = "en" | "es";

/** Exactly `["en", "es"]`. */
export const LOCALES: readonly Locale[] =
  seamValue<readonly Locale[]>("LOCALES");

export const localeSchema: ParsingSchema =
  seamValue<ParsingSchema>("localeSchema");

/* -------------------------------------------------------------------------
 * Confidence tiers — spec §2, AGENTS.md "Facts"
 * ---------------------------------------------------------------------- */

export type ConfidenceTier =
  "fsm-confirmed" | "tsb" | "community-consensus" | "first-hand" | "anecdotal";

/** The five tiers, ordered strongest evidence first. */
export const CONFIDENCE_TIERS: readonly ConfidenceTier[] =
  seamValue<readonly ConfidenceTier[]>("CONFIDENCE_TIERS");

export const confidenceSchema: ParsingSchema =
  seamValue<ParsingSchema>("confidenceSchema");

/* -------------------------------------------------------------------------
 * Sources — plan.md "Content conventions", AGENTS.md "Cite what you read"
 * ---------------------------------------------------------------------- */

export type SourceKind =
  "fsm" | "tsb" | "forum" | "video" | "vendor" | "first-hand";

export const SOURCE_KINDS: readonly SourceKind[] =
  seamValue<readonly SourceKind[]>("SOURCE_KINDS");

export const sourceSchema: ParsingSchema =
  seamValue<ParsingSchema>("sourceSchema");

/* -------------------------------------------------------------------------
 * Fitment placeholder — spec §2 "Fitment", AGENTS.md "explicit fitment"
 * ---------------------------------------------------------------------- */

export const fitmentSchema: ParsingSchema =
  seamValue<ParsingSchema>("fitmentSchema");

/* -------------------------------------------------------------------------
 * The entry factory — plan.md "The data/prose split"
 * ---------------------------------------------------------------------- */

/**
 * Builds a collection entry schema from a locale-independent `shared` shape
 * and a per-locale `prose` shape. Throws, naming the field, if `prose`
 * declares a numeric field.
 */
export function defineEntrySchema(
  shared: z.ZodRawShape,
  prose: z.ZodRawShape
): ParsingSchema {
  void shared;
  void prose;
  return seam("defineEntrySchema");
}
