/**
 * SEAM STUB — declared by T502a `[TEST]`, to be implemented by T502
 * `[PLATFORM]`.
 *
 * No implementation lives here. Every function below throws
 * `not implemented: T502`; the graders that describe what T502 must build live
 * in `tests/schemas/procedures-*.test.ts` and
 * `tests/pages/procedure-page.render.test.ts`. A test-writer instance authored
 * this file and must not be the instance that fills it in (AGENTS.md
 * separation rule, plan.md "TDD and separation rules", audited by T901).
 *
 * Direct port of the T202 → T203 precedent (`src/lib/fitment/index.ts`), which
 * is the closest thing this repo has to a worked example of a `[TEST]` task
 * that had nothing to import: graders cannot be written against a module that
 * does not resolve, and a grader that fails on a missing import proves
 * nothing. So T502a declares the surface and the semantics; T502 replaces the
 * bodies. `tests/schemas/procedures-seam-contract.test.ts` is the unmarked
 * canary proving today's expected failures are *these* throws and not a broken
 * import.
 *
 * ## The requirements this seam exists to satisfy
 *
 * > **PRC-01** THE `procedures` collection SHALL hold, per entry:
 * > prerequisites, tools (flagging special/SST tools), parts consumed, torque
 * > specs (from shared data, cited), fluid specs and capacities (cited),
 * > step-by-step prose in both locales, time estimate, difficulty 1–5, safety
 * > notes.
 * >
 * > **PRC-02** WHEN a procedure touches a safety-critical system, THE entry
 * > SHALL carry the `safety-critical` flag and render per PRB-03's notice
 * > rules.
 * >
 * > **PRC-03** IF a procedure cites a torque or fluid spec, THEN THE value
 * > SHALL come from shared reference data by ID, never inlined per-locale.
 *
 * ## The entry contract T502a grades
 *
 * Assembled out of parts this repo already shipped, never re-minted — the
 * discipline T501's tasks.md line spells out ("adopt T501's shared
 * `sourceKind.*` label keys unprefixed; never re-mint them", "reuse, never
 * re-mint"). Concretely:
 *
 * - `difficultySchema` / `DIFFICULTY_MIN` / `DIFFICULTY_MAX` and
 *   `FIX_TIME_UNITS` come from `src/schemas/problems.ts`, whose docstring
 *   already says the scale is "exactly as PRB-01 (**and PRC-01**) scale it".
 * - `quantitySchema` comes from `src/schemas/reference.ts`.
 * - `system` is `glossarySystemSchema`, and `safetyCritical` is the same
 *   upward-only flag `parts` and `reference` carry, read by
 *   `src/lib/safety.ts`.
 * - Ordered lists of ids in shared data with an id-keyed prose record per
 *   locale is `problems`' shape (`symptoms` / `causes` / `diagnosticSteps` /
 *   `fixPaths`), reused rather than reinvented.
 *
 * **Shared data** (`procedureShapes().shared`):
 *
 * | field | shape | why |
 * |---|---|---|
 * | `system` | `glossarySystemSchema` | PRC-02's notice, the breadcrumb, the filter |
 * | `safetyCritical` | `boolean` optional | promotes only; never demotes |
 * | `difficulty` | `difficultySchema` (int 1–5) | PRC-01 "difficulty 1–5" |
 * | `time` | `quantitySchema(FIX_TIME_UNITS)` | PRC-01 "time estimate" |
 * | `prerequisites` | `{ id, procedure? }[]`, default `[]` | PRC-01 "prerequisites" |
 * | `tools` | `{ id, special?, sstNumber? }[]`, default `[]` | PRC-01 "tools (flagging special/SST tools)" |
 * | `partsConsumed` | `{ part, quantity? }[]`, default `[]` | PRC-01 "parts consumed" |
 * | `specs` | reference entry ids, default `[]` | PRC-03 — **the** by-ID mechanism |
 * | `steps` | `{ id, specs?, parts? }[]`, at least one | PRC-01 "step-by-step" |
 *
 * **Prose** (`procedureShapes().prose`, per locale, both required):
 *
 * | field | shape | why |
 * |---|---|---|
 * | `title`, `summary` | `string` | the inherited base-entry names |
 * | `steps` | `Record<stepId, string>` | PRC-01 "step-by-step prose in both locales" |
 * | `tools` | `Record<toolId, string>` | a tool's *name* is language, its SST number is not |
 * | `prerequisites` | `Record<prerequisiteId, string>` | "engine cold, truck level" is a sentence |
 * | `safetyNotes` | `string` optional | PRC-01 "safety notes" — required once the entry is safety-critical |
 *
 * Nothing numeric appears in prose, and `defineEntrySchema` throws at define
 * time if it ever does. That is PRC-03's floor, and it is the same guard T207
 * and T501 were graded against.
 *
 * ## Why there is no `parseProcedureEntry` here
 *
 * Because there does not need to be: `src/content.config.ts` **already**
 * registers a `procedures` collection, on the placeholder `baseEntrySchema()`
 * ("their own fields arrive with the phase task that owns them"). So the
 * graders parse through `collections.procedures.schema` — the real registered
 * schema, which is what the site actually applies to a content file — rather
 * than through a seam function that could be implemented correctly while
 * `content.config.ts` kept the placeholder. That is
 * `tests/schemas/collections.test.ts`' lesson stated once more: *a perfect
 * factory does not make the site bilingual if nothing calls it*, and it is
 * `.claude/GRADER-PRINCIPLES.md`'s "grade the end state, not the text".
 *
 * Today that schema accepts none of PRC-01's fields — every one of them comes
 * back as an unrecognized key — which is exactly why the shape graders fail,
 * and the canary pins that reason.
 *
 * ## What T502a deliberately did NOT decide
 *
 * - **The ES route segment's actual word.** T502's tasks.md line puts
 *   "segments and canonical-vs-alias term choice per the glossary" in T502's
 *   hands, and the glossary is the authority — `procedimientos` vs anything
 *   else is a bilingual ruling, not a grader's call. What *is* graded, in
 *   `tests/schemas/procedures-shape.test.ts` ("the collection has a bilingual
 *   route"), is the shape around that choice: a `procedures` row exists, it
 *   carries both locales, the two differ, and the ES segment is not the
 *   English word (I18N-01 — neither locale is privileged, and the one place a
 *   reader can see it privileged is the URL). Those assertions were claimed
 *   here before they existed; the review that caught it (F4) is the reason
 *   they now do.
 * - **The page file's path.** `tests/pages/procedure-page.render.test.ts`
 *   discovers it by glob rather than by a hard-coded specifier; see that
 *   file's header for the one naming convention it does rely on.
 * - **Per-value source attribution** (T501's "T502 owns per-value
 *   attribution"). PRC-03 as written requires the *value* to come from a
 *   reference entry by id; that reference entry carries its own `sources`, so
 *   attribution follows the id. Whether a procedure additionally names which
 *   of its own sources backs which of its own numbers is a design question
 *   nothing in PRC-01..03 settles, and a grader that invented an answer would
 *   be legislating.
 * - **Whether `prerequisites[].procedure` may point outside `procedures`.**
 *   Graded only for the `procedures` case, which is the one PRC-01 implies.
 *
 * refs specs/001-foundation (PRC-01, PRC-02, PRC-03)
 */
import type { z } from "astro/zod";

/** The message every seam throw starts with, asserted by the canary. */
export const SEAM_NOT_IMPLEMENTED = "not implemented: T502";

function seam(symbol: string): Error {
  return new Error(
    `${SEAM_NOT_IMPLEMENTED} — ${symbol} is a T502a seam stub in ` +
      `src/schemas/procedures.ts; implement it in T502 ` +
      `(refs specs/001-foundation)`
  );
}

/* -------------------------------------------------------------------------
 * Vocabularies
 * ---------------------------------------------------------------------- */

/**
 * The `reference` kinds a procedure may cite by id (PRC-03).
 *
 * PRC-03's own words are "a torque or fluid spec". `capacity` and `dimension`
 * are here as well, and the reason is the same one twice: PRC-01 asks for
 * "fluid specs **and capacities**" in the same breath, REF-01 files
 * "capacities/dimensions" as one line, and a capacity or a clearance is a
 * number exactly like a torque is. If a procedure may not inline "88 N·m" it
 * may not inline "2.3 L" or "0.15 mm" either.
 *
 * **`dimension` was excluded in the first draft of this file and that was
 * wrong** (T502a review, F2). The stated reason — "a fact about the truck, not
 * a figure a procedure sets" — does not survive contact with the collection
 * T504 is about to write: valve clearance, belt deflection, endplay, runout
 * and alignment specs are all figures a *procedure* sets, and all of them are
 * `dimension` rows (`src/schemas/reference.ts`, whose `DIMENSION_UNITS` covers
 * length, mass and angle). Excluding the kind left an author with no legal way
 * to cite a clearance, and the only remaining path was to write the number
 * into a sentence — the exact outcome PRC-03 exists to prevent. A closed loop
 * with no correct move in it is a schema bug, not a strict rule.
 *
 * Deliberately **not** here: `fsm-section` (a citation, not a value — it
 * belongs in `sources`) and the three decoder kinds (`vin-position`,
 * `vin-code`, `option-code`), which answer "what does this code mean" and are
 * not figures any job sets. Citing one of those as a "spec" is an authoring
 * mistake with a clear message rather than a silently rendered empty row —
 * see `PROCEDURE_ISSUE_CODES.wrong-spec-kind`. None of them carries a figure,
 * so excluding them closes no loop on an author.
 *
 * Every member must be a real `ReferenceKind`; the canary pins that.
 */
export const PROCEDURE_SPEC_KINDS = [
  "torque",
  "fluid",
  "capacity",
  "dimension",
] as const;

export type ProcedureSpecKind = (typeof PROCEDURE_SPEC_KINDS)[number];

/**
 * The ways the *corpus* can fail to hold together — the questions no single
 * entry can answer, which are therefore the build's and not a schema
 * refinement's. Exactly the division `src/lib/parts/index.ts` records for
 * PRT-03 and `src/lib/fitment/index.ts` for FIT-02.
 */
export const PROCEDURE_ISSUE_CODES = [
  "duplicate-entry-id",
  /** `specs[i]` names no `reference` entry. */
  "unknown-spec",
  /** It names one, of a kind {@link PROCEDURE_SPEC_KINDS} does not admit. */
  "wrong-spec-kind",
  /** `partsConsumed[i].part` names no `parts` entry. */
  "unknown-part",
  /** `prerequisites[i].procedure` names no `procedures` entry. */
  "unknown-prerequisite",
  /** Prerequisites that require each other, directly or around a loop. */
  "prerequisite-cycle",
] as const;

export type ProcedureIssueCode = (typeof PROCEDURE_ISSUE_CODES)[number];

/** One reason the procedures corpus does not hold together. */
export interface ProcedureIssue {
  readonly code: ProcedureIssueCode;
  /** The entry the issue is reported against. */
  readonly entryId: string;
  /** Dotted field path within that entry (SCF-04). */
  readonly field: string;
  /**
   * Every *other* entry the issue is about — the other claimant of a
   * duplicated id, the rest of a cycle. Structured rather than only spelled
   * into the message, because the build caller turns ids into file paths and
   * an error naming one file of two sends the author to the wrong one.
   */
  readonly relatedEntryIds: readonly string[];
  readonly message: string;
}

/* -------------------------------------------------------------------------
 * Per-entry rules
 * ---------------------------------------------------------------------- */

/**
 * The slice of Zod's refinement context the per-entry rules use, declared
 * structurally (rather than importing `z.RefinementCtx`) so
 * {@link checkProcedureEntry} can be called with a plain collector from a unit
 * test — the seam `checkPartsEntry`, `checkReferenceEntry` and
 * `checkProblemEntry` all use.
 */
export interface ProcedureRefineContext {
  addIssue(issue: {
    code: "custom";
    path: PropertyKey[];
    message: string;
  }): void;
}

/**
 * The per-entry rules alone, without the base envelope — the seam every other
 * collection in this repo exports so its rules can be unit-tested, and read,
 * without reconstructing the whole schema.
 */
export function checkProcedureEntry(
  entry: unknown,
  ctx: ProcedureRefineContext
): void {
  void entry;
  void ctx;
  throw seam("checkProcedureEntry");
}

/**
 * The two halves of the entry shape, so a grader can probe the
 * "numbers are never translated" guard at **define** time the way
 * `src/schemas/parts.test.ts` does for `quantityPerVehicle` — building
 * `defineEntrySchema(shared, { ...prose, difficulty: z.number() })` and
 * requiring it to throw.
 *
 * T502 implements it as `() => ({ shared: proceduresShared, prose:
 * proceduresProse })`. It is a function and not two exported objects for one
 * reason only: a plain object cannot throw, and a seam that silently exported
 * `{}` would make the graders below pass for the wrong reason.
 */
export function procedureShapes(): {
  readonly shared: z.ZodRawShape;
  readonly prose: z.ZodRawShape;
} {
  throw seam("procedureShapes");
}

/* -------------------------------------------------------------------------
 * Corpus rules — the build half
 * ---------------------------------------------------------------------- */

/**
 * The three collections the corpus rules compare, read tolerantly from
 * `unknown` exactly as `readParts` / `readSellers` do: shape is the schema's
 * business, and a module that threw on a malformed entry would replace the
 * schema's precise, field-named error with a stack trace.
 */
export interface ProcedureCorpus {
  readonly procedures: readonly unknown[];
  /** The `reference` collection — what `specs[]` ids resolve against. */
  readonly references: readonly unknown[];
  /** The `parts` collection — what `partsConsumed[].part` ids resolve against. */
  readonly parts: readonly unknown[];
}

/**
 * Every reason the procedures corpus does not hold together; empty when it
 * does. The mirror of `findPartIssues`, and the function T502's
 * `astro:build:start` integration turns into a build failure naming every file
 * involved (SCF-04).
 */
export function findProcedureIssues(
  corpus: ProcedureCorpus
): readonly ProcedureIssue[] {
  void corpus;
  throw seam("findProcedureIssues");
}
