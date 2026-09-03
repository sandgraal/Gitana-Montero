/**
 * The one place a share grant is issued or revoked in a grader.
 *
 * ## Why this file exists (T2-401 review, F3)
 *
 * The first draft of these graders called `revoke_share_grant` with three
 * different argument shapes across two files, and the Tier A reference probe
 * modelled a fourth. **PostgREST resolves RPC overloads by argument name**, so
 * a call whose names match no function resolves to nothing and returns
 * something a grader reading `response.ok` cannot tell from a refusal. The
 * central SHR-08 proof — "unknown, expired and revoked are byte-for-byte
 * identical" — was revoking nothing, so once T2-404 activated the marker it
 * would have compared a *live grant's successful response* against two
 * refusals and failed for a fixture reason, on the one grader whose entire job
 * is proving the requirement.
 *
 * That is the failure shape that gets an assertion loosened rather than fixed.
 * So there is exactly one implementation of "issue a grant" and one of "revoke
 * a grant", both built from `contract.ts`'s pinned argument lists, and every
 * call site goes through them.
 *
 * ## Failures are loud and named
 *
 * Both helpers throw the T2-404 seam error, with the status and body, rather
 * than returning a value a caller might read as a refusal. A marked grader
 * therefore fails with "create_share_grant answered 404" instead of "expected
 * undefined to be a string", which is the whole point of the seam convention.
 *
 * refs specs/002-montero-garage (SHR-05, SHR-06, SHR-08)
 */
import {
  SHARE_CREATE_ARGUMENTS,
  SHARE_CREATE_FUNCTION,
  SHARE_CREATE_RESULT_FIELDS,
  SHARE_GRANT_KINDS,
  SHARE_REVOKE_ARGUMENTS,
  SHARE_REVOKE_FUNCTION,
} from "./contract.ts";
import { rpc, type ApiResponse, type Scenario } from "./harness.ts";
import { shareSeam } from "./sql.ts";

/** One issued grant: the id its issuer manages it by, and the bearer token. */
export interface IssuedGrant {
  readonly shareId: string;
  readonly token: string;
  readonly response: ApiResponse;
}

/** How a grant differs from the default (private, 24 hours, `mechanic`). */
export interface GrantOptions {
  readonly includesCosts?: boolean;
  readonly includesReceipts?: boolean;
  readonly expiresInHours?: number;
  readonly kind?: (typeof SHARE_GRANT_KINDS)[number];
}

/**
 * Issue a grant on `vehicleId` as `owner`.
 *
 * The payload keys come from `SHARE_CREATE_ARGUMENTS` rather than being spelled
 * inline, so a rename is one line in `contract.ts` and not a hunt through two
 * test files — and so the Tier A grader that pins the signature is checking the
 * same list this sends.
 */
export async function issueGrant(
  scenario: Scenario,
  owner: Scenario["ownerA"],
  vehicleId: string,
  options: GrantOptions = {}
): Promise<IssuedGrant> {
  const [vehicle, kind, costs, receipts, expiry] = SHARE_CREATE_ARGUMENTS;
  const response = await rpc(scenario, owner, SHARE_CREATE_FUNCTION, {
    [vehicle]: vehicleId,
    [kind]: options.kind ?? SHARE_GRANT_KINDS[0],
    [costs]: options.includesCosts ?? false,
    [receipts]: options.includesReceipts ?? false,
    [expiry]: options.expiresInHours ?? 24,
  });
  if (!response.ok) {
    throw shareSeam(
      `${SHARE_CREATE_FUNCTION} answered ${response.status}: ${response.text}`
    );
  }

  const [idField, tokenField] = SHARE_CREATE_RESULT_FIELDS;
  const row = Array.isArray(response.body)
    ? (response.body[0] as Record<string, unknown> | undefined)
    : (response.body as Record<string, unknown> | null);
  const shareId = row?.[idField];
  const token = row?.[tokenField];

  if (typeof shareId !== "string" || typeof token !== "string" || !token) {
    throw shareSeam(
      `${SHARE_CREATE_FUNCTION} did not return {${idField}, ${tokenField}}: ` +
        `${response.text}`
    );
  }
  return { shareId, token, response };
}

/**
 * Revoke one grant, by id, as `actor`.
 *
 * Returns the response rather than throwing, because half the callers are
 * asserting that a *stranger's* revoke is refused — a helper that threw on a
 * non-2xx could not express that.
 */
export function revokeGrant(
  scenario: Scenario,
  actor: Scenario["ownerA"],
  shareId: string
): Promise<ApiResponse> {
  const [id] = SHARE_REVOKE_ARGUMENTS;
  return rpc(scenario, actor, SHARE_REVOKE_FUNCTION, { [id]: shareId });
}

/**
 * Everything a caller can observe about a refusal.
 *
 * SHR-08 requires unknown, expired and revoked to be indistinguishable — "same
 * status, same body, same shape". This is that triple, and the graders compare
 * these objects to each other rather than each to a constant, because the
 * requirement is *equality between the three*: an implementation that changed
 * all three together is still correct.
 *
 * `rows` is `-1` for a non-array body on purpose. `0` would be a legitimate
 * empty result set, and collapsing "not a list" into "an empty list" is the
 * failure-is-not-a-zero mistake this repo has now made three times.
 */
export function refusalShape(response: ApiResponse): {
  readonly status: number;
  readonly body: string;
  readonly rows: number;
} {
  return {
    status: response.status,
    body: response.text,
    rows: Array.isArray(response.body) ? response.body.length : -1,
  };
}
