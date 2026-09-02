/**
 * The safety-critical rule (AGENTS.md "Safety and legal"), as a pure function.
 *
 * > **Safety-critical systems** — brakes, steering, suspension, fuel,
 * > SRS/airbags, tires and load ratings, towing, jacking and lifting points —
 * > get Opus routing, a standing bilingual safety notice on the page, and both
 * > independent review passes, regardless of how small the diff is.
 *
 * Split out of any page template for the same reason `confidence.ts` is: which
 * entries render the standing bilingual safety notice
 * (HANDOFF-DESIGN's "safety notice" band; PRB-03, PRC-02) is a merge-blocking
 * rule, and a rule that decides whether a warning appears must be unit-testable
 * without a browser or an Astro build. Page templates call
 * {@link isSafetyCritical}; nothing re-derives it from `system` on its own.
 *
 * ## Why the flag is *derived by default* and only ever opted **in** to
 *
 * AGENTS.md's list is a list of systems, so for most entries the answer is
 * already in the data: a torque figure filed under `brakes` is safety-critical
 * whether or not anyone remembered to say so. Asking every author to repeat it
 * makes the notice depend on remembering, which is the one thing a safety
 * default must not do.
 *
 * Several of AGENTS.md's categories have no system id of their own — SRS/
 * airbags, tires and load ratings, and towing / jacking / lifting points —
 * because `GLOSSARY_SYSTEMS` is a parts vocabulary, not a hazard taxonomy.
 * Widening that vocabulary is a taxonomy change and not this module's to
 * make (AGENTS.md "Boundaries").
 *
 * **Towing and jacking/lifting** are, as of the T207 audit (finding F3),
 * derived a second way: {@link requiresSafetyFlagFromSubject} reads an
 * entry's *subject* — its id and its title in each locale — for the words a
 * row about one of those two categories actually uses, bilingually, and the
 * schema requires `safetyCritical: true` when it fires and `system` is not
 * already on {@link SAFETY_CRITICAL_SYSTEMS}. This closes the exact gap the
 * audit named: nothing but an author's memory previously enforced the flag on
 * a towing or jacking-points row.
 *
 * **SRS/airbags and load ratings are deliberately not derived here** — this
 * detector is scoped narrowly to the two categories the audit's failing
 * graders exercise, on the audit's own instruction to stay narrow and
 * word-boundary-safe rather than replicate a broader private table. Those two
 * categories still rely on an author writing `safetyCritical: true` by hand,
 * which is a known, named gap and not a silent one. Widening the detector to
 * cover them is future work, not this fix.
 *
 * The flag is therefore an **upward** override only: it can promote an entry
 * neither the system list nor the subject detector catches, and it can never
 * demote one either does — see `src/schemas/reference.ts`, which rejects
 * `safetyCritical: false` on an entry whose system is already on the list.
 *
 * refs specs/001-foundation (REF-01, PRB-03, PRC-02; AGENTS.md "Safety and legal")
 */
import { GLOSSARY_SYSTEMS, type GlossarySystem } from "../schemas/glossary";

/**
 * The systems from AGENTS.md's safety-critical list that have an id in
 * `GLOSSARY_SYSTEMS`. Typed as `GlossarySystem[]`, so renaming or dropping a
 * system id is a type error here rather than a silently-empty match.
 *
 * - `brakes`, `steering`, `suspension`, `fuel` — named verbatim by AGENTS.md.
 * - `wheels-tires` — AGENTS.md's "tires and load ratings".
 *
 * Not on the list, and deliberately: `engine`, `transmission`,
 * `transfer-case`, `drivetrain`. They are high-consequence to get *wrong*, but
 * AGENTS.md draws its line at systems whose failure hurts someone rather than
 * at systems that are expensive, and a notice on every page is a notice nobody
 * reads (the same reasoning as the glossary confidence-caveat carve-out).
 */
export const SAFETY_CRITICAL_SYSTEMS: readonly GlossarySystem[] = [
  "brakes",
  "steering",
  "suspension",
  "fuel",
  "wheels-tires",
];

const SAFETY_CRITICAL_SYSTEM_SET: ReadonlySet<string> = new Set(
  SAFETY_CRITICAL_SYSTEMS
);

/** Every id in {@link SAFETY_CRITICAL_SYSTEMS} is a real system id. */
export function safetyCriticalSystemsAreKnown(): boolean {
  return SAFETY_CRITICAL_SYSTEMS.every((system) =>
    (GLOSSARY_SYSTEMS as readonly string[]).includes(system)
  );
}

/** The shape this rule reads — narrowed to the two fields it needs. */
export interface SafetyCriticalSource {
  readonly system?: unknown;
  readonly safetyCritical?: unknown;
}

/**
 * Whether an entry must render the standing bilingual safety notice.
 *
 * True when the entry's `system` is on {@link SAFETY_CRITICAL_SYSTEMS}, or
 * when the entry says so explicitly with `safetyCritical: true`. The two are
 * OR-ed, never AND-ed: the flag promotes, it does not gate.
 *
 * Takes a loose shape on purpose — the same function answers for a `reference`
 * entry today and for `problems` / `procedures` entries when PRB-03 and PRC-02
 * land, and those collections' schemas do not exist yet.
 */
export function isSafetyCritical(entry: SafetyCriticalSource): boolean {
  if (entry.safetyCritical === true) return true;
  return (
    typeof entry.system === "string" &&
    SAFETY_CRITICAL_SYSTEM_SET.has(entry.system)
  );
}

/**
 * Whether `safetyCritical: false` on this entry would be a contradiction —
 * i.e. whether the system alone already makes it safety-critical.
 *
 * Exported so the schema refinement that rejects the demotion and this module
 * agree by construction rather than by two copies of the same membership test.
 */
export function systemIsSafetyCritical(system: unknown): boolean {
  return typeof system === "string" && SAFETY_CRITICAL_SYSTEM_SET.has(system);
}

/* -------------------------------------------------------------------------
 * Subject-derived promotion (T207 audit, finding F3)
 *
 * Towing and jacking/lifting points have no `GLOSSARY_SYSTEMS` id (see the
 * module docstring), so `isSafetyCritical` cannot reach them from `system`
 * alone. Below is a second, narrower derivation: read what an entry's
 * *subject* — its id and its title in each locale — actually names, and
 * require the manual flag when it names one of those two categories and
 * `system` does not already cover it.
 * ---------------------------------------------------------------------- */

/**
 * The word forms a row about towing, or about jacking/lifting points, is
 * written with — bilingually, because a detector that only reads English is
 * a gate half the site walks around.
 *
 * Word-boundary safe on purpose: an unbounded `tow` would flag "toward" and
 * an unbounded `lift` would flag "lifter" (a valve lifter is an engine part,
 * not a hoist). Kept deliberately narrow to these two categories — the ones
 * this fix's graders exercise — rather than widened to SRS/airbags or load
 * ratings, which is a larger table this fix does not attempt (see the module
 * docstring).
 */
const SAFETY_SUBJECT_PATTERNS: readonly RegExp[] = [
  // towing (en)
  /\btow(s|ing|ed|ball|balls|bar|bars)?\b/i,
  // jacking (en)
  /\bjack(s|ing)?\b/i,
  // lifting (en)
  /\blift(s|ing|ed)?\b/i,
  // remolque / remolcar (es) — towing
  /\bremol(c|qu)\w*\b/i,
  // gata / gatas (es) — jack
  /\bgat[ao]s?\b/i,
  // elevador (es) — lift/hoist
  /\belevador(es)?\b/i,
  // puntos de apoyo (es) — jack/support points
  /\bpuntos? de apoyo\b/i,
  // levantar (es) — to lift
  /\blevant\w*\b/i,
];

/** The subject fields a row is judged by: its id, and its title per locale. */
function subjectFields(entry: SafetySubjectSource): string[] {
  const fields: string[] = [];
  if (typeof entry.id === "string") fields.push(entry.id);

  const prose = entry.prose;
  if (typeof prose !== "object" || prose === null) return fields;

  for (const value of Object.values(prose as Record<string, unknown>)) {
    if (typeof value !== "object" || value === null) continue;
    const title = (value as { title?: unknown }).title;
    if (typeof title === "string") fields.push(title);
  }
  return fields;
}

/** The shape this detector reads — an entry's id and its bilingual prose. */
export interface SafetySubjectSource {
  readonly id?: unknown;
  readonly prose?: unknown;
}

/**
 * Whether an entry's subject names towing, or jacking/lifting points —
 * AGENTS.md safety-critical categories `system` cannot reach on its own.
 *
 * Scope note, deliberately: only the entry's id and title are read, not its
 * summary. A row whose *subject* is something else but whose summary
 * mentions jacking in passing (a suspension-lift entry changing ground
 * clearance, a table of contents naming a lifting/jacking sub-section) is
 * correctly left alone — the flag belongs to the row that *is* that subject.
 */
export function requiresSafetyFlagFromSubject(
  entry: SafetySubjectSource
): boolean {
  const fields = subjectFields(entry);
  return SAFETY_SUBJECT_PATTERNS.some((pattern) =>
    fields.some((field) => pattern.test(field))
  );
}
