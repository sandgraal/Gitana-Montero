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
 * Two of AGENTS.md's categories have no system id of their own —
 * SRS/airbags, and towing / jacking / lifting points — because
 * `GLOSSARY_SYSTEMS` is a parts vocabulary, not a hazard taxonomy. Widening
 * that vocabulary is a taxonomy change and not this module's to make, so those
 * entries carry an explicit `safetyCritical: true` instead. The flag is
 * therefore an **upward** override only: it can promote an entry the system
 * list does not catch, and it can never demote one it does — see
 * `src/schemas/reference.ts`, which rejects `safetyCritical: false` on an
 * entry whose system is already on the list.
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
