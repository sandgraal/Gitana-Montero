/**
 * What one **principal** may see of one vehicle's records — the seam, declared
 * by T2-401 [TEST] and filled by T2-402 [PLATFORM] / T2-403 / T2-404.
 *
 * ## Why this module exists before any page does
 *
 * > **T2-402, amended 2026-08-31:** the per-record cost-masking logic must be
 * > **parameterised by principal**, not written once for "the public". T2-404
 * > needs the same masking for a different audience, and a second copy of a
 * > privacy rule is a second place for it to drift.
 *
 * There are three audiences for a record and they are *not* three code paths:
 *
 * | principal | sees | governed by |
 * |---|---|---|
 * | the owner | everything | RLS on `auth.uid()` |
 * | the world | records with `is_public`, costs only with `is_cost_public` | SHR-02, SHR-03 |
 * | a grant holder | records on the granted vehicle, costs only with `includes_costs`, receipts only with `includes_receipts` | SHR-05, SHR-06 |
 *
 * Writing that as three functions is how the world's rule and the grant
 * holder's rule end up disagreeing about one edge — and the edge that goes
 * wrong is somebody's invoice.
 *
 * ## Omission, not blanking — the shape of the return type is the requirement
 *
 * > **SHR-06** … WHERE a grant does not open costs, THE data returned SHALL
 * > **omit the cost fields entirely** rather than blanking them at render time.
 *
 * So {@link VisibleRecord} makes the cost keys *optional* rather than
 * `number | null`. `cost_amount: null` is a value that says "this job was
 * free"; the absence of the key is the only honest way to say "you were not
 * shown this". A render layer handed `null` cannot tell those apart, and one of
 * them is a lie about somebody's money.
 *
 * This module is **pure**: no Supabase client, no DOM, no `import.meta.env`.
 * The database is still the enforcement boundary (SHR-01 names all three modes
 * and this is none of them) — the point of masking here as well is that a page
 * which somehow receives a wider row still cannot render the extra columns.
 *
 * ## Not implemented
 *
 * Every function throws {@link NOT_IMPLEMENTED}. The graders in
 * `tests/garage/public-pages.test.ts` are marked `it.fails` and fail *with
 * that message*, which is what makes the marker mean "waiting for T2-402"
 * rather than "an assertion happened to be false".
 *
 * refs specs/002-montero-garage (SHR-02, SHR-03, SHR-06, SHR-09, GAR-04′)
 */
import type { RecordRow } from "./record.ts";
import type { ReceiptRow } from "./receipt.ts";
import type { VehicleRow } from "./vehicle.ts";

/** The seam marker. Every grader waiting on T2-402 asserts on this string. */
export const NOT_IMPLEMENTED = "not implemented: T2-401";

/**
 * Who is asking.
 *
 * A closed union on purpose: adding a fourth audience has to be a type error
 * somewhere, not a fourth `if` that a reviewer has to notice.
 */
export type Principal =
  /** The signed-in owner of the vehicle. Sees everything. */
  | { readonly kind: "owner"; readonly userId: string }
  /** An anonymous visitor to a published page. SHR-02, SHR-03. */
  | { readonly kind: "world" }
  /**
   * The holder of a typed share grant (SHR-05..08).
   *
   * `includesCosts` and `includesReceipts` are two independent decisions
   * (SHR-06) and are carried as two fields for exactly that reason — a single
   * `capabilities: "full" | "history"` enum would make them one.
   */
  | {
      readonly kind: "grant";
      readonly vehicleId: string;
      readonly includesCosts: boolean;
      readonly includesReceipts: boolean;
    };

/**
 * A record as one principal may see it.
 *
 * The cost keys are **optional, not nullable**: see the module note. Nothing
 * else about a record changes between audiences — a masked record is a record
 * with fewer keys, never a record with different values.
 */
export type VisibleRecord = Omit<
  RecordRow,
  "cost_amount" | "cost_currency" | "is_public" | "is_cost_public"
> & {
  readonly cost_amount?: number | null;
  readonly cost_currency?: string | null;
};

/** Everything a masking decision needs, in one argument. */
export interface MaskInput {
  readonly record: RecordRow;
  readonly vehicle: VehicleRow;
  readonly principal: Principal;
}

/**
 * The record as `principal` may see it, or `null` when they may not see it at
 * all.
 *
 * `null` rather than an empty record: "there is a record here you cannot read"
 * and "there is no record here" are different facts, and a page that cannot
 * tell them apart will render a heading over nothing.
 */
export function maskRecordForPrincipal(input: MaskInput): VisibleRecord | null {
  throw new Error(
    `${NOT_IMPLEMENTED} — maskRecordForPrincipal(${input.principal.kind})`
  );
}

/** {@link maskRecordForPrincipal} over a timeline, dropping what is hidden. */
export function maskRecordsForPrincipal(input: {
  readonly records: readonly RecordRow[];
  readonly vehicle: VehicleRow;
  readonly principal: Principal;
}): readonly VisibleRecord[] {
  throw new Error(
    `${NOT_IMPLEMENTED} — maskRecordsForPrincipal(${input.principal.kind})`
  );
}

/**
 * The receipts on a record that `principal` may see.
 *
 * Separate from the record masking because SHR-06 makes receipts a decision of
 * their own: a grant may open receipts and not costs, or costs and not
 * receipts, and folding them into one call is how that stops being true.
 */
export function visibleReceipts(input: {
  readonly receipts: readonly ReceiptRow[];
  readonly record: RecordRow;
  readonly vehicle: VehicleRow;
  readonly principal: Principal;
}): readonly ReceiptRow[] {
  throw new Error(
    `${NOT_IMPLEMENTED} — visibleReceipts(${input.principal.kind})`
  );
}

/**
 * Whether a record may be surfaced as community first-hand evidence on a
 * problem page (GAR-04′).
 *
 * > **SHR-09** A grant SHALL NOT make a record eligible for the community
 * > evidence surfacing of GAR-04′. That path keys on a *public* work-log; a
 * > record visible to one grantee is not public, and treating it as such would
 * > put a private work-log on a public problem page.
 *
 * The requirement is why this lives here rather than in T2-403's own module:
 * eligibility is a *visibility* question, and asking it anywhere else is how it
 * gets answered with "can somebody see this" instead of "is this public".
 */
export function isEligibleForCommunityEvidence(input: {
  readonly record: RecordRow;
  readonly vehicle: VehicleRow;
  readonly principal: Principal;
}): boolean {
  throw new Error(
    `${NOT_IMPLEMENTED} — isEligibleForCommunityEvidence(${input.record.id})`
  );
}
