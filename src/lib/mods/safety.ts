/**
 * The safety-critical judgement for a mods entry (AGENTS.md "Safety and
 * legal"), widened by what the mod affects.
 *
 * ## Why this is not in `src/lib/mods/index.ts`
 *
 * That module is on the `astro:build:start` hook chain, which Node's own ESM
 * resolver walks: every module it reaches must import with an explicit `.ts`
 * extension, all the way down. `src/lib/safety.ts` does not — it imports
 * `../schemas/glossary` extensionless, as a page-side module may — so pulling
 * it onto that chain would either break the hook or force a cascade of
 * extension edits through the whole schema graph, which is exactly the
 * coupling `src/lib/parts/part-numbers.ts`' docstring exists to prevent.
 *
 * Nothing about resolving MOD-02's references needs to know what is
 * safety-critical, so the two never have to meet. This module is read by page
 * templates; the resolver is read by the build hook.
 *
 * refs specs/001-foundation (MOD-01; AGENTS.md "Safety and legal")
 */
import { isSafetyCritical, systemIsSafetyCritical } from "../safety";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null) return null;
  return value as Record<string, unknown>;
}

/** Why a mod page renders the standing bilingual safety notice, if it does. */
export interface ModSafety {
  readonly safetyCritical: boolean;
  /**
   * The systems that made it so, in declaration order: the entry's own
   * `system` first when it qualifies, then every affected system that does.
   * Empty when the verdict came from the `safetyCritical` flag alone —
   * which is the flag's whole purpose (AGENTS.md categories with no
   * `GLOSSARY_SYSTEMS` id).
   */
  readonly systems: readonly string[];
}

/**
 * Whether a mod page renders the standing bilingual safety notice, and which
 * systems are the reason.
 *
 * ## The widening, and why it is the safe direction
 *
 * `isSafetyCritical` answers from an entry's own `system` and its upward-only
 * flag. That is the right rule for a part or a torque figure, whose subject
 * *is* one system. A mod is different in kind: a dual-battery install is
 * honestly filed under `electrical`, and if it `breaks` the ABS module then
 * the page a reader is standing on is a brakes page, whatever its own facet
 * says. AGENTS.md's list is about **what the work touches**, not about how the
 * entry is filed, and `affects[].system` is this collection's structured
 * record of exactly that.
 *
 * So the notice is OR-ed across the entry's own system, its flag, and every
 * system it says it affects. Like the flag itself this only ever **promotes**:
 * there is no input to this function that turns a safety notice off, and
 * `src/schemas/mods.ts` refuses the one value (`safetyCritical: false` on an
 * already-critical system) that would try.
 *
 * The membership test is `systemIsSafetyCritical` — the same function the
 * schema's demotion rule and `isSafetyCritical` use — so there is exactly one
 * copy of AGENTS.md's list in this repo and this module does not own it.
 */
export function modSafety(entry: unknown): ModSafety {
  const record = asRecord(entry);
  if (record === null) return { safetyCritical: false, systems: [] };

  const systems: string[] = [];
  const own = record["system"];
  if (systemIsSafetyCritical(own) && typeof own === "string") {
    systems.push(own);
  }

  const affects = record["affects"];
  if (Array.isArray(affects)) {
    for (const value of affects) {
      const row = asRecord(value);
      if (row === null) continue;
      const system = row["system"];
      if (typeof system !== "string") continue;
      if (!systemIsSafetyCritical(system)) continue;
      if (systems.includes(system)) continue;
      systems.push(system);
    }
  }

  return {
    safetyCritical: isSafetyCritical(record) || systems.length > 0,
    systems,
  };
}
