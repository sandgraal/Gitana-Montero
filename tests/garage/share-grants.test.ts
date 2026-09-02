/**
 * Graders — **typed share grants, SHR-05..09.** Declared by T2-401 [TEST],
 * activated by T2-404 [PLATFORM].
 *
 * `share-instrument.test.ts` (T2-401a) grades the *shape* of the anon function
 * surface: definer, `search_path`, hash-not-plaintext, expiry, revocation,
 * column projection, read-only. This file grades what a grant **means**:
 *
 * | requirement | the claim | where |
 * |---|---|---|
 * | SHR-05 | the preset is a label, never a branch | Tier A, `presetBranchIssues` |
 * | SHR-06 | costs and receipts open independently | Tier A + the four-cell matrix |
 * | SHR-06 | cost fields are **omitted**, not blanked | Tier B, key absence |
 * | SHR-07 | the accountless path is read-only | Tier A + Tier B |
 * | SHR-08 | unknown / expired / revoked are indistinguishable | Tier B, three-way |
 * | SHR-08 | revocation is immediate and ungated | Tier A + Tier B |
 * | SHR-09 | a grant never makes a record community-eligible | Tier A sweep + `public-pages.test.ts` |
 *
 * ## Why SHR-08's refusal is graded twice, differently
 *
 * "Same status, same body, same shape" is a statement about responses on a
 * wire. No amount of reading SQL proves it, and T2-401a's hand-off said so when
 * it handed the job here: pair a Tier A **smell check** — more than one refusal
 * message, or refusal text naming which case it hit — with the real
 * behavioural proof, *never* substitute one for the other. Both are below, and
 * the Tier A one describes itself as a smell check in its own name.
 *
 * ## Expected-failure convention
 *
 * `it.fails` is the marker. T2-404 activates a grader by deleting exactly that
 * `.fails` and nothing else. Everything marked here resolves its subject
 * through `requireGrantRoutine`, so it fails with `not implemented: T2-404`
 * rather than with `undefined is not an object` — a marker that cannot say what
 * it is waiting for is a marker that means nothing.
 *
 * refs specs/002-montero-garage (SHR-05, SHR-06, SHR-07, SHR-08, SHR-09,
 * GAR-04′), 003 (MON-02, MEC-01)
 */
import { describe, expect, it } from "vitest";
import {
  CONTRACT_SCHEMA,
  SHARE_CAPABILITY_COLUMNS,
  SHARE_CREATE_FUNCTION,
  SHARE_GRANT_KINDS,
  SHARE_READER_NAMES,
  SHARE_REVOKE_FUNCTION,
  testReceiptPath,
  testShareToken,
} from "./contract.ts";
import {
  createOwnedFixture,
  detectLiveStack,
  liveTitle,
  provisionScenario,
  rpc,
  stackOf,
  teardownScenario,
  type ApiResponse,
  type Scenario,
} from "./harness.ts";
import {
  anonExecutableFunctions,
  capabilityGateIssues,
  defaultPrivilegeGrantIssues,
  isAnonExecutable,
  presetBranchIssues,
  refusalShapeIssues,
  revocationGatingIssues,
} from "./rules.ts";
import {
  functions,
  grants,
  migrationSql,
  shareSeam,
  type FunctionDefinition,
} from "./sql.ts";

const live = await detectLiveStack();

/**
 * Every routine in the contract's schema bearing `name`, or the seam error.
 *
 * By schema **and** name (`CONTRACT_SCHEMA`), for the reason PR #74's review
 * gave: a `private.share_read_records` is a different function with a different
 * ACL, and a comparison on the bare name cannot tell them apart.
 */
function requireGrantRoutine(
  name: string,
  normalized: string = migrationSql()
): FunctionDefinition[] {
  const found = functions(normalized).filter(
    (routine) => routine.schema === CONTRACT_SCHEMA && routine.name === name
  );
  if (found.length === 0) {
    throw shareSeam(
      `no function named ${CONTRACT_SCHEMA}.${name} exists in supabase/migrations/`
    );
  }
  return found;
}

/** Every anon-reachable routine, or the seam error if there are none. */
function requireAnonSurface(
  normalized: string = migrationSql()
): FunctionDefinition[] {
  const found = anonExecutableFunctions(normalized);
  if (found.length === 0) {
    throw shareSeam("no routine is executable by an anonymous caller");
  }
  return found;
}

/* =========================================================================
 * Tier A — unmarked. Assertions about the migrations as they stand.
 * ====================================================================== */

describe("no line hands FUTURE objects to an anonymous caller", () => {
  it("never grants default privileges to anon or public", () => {
    // T2-401a's recorded hand-off, F5. `grants()` has always replayed the
    // `alter default privileges` records and the graders only ever read the
    // *revoke* half. The grant half is the one privilege change that leaves no
    // trace on any object that exists today — so the created-table sweep and
    // the function sweep are both structurally blind to it, and it would take
    // effect on `shares` the moment T2-404 created it.
    //
    // `live-acl.test.ts`'s birth probe asks the same question of the running
    // database. This half runs on every PR with no Docker.
    expect(defaultPrivilegeGrantIssues(migrationSql())).toEqual([]);
  });

  it("the ADP replay sees something, so the sweep is not vacuous", () => {
    // T2-202 writes seven `alter default privileges … revoke` statements. If
    // the parser stopped finding them, the grader above would report clean
    // against a file it had failed to read — the exact vacuity this directory
    // exists to refuse.
    const records = grants(migrationSql()).defaultPrivileges;

    expect(records.length).toBeGreaterThanOrEqual(7);
    expect(records.every((record) => record.action === "revoke")).toBe(true);
  });
});

describe("SHR-09: nothing in the schema lets a grant surface a record", () => {
  it("no anon-reachable routine reads a vehicle's public work-log flag", () => {
    // > **SHR-09** A grant SHALL NOT make a record eligible for the community
    // > evidence surfacing of GAR-04′.
    //
    // The two paths must not meet in SQL: the grant readers key on a token, and
    // GAR-04′ keys on `is_worklog_public`. A routine that reads both is a
    // routine that can conflate them, and the conflation puts a private
    // work-log on a public problem page — which "will look like a feature
    // working correctly right up until someone notices" (T2-403's scope guard).
    //
    // Vacuous today (nothing is anon-reachable) and pinned as such by the
    // marked completeness half in `share-instrument.test.ts`. It starts paying
    // the day T2-404 lands, which is the point of landing it first.
    const offenders = anonExecutableFunctions(migrationSql())
      .filter((routine) =>
        /\bis_worklog_public\b|\bis_showcase_public\b/.test(routine.body)
      )
      .map((routine) => routine.identity);

    expect(offenders).toEqual([]);
  });
});

/* =========================================================================
 * Tier A — marked. The grant surface T2-404 ships.
 * ====================================================================== */

describe("the grant lifecycle RPCs (SHR-05, SHR-08)", () => {
  it.fails(`ships ${CONTRACT_SCHEMA}.${SHARE_CREATE_FUNCTION}`, () => {
    expect(requireGrantRoutine(SHARE_CREATE_FUNCTION)).toHaveLength(1);
  });

  it.fails(`ships ${CONTRACT_SCHEMA}.${SHARE_REVOKE_FUNCTION}`, () => {
    expect(requireGrantRoutine(SHARE_REVOKE_FUNCTION)).toHaveLength(1);
  });

  it.fails("neither lifecycle RPC is reachable without a session", () => {
    // SHR-07 makes the accountless path read-only. Issuing and revoking are
    // writes, and they are the owner's writes: an anonymous caller able to mint
    // a grant is an anonymous caller able to grant themselves one.
    const state = grants(migrationSql());
    const reachable = [SHARE_CREATE_FUNCTION, SHARE_REVOKE_FUNCTION]
      .flatMap((name) => requireGrantRoutine(name))
      .filter((routine) => isAnonExecutable(state, routine))
      .map((routine) => routine.identity);

    expect(reachable).toEqual([]);
  });

  it.fails("revocation consults nothing but the caller's ownership", () => {
    // > SHALL never be gated by payment, by plan, or by any other condition
    // > — SHR-08, restated as 003 MON-02
    //
    // A deny-list rather than an allow-list, because "any other condition" is
    // the load-bearing phrase: once 003's subscriptions table exists, joining
    // it here is one line and reads like prudence.
    expect(
      requireGrantRoutine(SHARE_REVOKE_FUNCTION).flatMap(revocationGatingIssues)
    ).toEqual([]);
  });

  it.fails(
    "the create RPC returns the token ONCE and stores only its hash",
    () => {
      // The token is 256 bits the owner has to be able to copy. It exists in
      // plaintext for exactly one response and never again — so the create RPC is
      // the only routine in the schema allowed to emit it, and the row it writes
      // must carry the digest.
      const [create] = requireGrantRoutine(SHARE_CREATE_FUNCTION);

      expect(create.body).toMatch(/gen_random_bytes\s*\(\s*32\s*\)/);
      expect(create.body).toMatch(/digest\s*\(/);
      expect(create.body).not.toMatch(/insert[\s\S]*\btoken\b\s*[,)]/);
    }
  );
});

describe("SHR-05: the preset is a label, never a branch", () => {
  it.fails("no anon-reachable routine branches on the grant's `kind`", () => {
    // "the preset SHALL be a label over explicit capability fields, never a
    // branch in consuming code". A reader that says `if kind = 'mechanic'` has
    // made the label load-bearing and the capability columns decorative — and a
    // grant whose columns and label disagree then resolves to whatever the
    // branch decided.
    expect(requireAnonSurface().flatMap(presetBranchIssues)).toEqual([]);
  });

  it.fails("the create RPC constrains `kind` to the two named presets", () => {
    // The closed set, in the style of `records.kind`. A free-text preset makes
    // the label unusable for the one thing it is for — telling the owner, and
    // the holder, what this grant was meant to be.
    const sql = migrationSql();

    expect(requireGrantRoutine(SHARE_CREATE_FUNCTION)).toHaveLength(1);
    for (const preset of SHARE_GRANT_KINDS) {
      expect(sql).toContain(`'${preset}'`);
    }
    expect(sql).toMatch(
      /check \([^)]*kind[^)]*\)|create (?:type|domain) (?:[a-z_]+\.)?[a-z_]*(?:share_)?kind\b/
    );
  });
});

describe("SHR-06: costs and receipts are two decisions", () => {
  it.fails("every anon-reachable routine gates the data it returns", () => {
    // A routine returning cost columns must test `includes_costs`; one
    // returning receipt data must test `includes_receipts`; and neither may
    // stand behind the other.
    //
    // The rule is narrow on purpose. The half it cannot reach — a fully-named
    // `jsonb_build_object` that includes the cost columns is textually
    // identical to legitimate projection — is why T2-404's reviewer is told to
    // verify capability scoping **by reading**, and why the four-cell matrix
    // below exists in Tier B.
    expect(requireAnonSurface().flatMap(capabilityGateIssues)).toEqual([]);
  });

  it.fails(
    "the two capability columns are separately named in the schema",
    () => {
      const sql = migrationSql();

      for (const column of SHARE_CAPABILITY_COLUMNS) {
        expect(sql, `${column} is not declared`).toContain(column);
      }
    }
  );
});

describe("SHR-08: the refusal is not an existence oracle (SMELL CHECK)", () => {
  it.fails("no anon-reachable routine raises more than one refusal", () => {
    // **This does not prove SHR-08.** Indistinguishability is a property of
    // responses on a wire; the proof is the three-way Tier B comparison below.
    // What this catches, on every PR with no Docker, is the likeliest way to
    // get it wrong: a helpful error message that names which of unknown,
    // expired, and revoked the caller hit.
    expect(requireAnonSurface().flatMap(refusalShapeIssues)).toEqual([]);
  });
});

/* =========================================================================
 * Tier B — behavioural. The half that can actually prove SHR-08.
 * ====================================================================== */

/** One grant, as the create RPC returns it. */
interface IssuedGrant {
  readonly token: string;
  readonly response: ApiResponse;
}

/**
 * Issue a grant on `vehicleId` as its owner.
 *
 * Fails loudly when the RPC is missing, so a marked grader below reports "the
 * RPC does not exist" rather than "expected undefined to be a string".
 */
async function issueGrant(
  scenario: Scenario,
  vehicleId: string,
  options: {
    readonly includesCosts?: boolean;
    readonly includesReceipts?: boolean;
    readonly expiresInHours?: number;
  } = {}
): Promise<IssuedGrant> {
  const response = await rpc(scenario, scenario.ownerA, SHARE_CREATE_FUNCTION, {
    p_vehicle_id: vehicleId,
    p_kind: SHARE_GRANT_KINDS[0],
    p_includes_costs: options.includesCosts ?? false,
    p_includes_receipts: options.includesReceipts ?? false,
    p_expires_in_hours: options.expiresInHours ?? 24,
  });
  if (!response.ok) {
    throw shareSeam(
      `${SHARE_CREATE_FUNCTION} answered ${response.status}: ${response.text}`
    );
  }
  const token =
    typeof response.body === "string"
      ? response.body
      : (response.body as { token?: string } | null)?.token;
  if (typeof token !== "string" || token.length === 0) {
    throw shareSeam(
      `${SHARE_CREATE_FUNCTION} returned no token: ${response.text}`
    );
  }
  return { token, response };
}

/** Read a vehicle's history as an accountless holder of `token`. */
function readAsHolder(
  scenario: Scenario,
  token: string,
  reader: string = SHARE_READER_NAMES[1]
): Promise<ApiResponse> {
  return rpc(scenario, scenario.anon, reader, { p_token: token });
}

/** The comparable shape of a refusal — everything a caller can observe. */
function refusalShape(response: ApiResponse): {
  status: number;
  body: string;
  rows: number;
} {
  return {
    status: response.status,
    body: response.text,
    rows: Array.isArray(response.body) ? response.body.length : -1,
  };
}

describe.skipIf(!live.available)(
  liveTitle("SHR-08: unknown, expired, and revoked are one answer", live),
  () => {
    it.fails("all three refusals are byte-for-byte identical", async () => {
      // The requirement, run. "Same status, same body, same shape — so that the
      // surface is not an existence oracle."
      //
      // Compared as a triple in one grader rather than three graders comparing
      // against a constant, because the property is *equality between the
      // three*, not conformance of each to some expected refusal. A
      // implementation that changed all three together would still be correct.
      const scenario = await provisionScenario(stackOf(live));
      try {
        const { vehicleId } = await ownedVehicle(scenario);

        const revoked = await issueGrant(scenario, vehicleId);
        await rpc(scenario, scenario.ownerA, SHARE_REVOKE_FUNCTION, {
          p_token_hash: null,
          p_share_id: null,
        });
        const expired = await issueGrant(scenario, vehicleId, {
          expiresInHours: -1,
        });

        const shapes = [
          refusalShape(
            await readAsHolder(scenario, testShareToken("x", scenario.runId))
          ),
          refusalShape(await readAsHolder(scenario, expired.token)),
          refusalShape(await readAsHolder(scenario, revoked.token)),
        ];

        expect(shapes[1]).toEqual(shapes[0]);
        expect(shapes[2]).toEqual(shapes[0]);
      } finally {
        await teardownScenario(scenario);
      }
    });

    it.fails("POSITIVE CONTROL: a live grant answers DIFFERENTLY", async () => {
      // Without this, "the three refusals match" is satisfied by a surface that
      // refuses everything — including the grant that was just issued — which
      // would be a broken feature reported as a secure one.
      const scenario = await provisionScenario(stackOf(live));
      try {
        const { vehicleId } = await ownedVehicle(scenario);
        const live_ = await issueGrant(scenario, vehicleId);

        const allowed = await readAsHolder(scenario, live_.token);
        const refused = await readAsHolder(
          scenario,
          testShareToken("x", scenario.runId)
        );

        expect(allowed.ok).toBe(true);
        expect(refusalShape(allowed)).not.toEqual(refusalShape(refused));
      } finally {
        await teardownScenario(scenario);
      }
    });

    it.fails("revocation takes effect on the NEXT request", async () => {
      // "SHALL take effect on the next request". The likeliest defect in the
      // whole feature is a reader that validates the hash and the expiry and
      // never reads `revoked_at` — and it passes every hand-test, because a
      // grant you have not revoked behaves identically either way.
      const scenario = await provisionScenario(stackOf(live));
      try {
        const { vehicleId } = await ownedVehicle(scenario);
        const grant = await issueGrant(scenario, vehicleId);

        const before = await readAsHolder(scenario, grant.token);
        expect(before.ok).toBe(true);

        await rpc(scenario, scenario.ownerA, SHARE_REVOKE_FUNCTION, {
          p_vehicle_id: vehicleId,
        });

        const after = await readAsHolder(scenario, grant.token);
        expect(after.ok).toBe(false);
      } finally {
        await teardownScenario(scenario);
      }
    });
  }
);

describe.skipIf(!live.available)(
  liveTitle("SHR-06: the four-cell capability matrix", live),
  () => {
    it.fails.each<[boolean, boolean]>([
      [false, false],
      [true, false],
      [false, true],
      [true, true],
    ])(
      "costs=%s receipts=%s — each field appears only when its own bit is set",
      async (includesCosts, includesReceipts) => {
        // The cell that matters most is `costs=false receipts=true`: it is the
        // one a single "full access" boolean cannot express, and the one a
        // reader that gates receipts behind costs gets wrong.
        //
        // **Omission, not blanking.** SHR-06 says the cost fields are omitted
        // *entirely* where the grant does not open them, so the assertion is
        // about key presence and not about the value being null. `null` is a
        // value that means "this job was free"; the absent key is the only
        // honest way to say "you were not shown this".
        const scenario = await provisionScenario(stackOf(live));
        try {
          const { vehicleId } = await ownedVehicle(scenario);
          const grant = await issueGrant(scenario, vehicleId, {
            includesCosts,
            includesReceipts,
          });

          const history = await readAsHolder(scenario, grant.token);
          const rows = Array.isArray(history.body) ? history.body : [];
          const row = (rows[0] ?? {}) as Record<string, unknown>;

          expect(history.ok).toBe(true);
          expect(Object.hasOwn(row, "cost_amount")).toBe(includesCosts);

          const receipts = await readAsHolder(
            scenario,
            grant.token,
            SHARE_READER_NAMES[2]
          );
          expect(receipts.ok).toBe(includesReceipts);
        } finally {
          await teardownScenario(scenario);
        }
      }
    );

    it.fails(
      "a grant reaches ONE vehicle, not the owner's garage",
      async () => {
        // A grant is issued per vehicle (SHR-05). An owner with two trucks who
        // hands a mechanic a link to one has not handed over the other, and the
        // failure mode — a reader that resolves the token to an *owner* and then
        // reads that owner's records — returns exactly the right data for the
        // single-vehicle case that everybody tests by hand.
        const scenario = await provisionScenario(stackOf(live));
        try {
          const first = await ownedVehicle(scenario, "1");
          const second = await ownedVehicle(scenario, "2");
          const grant = await issueGrant(scenario, first.vehicleId);

          const history = await readAsHolder(scenario, grant.token);
          const rows = Array.isArray(history.body) ? history.body : [];

          expect(history.ok).toBe(true);
          expect(history.text).not.toContain(second.vehicleId);
          for (const row of rows as Record<string, unknown>[]) {
            expect(row.vehicle_id).toBe(first.vehicleId);
          }
        } finally {
          await teardownScenario(scenario);
        }
      }
    );
  }
);

describe.skipIf(!live.available)(
  liveTitle("SHR-07: the accountless path is read-only", live),
  () => {
    it.fails(
      "a holder with no session cannot write through any reader",
      async () => {
        // "WHILE a request carries no authenticated session, no grant SHALL admit
        // any write." Graded over the tables rather than the functions, because
        // the requirement is about the *path*: whatever a token buys, it does not
        // buy a row.
        const scenario = await provisionScenario(stackOf(live));
        try {
          const { vehicleId } = await ownedVehicle(scenario);
          const grant = await issueGrant(scenario, vehicleId, {
            includesCosts: true,
            includesReceipts: true,
          });

          const written = await rpc(scenario, scenario.anon, "records", {
            p_token: grant.token,
          });

          expect(written.ok).toBe(false);
        } finally {
          await teardownScenario(scenario);
        }
      }
    );

    it.fails("a holder cannot issue a grant of their own", async () => {
      // The escalation. A grant that can mint a grant is a grant with no
      // expiry, whatever its `expires_at` says.
      const scenario = await provisionScenario(stackOf(live));
      try {
        const { vehicleId } = await ownedVehicle(scenario);
        const grant = await issueGrant(scenario, vehicleId);

        const minted = await rpc(
          scenario,
          scenario.anon,
          SHARE_CREATE_FUNCTION,
          { p_vehicle_id: vehicleId, p_token: grant.token }
        );

        expect(minted.ok).toBe(false);
      } finally {
        await teardownScenario(scenario);
      }
    });

    it.fails("owner B cannot revoke owner A's grant", async () => {
      // Revocation is ungated (SHR-08) but it is not unowned. The two are easy
      // to conflate while implementing the first one.
      const scenario = await provisionScenario(stackOf(live));
      try {
        const { vehicleId } = await ownedVehicle(scenario);
        const grant = await issueGrant(scenario, vehicleId);

        const stolen = await rpc(
          scenario,
          scenario.ownerB,
          SHARE_REVOKE_FUNCTION,
          { p_vehicle_id: vehicleId }
        );
        const stillWorks = await readAsHolder(scenario, grant.token);

        expect(stolen.ok).toBe(false);
        expect(stillWorks.ok).toBe(true);
      } finally {
        await teardownScenario(scenario);
      }
    });
  }
);

/**
 * One vehicle owned by `ownerA`, created through the API as that owner.
 *
 * Local to this file rather than added to `harness.ts`: `createOwnedFixture`
 * builds the whole vehicle → record → receipt chain and returns one vehicle id,
 * which is exactly what these graders need, and a second helper that did the
 * same thing differently would be a second thing to keep in step.
 */
async function ownedVehicle(
  scenario: Scenario,
  slot = "1"
): Promise<{ readonly vehicleId: string }> {
  const owned = await createOwnedFixture(
    scenario,
    scenario.ownerA,
    testReceiptPath(scenario.ownerA.userId ?? "", slot)
  );
  return { vehicleId: owned.vehicleId };
}
