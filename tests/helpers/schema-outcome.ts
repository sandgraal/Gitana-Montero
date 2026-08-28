/**
 * Small readers over a `safeParse` outcome, so the graders assert on *which
 * field* failed rather than only on "it failed".
 *
 * SCF-04 is specifically about a build error that names the file and the
 * field. The file half is proved end-to-end by T106 (the deliberate
 * one-locale entry that must turn CI red); the field half is what these
 * helpers let the unit graders pin down.
 *
 * They take `unknown` on purpose. T104 will return properly-typed
 * `z.ZodObject`s from the seam, and the graders must keep compiling across
 * that change without an implementer editing `tests/` (AGENTS.md separation
 * rule, audited by T901).
 *
 * refs specs/001-foundation (SCF-04)
 */
import type { SchemaIssue } from "../../src/schemas/entry.ts";

export function issuesOf(outcome: unknown): readonly SchemaIssue[] {
  if (typeof outcome !== "object" || outcome === null) {
    throw new Error("expected a Zod safeParse outcome object");
  }

  const { success, error } = outcome as {
    success?: boolean;
    error?: { issues?: readonly SchemaIssue[] };
  };

  if (success === true) return [];
  if (success === false) {
    if (!error?.issues) throw new Error("expected safeParse error.issues");
    return error.issues;
  }

  throw new Error("expected safeParse outcome with boolean success");
}

/** Dotted field paths of every issue, e.g. `["prose.es"]`. */
export function issuePaths(outcome: unknown): string[] {
  return issuesOf(outcome).map((issue) => issue.path.map(String).join("."));
}

/** Issue codes, e.g. `["invalid_type"]`. */
export function issueCodes(outcome: unknown): string[] {
  return issuesOf(outcome).map((issue) => issue.code);
}

/** Every key reported by an `unrecognized_keys` issue, flattened. */
export function unrecognizedKeys(outcome: unknown): string[] {
  return issuesOf(outcome)
    .filter((issue) => issue.code === "unrecognized_keys")
    .flatMap((issue) => [...(issue.keys ?? [])]);
}
