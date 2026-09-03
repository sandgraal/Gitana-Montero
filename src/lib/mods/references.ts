/**
 * What a typed mod reference *is*, and what a mod can do to a system, as plain
 * vocabularies with no dependencies (MOD-01, MOD-02).
 *
 * A tiny module on purpose, and for exactly the reason
 * `src/lib/parts/part-numbers.ts` is one. Four consumers need these rules and
 * they are not allowed to reach each other:
 *
 * - `src/schemas/mods.ts` wraps them in Zod to validate one entry (and
 *   re-exports them, so a content author imports them from one place);
 * - `src/lib/mods/index.ts` resolves references across the whole corpus;
 * - `src/lib/mods/filter.ts` orders the impacts for the index page's pills;
 * - `src/integrations/validate-mods.ts` reaches the resolver from inside an
 *   Astro build hook, which Node's own ESM resolver walks — so every module on
 *   that chain must import with an explicit `.ts` extension and must not drag
 *   the whole schema graph in behind it (the constraint `astro.config.mjs`
 *   records for the FIT-02 hook).
 *
 * Keeping the vocabularies here rather than in the schema is what lets the
 * build chain stay a straight line, and it means "which collections may a
 * reference name" has exactly one definition rather than one per caller.
 *
 * refs specs/001-foundation (MOD-01, MOD-02)
 */

/**
 * The shape of an id a mods reference points at — kebab-case and lowercase,
 * per plan.md's "Content conventions" (`g3-suspension-lift-2in`,
 * `all-electrical-dual-battery`).
 *
 * Same shape as `ENTRY_REFERENCE_PATTERN` in `src/schemas/parts.ts`, and
 * deliberately not an import of it: that constant exists to stop a *part
 * number* (`MR455009`, uppercase) being written where a pointer belongs, and
 * tying the two together would mean neither could be narrowed without touching
 * the other collection's guarantees.
 */
export const MOD_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * The collections a typed reference may point into — MOD-02's own two, in the
 * order its sentence names them ("another mod or part").
 *
 * Closed on purpose, and narrower than "every collection". A mod's
 * prerequisites are things you bolt on or things you buy; a `problems` entry
 * is not a prerequisite for anything, and a `procedures` entry is *how* rather
 * than *what*. Widening this list is a schema change and belongs to the task
 * that needs it, never to a drive-by edit (AGENTS.md "Boundaries").
 */
export const MOD_REFERENCE_COLLECTIONS = ["mods", "parts"] as const;

export type ModReferenceCollection = (typeof MOD_REFERENCE_COLLECTIONS)[number];

/** `mods/all-suspension-lift-2in` — one reference as a single comparable key. */
export function modReferenceKey(reference: {
  collection: string;
  id: string;
}): string {
  return `${reference.collection}/${reference.id}`;
}

/**
 * How badly a mod hits the thing it names. **Ordered worst first**, so an
 * index comparison is the ordering and the page can lead with the sentence a
 * reader most needs.
 *
 * Three values, drawn so that no two of them can describe one situation:
 *
 * - `breaks` — after this mod, the named thing no longer works or no longer
 *   fits. The factory rear brake hose is now too short; the factory jack no
 *   longer reaches. The strongest claim on the page.
 * - `degrades` — it still works, and measurably worse. On-road handling after
 *   a lift; fuel consumption after 33s. A reader may accept this knowingly,
 *   which is the whole point of stating it.
 * - `needs-adjustment` — it works once something is re-set or recalibrated,
 *   and nothing is replaced. Headlamp aim after a lift; the speedometer after
 *   a tire-size change; an alignment.
 *
 * Note what is deliberately *not* here: "you also need part X". That is a
 * prerequisite, it belongs in a mod's `requires` list as a typed reference,
 * and giving it a second home in this vocabulary would let one fact be written
 * in two places and disagree with itself.
 */
export const MOD_IMPACTS = ["breaks", "degrades", "needs-adjustment"] as const;

export type ModImpact = (typeof MOD_IMPACTS)[number];

/** The worst impact in {@link MOD_IMPACTS}; the one that leads a page. */
export const MOD_IMPACT_WORST: ModImpact = "breaks";
