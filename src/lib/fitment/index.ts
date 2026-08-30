/**
 * SEAM STUB — declared by T202 [TEST], to be implemented by T203 [PLATFORM].
 *
 * No implementation lives here. Every export below throws
 * `not implemented: T203 …`; the graders that describe what T203 must build
 * live in `tests/lib/fitment/`. A test-writer instance authored this file and
 * must not be the instance that fills it in (AGENTS.md separation rule,
 * plan.md "TDD and separation rules", audited by T901).
 *
 * ## Why the seam exists at all
 *
 * FIT-01: "THE fitment engine SHALL live in `src/lib/fitment/` with unit
 * tests, and SHALL be the only code that interprets fitment queries." Graders
 * cannot be written against a module that does not resolve, and a grader that
 * fails on a missing import proves nothing. So T202 declares the surface and
 * the semantics; T203 replaces the bodies. `tests/lib/fitment/seam-contract.test.ts`
 * is the unmarked canary proving today's expected failures are *these* throws
 * and not a broken import.
 *
 * ## What T203 must satisfy
 *
 * - **FIT-02** — "WHEN an entry declares a fitment, THE build SHALL resolve it
 *   against the taxonomy and fail on any reference to a nonexistent ID or an
 *   impossible combination (per VEH-03)." That is `validateEntryFitments`
 *   (pure, returns every issue) plus `assertFitmentsResolve` (the build path,
 *   which throws). Two issue codes because the requirement names two failure
 *   classes.
 * - **FIT-04** — "THE fitment engine SHALL answer 'does entry E apply to
 *   vehicle V' deterministically, with boundary-year tests." That is
 *   `entryAppliesTo` / `matchesVehicle`, plus `generationsInProduction` for
 *   the 1999 Gen 2.5 / Gen 3 overlap the requirement names.
 * - **VEH-03's four resolver rules**, documented verbatim in
 *   `src/schemas/vehicles.ts` and restated on `classifyCombination` below.
 *   Those rules are the reason `CombinationVerdict` has three values and not
 *   two: "absent" is not one answer.
 * - **`gen2-5`'s `parentGeneration: "gen2"`** — `src/schemas/vehicles.ts`:
 *   "the resolver (T203) is what expands `gens: ["gen2"]` to its children."
 *   That is `expandGenerations`.
 *
 * ## What T202 deliberately did NOT decide
 *
 * `fitment.drive` is in spec §2's fitment shape and in `fitmentSchema`, but
 * VEH-01 defines no drive taxonomy, so there is no vocabulary for a drive id
 * to resolve against. tasks.md (T203) says this "needs a ruling, not an
 * invented vocabulary". No function here interprets `drive`, and the graders
 * pin only the one thing that follows from the spec without a ruling: an
 * *omitted* `drive` changes no answer. The skipped grader in
 * `tests/lib/fitment/resolution.test.ts` names the open ruling.
 *
 * refs specs/001-foundation (FIT-01, FIT-02, FIT-04, VEH-03)
 */

/** The message every seam throw starts with, asserted by the canary. */
export const SEAM_NOT_IMPLEMENTED = "not implemented: T203";

function seam(symbol: string): Error {
  return new Error(
    `${SEAM_NOT_IMPLEMENTED} — ${symbol} is a T202 seam stub in ` +
      `src/lib/fitment/index.ts; implement it in T203 ` +
      `(refs specs/001-foundation)`
  );
}

/* -------------------------------------------------------------------------
 * Types
 * ---------------------------------------------------------------------- */

/**
 * The taxonomy index the resolver answers questions against.
 *
 * Deliberately opaque: T202 grades *answers*, not the shape of the index, so
 * T203 is free to choose it. Declared as an interface with no required member
 * so any concrete index is assignable.
 */
export interface Taxonomy {
  readonly [key: string]: unknown;
}

/**
 * One vehicle a reader could be looking at.
 *
 * `gen`, `market`, `year` and `engine` are required because FIT-03 fixes
 * exactly that quadruple as a selection ("WHEN a visitor selects a vehicle
 * (gen + market + year + engine)"). The rest are optional: the spec's fitment
 * shape can restrict them, but nothing in phase 2 says a *selection* must
 * state them.
 */
export interface VehicleSelection {
  readonly gen: string;
  readonly market: string;
  readonly year: number;
  readonly engine: string;
  readonly transmission?: string;
  readonly transferCase?: string;
  readonly trim?: string;
}

/**
 * What the taxonomy knows about one exact powertrain tuple in one
 * (generation, market, year) scope.
 *
 * Three values, not a boolean, because VEH-03's whole point is that "not
 * listed" splits into two very different answers — see `classifyCombination`.
 */
export type CombinationVerdict = "existed" | "impossible" | "unknown";

/** The two failure classes FIT-02 names, in FIT-02's order. */
export const FITMENT_ISSUE_CODES = [
  "unknown-id",
  "impossible-combination",
] as const;

export type FitmentIssueCode = (typeof FITMENT_ISSUE_CODES)[number];

/**
 * One reason a declared fitment does not resolve.
 *
 * `path` is relative to the entry (`["fitment", "engines", 0]`) so the build
 * error names the field and not just the entry — SCF-04 ("names the file and
 * the field"), which the entry schema already honours and the resolver must
 * not regress.
 */
export interface FitmentIssue {
  readonly code: FitmentIssueCode;
  /** `id` of the entry whose fitment failed. */
  readonly entryId: string;
  readonly path: readonly (string | number)[];
  readonly message: string;
}

/* -------------------------------------------------------------------------
 * Building the index
 * ---------------------------------------------------------------------- */

/**
 * Builds the resolver's index from the parsed `vehicles` collection.
 *
 * Takes `unknown[]` on purpose: the graders feed it real entry objects read
 * off disk, and T203 is free to narrow the parameter to its own entry type
 * without a test-file edit.
 */
export function buildTaxonomy(entries: readonly unknown[]): Taxonomy {
  void entries;
  throw seam("buildTaxonomy");
}

/* -------------------------------------------------------------------------
 * Generations
 * ---------------------------------------------------------------------- */

/**
 * Expands a fitment's `gens` to every generation it covers, following
 * `parentGeneration` downwards.
 *
 * `src/schemas/vehicles.ts`: `gen2-5` "is a generation id whose entry declares
 * `parentGeneration: "gen2"`; the containment is content, stated once, and the
 * resolver (T203) is what expands `gens: ["gen2"]` to its children."
 * Containment is one-directional: a fact scoped to the facelift is not a fact
 * about the whole of Gen 2.
 */
export function expandGenerations(
  gens: readonly string[],
  taxonomy: Taxonomy
): readonly string[] {
  void gens;
  void taxonomy;
  throw seam("expandGenerations");
}

/**
 * Every generation whose production span contains `year`, per the
 * `production` range on each generation entry.
 *
 * FIT-04 names the hard case this exists for: "a 1999 vehicle matching both
 * Gen 2.5 and Gen 3 where production overlapped".
 */
export function generationsInProduction(
  year: number,
  taxonomy: Taxonomy
): readonly string[] {
  void year;
  void taxonomy;
  throw seam("generationsInProduction");
}

/* -------------------------------------------------------------------------
 * VEH-03 — did this combination exist?
 * ---------------------------------------------------------------------- */

/**
 * Classifies one exact vehicle against the combination data.
 *
 * The four rules are `src/schemas/vehicles.ts`'s, restated because this is the
 * function that implements them:
 *
 * 1. A tuple absent from a `coverage: "complete"` entry is **impossible**.
 * 2. A tuple absent from a `coverage: "partial"` entry is **unknown**.
 * 3. A (generation, market) pair with **no combination entry at all** is
 *    **unknown**, never impossible.
 * 4. `offerings[].trims` is an assertion about every trim listed; omitting it
 *    means "not recorded at trim granularity" — **unknown**, not impossible,
 *    "and unaffected by `coverage`, which is a claim about the offering list
 *    and not about any offering's internals".
 *
 * The asymmetry is deliberate and is graded: "a wrong *impossible* silently
 * hides a real vehicle from a reader who owns it, while a wrong *unknown* only
 * fails to catch a typo."
 */
export function classifyCombination(
  selection: VehicleSelection,
  taxonomy: Taxonomy
): CombinationVerdict {
  void selection;
  void taxonomy;
  throw seam("classifyCombination");
}

/* -------------------------------------------------------------------------
 * FIT-04 — does entry E apply to vehicle V?
 * ---------------------------------------------------------------------- */

/**
 * Resolves a fitment query against one vehicle. Pure and deterministic: the
 * same `(fitment, vehicle, taxonomy)` always yields the same answer, and the
 * answer does not depend on the order entries were indexed in.
 *
 * An omitted facet is no restriction — `src/schemas/vehicles.ts`:
 * "`fitment.markets` is optional in the base fitment shape, where omitting it
 * correctly means 'no market restriction' — a torque figure applies in every
 * market."
 */
export function matchesVehicle(
  fitment: unknown,
  vehicle: VehicleSelection,
  taxonomy: Taxonomy
): boolean {
  void fitment;
  void vehicle;
  void taxonomy;
  throw seam("matchesVehicle");
}

/**
 * FIT-04 in the requirement's own words — "does entry E apply to vehicle V".
 * Reads `entry.fitment` and answers exactly as `matchesVehicle` does; FIT-03's
 * listing filter is this function over a collection.
 */
export function entryAppliesTo(
  entry: unknown,
  vehicle: VehicleSelection,
  taxonomy: Taxonomy
): boolean {
  void entry;
  void vehicle;
  void taxonomy;
  throw seam("entryAppliesTo");
}

/* -------------------------------------------------------------------------
 * FIT-02 — build-time validation
 * ---------------------------------------------------------------------- */

/**
 * Every reason the given entries' fitments do not resolve against the
 * taxonomy; empty when they all do.
 *
 * Returned rather than thrown so one build reports every bad fitment instead
 * of the first — the same choice `validateSlugRegistry` makes.
 */
export function validateEntryFitments(
  entries: readonly unknown[],
  taxonomy: Taxonomy
): readonly FitmentIssue[] {
  void entries;
  void taxonomy;
  throw seam("validateEntryFitments");
}

/**
 * The build path FIT-02 requires: throws when any entry's fitment fails to
 * resolve, with a message naming the entry and the offending field.
 *
 * T203 owns wiring this into the build (`npm run build` / `npm run verify`) so
 * a bad fitment is a red build and not a warning nobody reads.
 */
export function assertFitmentsResolve(
  entries: readonly unknown[],
  taxonomy: Taxonomy
): void {
  void entries;
  void taxonomy;
  throw seam("assertFitmentsResolve");
}
