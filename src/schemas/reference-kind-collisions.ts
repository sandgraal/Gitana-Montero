/**
 * The `reference` collection's field-collision guard, and **only** that.
 *
 * The rule it enforces belongs to `src/schemas/reference.ts` and is documented
 * there: every kind's fields are flattened, optional, into one shared shape, so
 * two kinds may declare the same field name only when it is *literally the same
 * schema object*. Anything else would be resolved by last-writer-wins, silently,
 * and one kind would start validating against another kind's rules.
 *
 * ## Why it lives in a file of its own (T208)
 *
 * T207's review left a residual: the guard's *function* was pinned by unit
 * tests, but the **module-level call** that runs it against the real
 * `REFERENCE_KIND_SHAPES` was not. Delete that one statement and every test
 * stayed green — which is precisely the shape of code a later refactor removes
 * without anyone noticing, and T208 (the first task to actually add kinds) is
 * the task the guard exists for.
 *
 * Pinning a call site means observing that the call happened. Under ESM the only
 * way to observe a call a module makes *to itself* is to move the callee behind
 * a module boundary that a test can substitute: `src/schemas/reference.test.ts`
 * mocks this module and asserts, on a fresh import of `reference.ts`, both that
 * the guard was invoked with the real shapes and that its failure is not
 * swallowed. That test fails the moment the call is deleted, commented out, or
 * wrapped in a `try`.
 *
 * So this file is a seam, not a home for logic: nothing else belongs in it, and
 * `reference.ts` re-exports {@link assertNoFieldCollisions} so no importer had
 * to change.
 *
 * refs specs/001-foundation (REF-01)
 */

/**
 * `capacityQuantity.optional()` and `capacityQuantity` are the same field, one
 * of which a kind happens to require. Unwrapping the wrapper is what lets the
 * comparison below be identity — the strictest test available, and the only one
 * that cannot be fooled by two structurally-similar-but-different schemas.
 */
function unwrapOptional(schema: unknown): unknown {
  const candidate = schema as { unwrap?: unknown };
  return typeof candidate?.unwrap === "function"
    ? (candidate.unwrap as () => unknown)()
    : schema;
}

/**
 * Throws when two kinds declare one field name with different schemas.
 *
 * Parameterised (rather than reading `REFERENCE_KIND_SHAPES` directly) so the
 * guard itself is testable without mutating the real shapes — T207 review, F2.
 */
export function assertNoFieldCollisions(
  shapes: Record<string, Record<string, unknown>>
): void {
  const declaredBy = new Map<string, { kind: string; schema: unknown }>();
  for (const [kind, shape] of Object.entries(shapes)) {
    for (const [field, schema] of Object.entries(
      shape as Record<string, unknown>
    )) {
      const existing = declaredBy.get(field);
      if (
        existing !== undefined &&
        unwrapOptional(existing.schema) !== unwrapOptional(schema)
      ) {
        throw new Error(
          `\`${field}\` is declared by \`${existing.kind}\` and by \`${kind}\` ` +
            `with a different schema: two reference kinds may share a field ` +
            `name only when it is literally the same field (see ` +
            `\`capacityQuantity\` in src/schemas/reference.ts). Rename one, or ` +
            `hoist the shared schema. refs specs/001-foundation (REF-01)`
        );
      }
      declaredBy.set(field, { kind, schema });
    }
  }
}
