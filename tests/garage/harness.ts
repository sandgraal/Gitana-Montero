/**
 * Grader infrastructure — the *behavioural* tier of the T2-201 harness.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ARCHITECTURE: how a row-level-security guarantee gets proved in this repo
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * AGENTS.md, Boundaries:
 *
 * > User data never leaves Supabase; every user table ships with row-level
 * > security **proven by graders** before content flows.
 *
 * "Proven" rules out the easy version. A mocked Supabase client returning
 * whatever the test wants proves that the mock was written to agree with the
 * test. RLS is enforced by Postgres, against a role, against a JWT claim — so
 * the only thing that can prove it is Postgres, holding the real policies,
 * answering a real request from a real actor who is not the owner.
 *
 * Hence two tiers, and a hard rule about what each may claim:
 *
 * ┌── Tier A — declaration (`sql.ts`) ──────────────────────────────────────┐
 * │ Reads T2-202's DDL off disk. No Docker, no network, no database.        │
 * │ Runs everywhere `npm test` runs, including CI, forever.                 │
 * │ Proves: RLS enabled *and* forced; no policy granted to anon/public;     │
 * │ share flags `not null default false`; ownership FKs `on delete          │
 * │ cascade`; the receipts bucket created non-public.                       │
 * │ Cannot prove: that those declarations *behave*.                         │
 * └────────────────────────────────────────────────────────────────────────┘
 * ┌── Tier B — behavioural (this file) ─────────────────────────────────────┐
 * │ Talks to a local `supabase start` stack over its real HTTP surface:     │
 * │ PostgREST for rows, GoTrue for accounts, Storage for objects.           │
 * │ Three actors — anon, owner A, owner B — each holding a JWT the local    │
 * │ stack signs with its own well-known development secret.                 │
 * │ Proves: the deny-by-default matrix, the private-object matrix, the      │
 * │ ACC-03 cascade reaching storage, the SHR-01 default round-tripping.     │
 * │ Requires: Docker + the Supabase CLI. CI has both — the `tier-b` job in  │
 * │ `.github/workflows/ci.yml` installs the pinned CLI and runs             │
 * │ `supabase start`. Advisory, not merge-blocking, for now.                │
 * └────────────────────────────────────────────────────────────────────────┘
 *
 * ## Why Tier B is opt-in, and why that is not a loophole
 *
 * Tier B suites are `describe.skipIf(!live.available)`, and the skip carries
 * a named reason into the Vitest report. A silent skip would be a lie told
 * green, so two things keep it honest:
 *
 * 1. **Fail-closed under a flag.** Set `GARAGE_LIVE_REQUIRED=1` and a missing
 *    stack becomes a hard failure (`harness-contract.test.ts` grades this).
 *    This file used to predict that "the day CI grows a Postgres service, one
 *    environment variable turns every Tier B proof into a CI signal — no test
 *    file changes." That day was 2026-09-01, and the prediction held exactly:
 *    `ci.yml`'s `tier-b` job runs `npm run test:garage`, which already carries
 *    `GARAGE_LIVE=1 GARAGE_LIVE_REQUIRED=1` (package.json), and not one test
 *    file was edited to make it happen. On that runner the report reads
 *    `555 passed | 9 expected fail` with a skip count of **zero**. What is
 *    still outstanding is only branch protection: the job is advisory until
 *    the owner adds it to `main`'s required contexts
 *    (`specs/001-foundation/audits/T901-tier-b-ci-investigation.md`, Stage 2).
 * 2. **Tier A never skips.** The declaration half is on the merge path from
 *    the moment T2-202 lands.
 *
 * ## No dependencies, on purpose
 *
 * No `@supabase/supabase-js`, no `pg`. JWTs are ~20 lines of `node:crypto`
 * HMAC and everything else is `fetch`, which Node 24 has. Two reasons beyond
 * dependency hygiene: the REST surface *is* the contract a browser client
 * will hit, so testing it directly tests the thing that matters; and an SDK
 * between the grader and Postgres is one more place a policy failure could be
 * smoothed over into a friendly empty array.
 *
 * ## Credentials: local development only, structurally
 *
 * `assertLocalTarget` refuses any URL that is not loopback, and it runs
 * before every request this module makes. The JWT secret defaults to the
 * Supabase CLI's published development value — the same string in every
 * `supabase start` on earth. It is not a credential and it is worthless
 * anywhere but localhost. **No production credential, no service key, and no
 * hosted Supabase project is involved in these graders, and the local-only
 * guard is itself graded so it cannot quietly stop being true.**
 *
 * ## Running Tier B locally
 *
 *     supabase start                     # Docker; prints the local URLs
 *     GARAGE_LIVE=1 npm test             # or: GARAGE_LIVE=1 npx vitest run tests/garage
 *
 * Override `SUPABASE_URL` / `SUPABASE_JWT_SECRET` if your stack is not on the
 * CLI's default ports.
 *
 * A test-writer instance authored this file and must not be the instance that
 * builds T2-202 (AGENTS.md separation rule; T901 audits it).
 *
 * refs specs/002-montero-garage (ACC-01, ACC-03, SHR-01, GAR-05′, MIG-03)
 */
import { createHmac, randomUUID } from "node:crypto";
import {
  PURGE_FUNCTION,
  RECEIPTS_BUCKET,
  VEHICLE_PHOTOS_BUCKET,
  RECOVERY_WINDOW_DAYS,
  REQUEST_DELETION_FUNCTION,
  TEST_TAXONOMY_IDENTITY,
  testEmail,
  testVehicleName,
} from "./contract.ts";

/* -------------------------------------------------------------------------
 * Local-only guard
 * ---------------------------------------------------------------------- */

/**
 * Hosts a Supabase stack may live on for these graders to touch it.
 *
 * These are compared against `new URL(…).hostname`, which is why IPv6 appears
 * bracketed and only bracketed — `http://::1:54321` is not a URL, and a list
 * containing the bare form would be a row that can never match.
 */
export const ALLOWED_LIVE_HOSTS = ["localhost", "127.0.0.1", "[::1]"] as const;

/** Thrown when something points the harness at a non-loopback host. */
export const NON_LOCAL_TARGET = "refusing a non-local Supabase target";

/**
 * Throw unless `url` is a loopback address.
 *
 * The constitution's "never a production credential" is easy to honour by
 * intention and easy to break by accident — one `SUPABASE_URL` inherited from
 * a shell profile and a grader that creates and deletes accounts is pointed
 * at real users. This makes it structural: the harness cannot address a host
 * that is not this machine, and `harness-contract.test.ts` grades the guard
 * against a table of hostnames including real Supabase and the live site.
 */
export function assertLocalTarget(url: string): void {
  let hostname: string;
  try {
    hostname = new URL(url).hostname;
  } catch {
    throw new Error(`${NON_LOCAL_TARGET}: ${url} is not a URL`);
  }
  const allowed = (ALLOWED_LIVE_HOSTS as readonly string[]).includes(hostname);
  if (!allowed) {
    throw new Error(
      `${NON_LOCAL_TARGET}: ${hostname}. T2-201's graders create and delete ` +
        `accounts, vehicles, records, and files; they run against ` +
        `\`supabase start\` on loopback and nothing else (AGENTS.md: never a ` +
        `production credential)`
    );
  }
}

/* -------------------------------------------------------------------------
 * Live-stack detection
 * ---------------------------------------------------------------------- */

/** The Supabase CLI's default local API port. */
const DEFAULT_LOCAL_URL = "http://127.0.0.1:54321";

/**
 * The Supabase CLI's published development JWT secret — identical in every
 * local stack, documented in Supabase's own quickstart, useless off loopback.
 */
const DEFAULT_LOCAL_JWT_SECRET =
  "super-secret-jwt-token-with-at-least-32-characters-long";

/** A reachable local stack. */
export interface LiveStack {
  readonly url: string;
  readonly jwtSecret: string;
}

/** Why Tier B is not running, in words a reader can act on. */
export const SKIP_REASONS = {
  notEnabled:
    "GARAGE_LIVE is unset — Tier B needs a local Supabase stack " +
    "(`supabase start`, then `GARAGE_LIVE=1 npm test`)",
  unreachable:
    "GARAGE_LIVE is set but no Supabase stack answered on the local URL",
  nonLocal:
    "SUPABASE_URL points somewhere that is not loopback — refusing to run",
  wrongProject:
    "the stack on that port is NOT this project's — refusing to run",
} as const;

/**
 * The tables a stack must expose to be recognised as this project's.
 *
 * Not a version check and not a hash — a fingerprint. A PostgREST instance
 * exposing all four of these is this repo's stack for any purpose a grader
 * cares about, and one exposing none of them is somebody else's.
 */
const PROJECT_FINGERPRINT_TABLES = [
  "profiles",
  "vehicles",
  "records",
  "receipts",
] as const;

/**
 * Whether an exposed-table list identifies this project's stack, or a sentence
 * saying why not.
 *
 * ## Loopback is not the same question as "this project" (T2-401 review, F8)
 *
 * `assertLocalTarget` answers "is this my machine". It does not answer "is this
 * my project", and on a developer machine those come apart constantly: the
 * Supabase CLI gives every project the same default ports, so
 * `127.0.0.1:54321` is **whichever checkout started first**. Observed on this
 * machine while T2-401 was written — an unrelated project held 54321/54322 and
 * monterogarage came up on 56321/56322.
 *
 * That is not a cosmetic problem here. `provisionScenario` creates two accounts
 * and `teardownScenario` deletes them, the harness mints its own `service_role`
 * JWT from the CLI's **published default secret**, and a foreign local stack
 * shares that secret. So `GARAGE_LIVE=1 npm run test:garage` with default URLs
 * would have provisioned and deleted users in a stranger's database. The blast
 * radius is bounded — teardown only removes the two accounts it created — but
 * "bounded" is not the standard this directory holds itself to, and the
 * constitution's "never a production credential" is the same instinct one port
 * over.
 *
 * Pure and exported so it is graded without a stack: the failure it prevents
 * only happens on a machine running two projects, which is precisely the
 * failure an integration test on a clean runner will never reproduce.
 */
export function projectFingerprintIssue(
  exposed: readonly string[],
  expected: readonly string[] = PROJECT_FINGERPRINT_TABLES
): string | null {
  if (expected.length === 0) {
    return "no fingerprint tables declared — nothing identifies this project";
  }

  // ## The asymmetry, and why it runs this way round
  //
  // An empty enumeration is **"cannot tell"**, not "wrong project", and the
  // difference was measured rather than assumed. PostgREST's OpenAPI document
  // lists only what the *calling role* can reach, so:
  //
  // - probed as `anon`, a correctly locked-down project enumerates **nothing**
  //   — which is true of this repo's own schema, since T2-202 revokes every
  //   privilege from `anon`. An anon-based fingerprint would therefore have
  //   refused the real stack and switched the whole behavioural tier off in
  //   silence. Observed: 0 tables from a real, healthy stack.
  // - probed as `service_role`, a foreign stack sharing the CLI's default
  //   secret enumerates its own tables happily. Observed: 7, including
  //   `subscriptions` and `stripe_webhook_events` — a project that is
  //   emphatically not this one.
  //
  // So the guard refuses only on **positive** evidence of a different schema,
  // and stays out of the way when the answer is uninformative. Refusing on
  // silence would trade a rare, bounded, human-noticeable hazard for a
  // permanent and invisible loss of Tier B, and a tier that never runs is
  // indistinguishable from a tier that passes.
  if (exposed.length === 0) return null;

  const present = new Set(exposed);
  const missing = expected.filter((table) => !present.has(table));
  if (missing.length === 0) return null;

  const found = exposed
    .filter((name) => !name.startsWith("rpc/"))
    .slice(0, 5)
    .join(", ");
  return (
    `${SKIP_REASONS.wrongProject} (it does not expose ${missing.join(", ")}; ` +
    `it exposes ${found || "no tables"}). The Supabase CLI gives every project ` +
    `the same default ports, so the stack on this one belongs to another ` +
    `checkout — set SUPABASE_URL to the port \`supabase status\` reports here`
  );
}

/**
 * The table and RPC names a PostgREST instance exposes, from its OpenAPI
 * document, **as the service role**.
 *
 * The role matters and is the whole reason this works — see the note in
 * `projectFingerprintIssue`. The service-role token is the credential the
 * harness is about to use to create accounts anyway, so probing with it asks
 * exactly the question that matters: *what would I be writing into?*
 *
 * Returns `null` when the document cannot be read or parsed — **not** an empty
 * list. An empty list is a different answer ("this role sees no tables") and
 * the caller treats it differently (AGENTS.md: a failure is not a zero).
 */
async function exposedTables(
  url: string,
  token: string
): Promise<string[] | null> {
  try {
    const response = await fetch(`${url}/rest/v1/`, {
      signal: AbortSignal.timeout(3000),
      headers: { apikey: token, authorization: `Bearer ${token}` },
    });
    if (!response.ok) return null;
    const document = (await response.json()) as {
      paths?: Record<string, unknown>;
    };
    if (!document.paths) return null;
    return Object.keys(document.paths)
      .filter((path) => path.startsWith("/") && path.length > 1)
      .map((path) => path.slice(1));
  } catch {
    return null;
  }
}

export type LiveDecision =
  | { readonly available: true; readonly stack: LiveStack }
  | { readonly available: false; readonly reason: string };

/**
 * The role the fingerprint probe asks as.
 *
 * **`service_role`, and the choice is the guard.** See
 * `projectFingerprintIssue`: probed as `anon`, a correctly locked-down project
 * enumerates *nothing*, so an anon probe silently disables the whole
 * wrong-project check while every test stays green. That is not hypothetical —
 * it is a one-word mutation, and the second review demonstrated it surviving.
 *
 * It is also the honest question to ask: `service_role` is the credential the
 * harness is about to create and delete accounts with, so probing with it asks
 * *what would I be writing into?* rather than *what can a stranger read?*
 *
 * Named here, used once, and asserted by `harness-contract.test.ts` through an
 * injected observer that decodes the token it was handed.
 */
export const FINGERPRINT_PROBE_ROLE: JwtClaims["role"] = "service_role";

/** What one look at a candidate stack found. */
export interface StackObservation {
  /** `null` when the health endpoint answered; a sentence when it did not. */
  readonly unreachable: string | null;
  /**
   * The relations the probe role can see, or `null` when the instance did not
   * describe itself. `null` and `[]` are different answers — see
   * `projectFingerprintIssue`.
   */
  readonly exposed: readonly string[] | null;
}

/**
 * Turn an observation into a decision. **Pure.**
 *
 * ## Why this is split out (T2-401 second review)
 *
 * `projectFingerprintIssue` was well covered, and the code that *used* it was
 * not: mutating `if (wrongProject !== null)` to `if (false && …)` left the
 * whole suite green. The detection logic was graded; the refusal was not, and
 * the refusal is the part that stops the harness writing into a stranger's
 * database. A guard whose only untested line is the one that acts on the
 * finding is a guard that can be deleted in a code review nobody questions.
 *
 * So the decision is a pure function of what was observed, and
 * `harness-contract.test.ts` drives it directly with a foreign table list.
 */
export function liveDecisionFrom(
  observation: StackObservation,
  stack: LiveStack
): LiveDecision {
  if (observation.unreachable !== null) {
    return {
      available: false,
      reason: `${SKIP_REASONS.unreachable} (${stack.url}: ${observation.unreachable})`,
    };
  }
  const wrongProject =
    observation.exposed === null
      ? null
      : projectFingerprintIssue(observation.exposed);
  if (wrongProject !== null) {
    return { available: false, reason: `${wrongProject} — ${stack.url}` };
  }
  return { available: true, stack };
}

/** Look at a stack: is it answering, and what does the probe role see? */
async function observeStack(
  stack: LiveStack,
  probeToken: string
): Promise<StackObservation> {
  try {
    const response = await fetch(`${stack.url}/auth/v1/health`, {
      signal: AbortSignal.timeout(3000),
      headers: { apikey: mintJwt({ role: "anon" }, stack.jwtSecret) },
    });
    if (!response.ok) {
      return { unreachable: `→ ${response.status}`, exposed: null };
    }
  } catch (error) {
    return { unreachable: (error as Error).message, exposed: null };
  }
  return {
    unreachable: null,
    exposed: await exposedTables(stack.url, probeToken),
  };
}

/** How `detectLiveStack` looks at a stack. Injected so the wiring is gradeable. */
export type StackObserver = (
  stack: LiveStack,
  probeToken: string
) => Promise<StackObservation>;

/**
 * Decide whether Tier B can run, without ever touching the network unless
 * someone asked for it by setting `GARAGE_LIVE`.
 *
 * `observe` is a parameter so a grader can hand this a stack that answers
 * however the grader likes — and, critically, can decode the probe token it
 * receives and assert the role it was minted with.
 */
export async function detectLiveStack(
  env: NodeJS.ProcessEnv = process.env,
  observe: StackObserver = observeStack
): Promise<LiveDecision> {
  if (env.GARAGE_LIVE !== "1") {
    return { available: false, reason: SKIP_REASONS.notEnabled };
  }
  const url = env.SUPABASE_URL ?? DEFAULT_LOCAL_URL;
  try {
    assertLocalTarget(url);
  } catch (error) {
    return {
      available: false,
      reason: `${SKIP_REASONS.nonLocal}: ${(error as Error).message}`,
    };
  }
  const jwtSecret = env.SUPABASE_JWT_SECRET ?? DEFAULT_LOCAL_JWT_SECRET;
  const stack: LiveStack = { url, jwtSecret };

  // Loopback is not the same question as "this project" — see
  // `projectFingerprintIssue`. This runs before any grader provisions an
  // account, because provisioning is the irreversible half.
  return liveDecisionFrom(
    await observe(stack, mintJwt({ role: FINGERPRINT_PROBE_ROLE }, jwtSecret)),
    stack
  );
}

/**
 * The stack, for suites that only run when it is there.
 *
 * Never reached while a suite is skipped. Throws rather than narrowing with a
 * cast, so a mistake surfaces as a sentence instead of an `undefined is not
 * an object` three frames deep inside `fetch`.
 */
export function stackOf(decision: LiveDecision): LiveStack {
  if (!decision.available) {
    throw new Error(`live tier unavailable: ${decision.reason}`);
  }
  return decision.stack;
}

/** The describe-block title for a Tier B suite, skip reason included. */
export function liveTitle(title: string, decision: LiveDecision): string {
  return decision.available
    ? `${title} [live]`
    : `${title} [skipped: ${decision.reason}]`;
}

/* -------------------------------------------------------------------------
 * JWTs
 * ---------------------------------------------------------------------- */

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** Claims PostgREST and GoTrue read off a Supabase JWT. */
export interface JwtClaims {
  readonly role: "anon" | "authenticated" | "service_role";
  readonly sub?: string;
  readonly email?: string;
}

/** Mint an HS256 JWT the local stack will accept. */
export function mintJwt(claims: JwtClaims, secret: string): string {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64url(
    JSON.stringify({
      aud: "authenticated",
      iss: "supabase",
      iat: now,
      exp: now + 3600,
      ...claims,
    })
  );
  const signature = base64url(
    createHmac("sha256", secret).update(`${header}.${payload}`).digest()
  );
  return `${header}.${payload}.${signature}`;
}

/** Decode a JWT payload — used by the canary to grade `mintJwt`. */
export function decodeJwtPayload(token: string): Record<string, unknown> {
  const [, payload] = token.split(".");
  return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
}

/* -------------------------------------------------------------------------
 * HTTP
 * ---------------------------------------------------------------------- */

export interface ApiResponse {
  readonly status: number;
  readonly ok: boolean;
  readonly body: unknown;
  readonly text: string;
}

interface RequestOptions {
  readonly method?: string;
  readonly token: string;
  readonly body?: unknown;
  readonly headers?: Record<string, string>;
  readonly rawBody?: Buffer;
}

async function request(
  stack: LiveStack,
  path: string,
  options: RequestOptions
): Promise<ApiResponse> {
  assertLocalTarget(stack.url);
  const headers: Record<string, string> = {
    apikey: options.token,
    authorization: `Bearer ${options.token}`,
    ...options.headers,
  };
  let payload: BodyInit | undefined;
  if (options.rawBody) {
    payload = new Uint8Array(options.rawBody);
  } else if (options.body !== undefined) {
    headers["content-type"] = "application/json";
    payload = JSON.stringify(options.body);
  }
  const response = await fetch(`${stack.url}${path}`, {
    method: options.method ?? "GET",
    headers,
    body: payload,
    signal: AbortSignal.timeout(10_000),
  });
  const text = await response.text();
  let body: unknown = text;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    /* not JSON — `text` is the whole truth for this response */
  }
  return { status: response.status, ok: response.ok, body, text };
}

/* -------------------------------------------------------------------------
 * Actors
 * ---------------------------------------------------------------------- */

/** One party in the access matrix. */
export interface Actor {
  readonly slot: string;
  readonly token: string;
  /** `null` for anon, which is nobody. */
  readonly userId: string | null;
  readonly email: string | null;
}

/** Everything one Tier B test needs: three actors and a run identifier. */
export interface Scenario {
  readonly stack: LiveStack;
  readonly runId: string;
  readonly anon: Actor;
  readonly ownerA: Actor;
  readonly ownerB: Actor;
  /** Service-role token — provisioning and cleanup only, never an assertion. */
  readonly serviceToken: string;
}

/**
 * Create two real accounts and hand back the three actors.
 *
 * Called *inside* each grader rather than from `beforeAll` on purpose: while
 * T2-202 does not exist, anything that throws must throw inside an `it.fails`
 * body, or Vitest reports a suite error instead of an expected failure and the
 * whole convention stops meaning anything.
 */
export async function provisionScenario(stack: LiveStack): Promise<Scenario> {
  const runId = randomUUID().slice(0, 8);
  const serviceToken = mintJwt({ role: "service_role" }, stack.jwtSecret);

  const makeOwner = async (slot: string): Promise<Actor> => {
    const email = testEmail(slot, runId);
    const created = await request(stack, "/auth/v1/admin/users", {
      method: "POST",
      token: serviceToken,
      body: { email, email_confirm: true },
    });
    if (!created.ok) {
      throw new Error(
        `could not create synthetic user ${email}: ` +
          `${created.status} ${created.text}`
      );
    }
    const userId = (created.body as { id?: string }).id;
    if (!userId) {
      throw new Error(`auth admin returned no id for ${email}`);
    }
    return {
      slot,
      userId,
      email,
      token: mintJwt(
        { role: "authenticated", sub: userId, email },
        stack.jwtSecret
      ),
    };
  };

  return {
    stack,
    runId,
    serviceToken,
    anon: {
      slot: "anon",
      userId: null,
      email: null,
      token: mintJwt({ role: "anon" }, stack.jwtSecret),
    },
    ownerA: await makeOwner("a"),
    ownerB: await makeOwner("b"),
  };
}

/**
 * Best-effort teardown. Never throws: a cleanup failure must not turn a
 * grader's verdict into something else.
 */
export async function teardownScenario(scenario: Scenario): Promise<void> {
  for (const actor of [scenario.ownerA, scenario.ownerB]) {
    if (!actor.userId) continue;
    try {
      await request(scenario.stack, `/auth/v1/admin/users/${actor.userId}`, {
        method: "DELETE",
        token: scenario.serviceToken,
      });
    } catch {
      /* best effort */
    }
  }
}

/* -------------------------------------------------------------------------
 * PostgREST
 * ---------------------------------------------------------------------- */

/** `select * from <table> <query>` as `actor`. */
export function selectRows(
  scenario: Scenario,
  actor: Actor,
  table: string,
  query = "select=*"
): Promise<ApiResponse> {
  return request(scenario.stack, `/rest/v1/${table}?${query}`, {
    token: actor.token,
  });
}

/** `insert into <table>` as `actor`, returning the inserted representation. */
export function insertRow(
  scenario: Scenario,
  actor: Actor,
  table: string,
  row: Record<string, unknown>
): Promise<ApiResponse> {
  return request(scenario.stack, `/rest/v1/${table}`, {
    method: "POST",
    token: actor.token,
    body: row,
    headers: { prefer: "return=representation" },
  });
}

/** `update <table> set … <query>` as `actor`. */
export function updateRows(
  scenario: Scenario,
  actor: Actor,
  table: string,
  query: string,
  patch: Record<string, unknown>
): Promise<ApiResponse> {
  return request(scenario.stack, `/rest/v1/${table}?${query}`, {
    method: "PATCH",
    token: actor.token,
    body: patch,
    headers: { prefer: "return=representation" },
  });
}

/** `delete from <table> <query>` as `actor`. */
export function deleteRows(
  scenario: Scenario,
  actor: Actor,
  table: string,
  query: string
): Promise<ApiResponse> {
  return request(scenario.stack, `/rest/v1/${table}?${query}`, {
    method: "DELETE",
    token: actor.token,
    headers: { prefer: "return=representation" },
  });
}

/** Call a Postgres function through PostgREST. */
export function rpc(
  scenario: Scenario,
  actor: Actor | { readonly token: string },
  fn: string,
  args: Record<string, unknown>
): Promise<ApiResponse> {
  return request(scenario.stack, `/rest/v1/rpc/${fn}`, {
    method: "POST",
    token: actor.token,
    body: args,
  });
}

/**
 * How many rows a PostgREST response carried. A denied read and an empty read
 * look different in status but identical in length, and both matter: a policy
 * that returns `[]` to a stranger is as correct as one that returns 403, and
 * one that returns the row is a breach either way.
 */
export function rowCount(response: ApiResponse): number {
  return Array.isArray(response.body) ? response.body.length : 0;
}

/* -------------------------------------------------------------------------
 * Fixtures built through the API
 * ---------------------------------------------------------------------- */

/** A vehicle + record + receipt row owned by `actor`, created as `actor`. */
export interface OwnedFixture {
  readonly vehicleId: string;
  readonly recordId: string;
  readonly receiptId: string;
  readonly storagePath: string;
}

function firstRow(
  response: ApiResponse,
  what: string
): Record<string, unknown> {
  const rows = Array.isArray(response.body) ? response.body : [];
  const row = rows[0];
  if (!response.ok || typeof row !== "object" || row === null) {
    throw new Error(
      `could not create ${what}: ${response.status} ${response.text}`
    );
  }
  return row as Record<string, unknown>;
}

/**
 * Build one owner's full object graph the way the app will: as that owner,
 * through the API, subject to the same policies. Nothing here uses the
 * service role — a fixture created with god rights would not prove that an
 * owner can create their own data.
 */
export async function createOwnedFixture(
  scenario: Scenario,
  actor: Actor,
  storagePath: string
): Promise<OwnedFixture> {
  const vehicle = firstRow(
    await insertRow(scenario, actor, "vehicles", {
      owner_id: actor.userId,
      display_name: testVehicleName(actor.slot),
      ...TEST_TAXONOMY_IDENTITY,
    }),
    "vehicle"
  );
  const record = firstRow(
    await insertRow(scenario, actor, "records", {
      vehicle_id: vehicle.id,
      occurred_on: "2026-08-30",
      kind: "work",
      cost_amount: 123.45,
      cost_currency: "CRC",
    }),
    "record"
  );
  const receipt = firstRow(
    await insertRow(scenario, actor, "receipts", {
      record_id: record.id,
      storage_path: storagePath,
      vendor: "TEST-T2-201-VENDOR",
      issued_on: "2026-08-30",
      amount: 123.45,
      currency: "CRC",
    }),
    "receipt"
  );
  return {
    vehicleId: String(vehicle.id),
    recordId: String(record.id),
    receiptId: String(receipt.id),
    storagePath,
  };
}

/* -------------------------------------------------------------------------
 * Storage
 * ---------------------------------------------------------------------- */

/**
 * How an upload differs from the default receipt.
 *
 * `bucket` defaults to receipts so every T2-201 call site reads unchanged;
 * T2-301a's photo graders pass it explicitly. The alternative — a required
 * argument — would have meant touching two dozen assertions that are already
 * proved, to say the thing they already said.
 */
export interface UploadOptions {
  readonly bucket?: string;
  readonly bytes?: Buffer;
  readonly contentType?: string;
}

/**
 * A string that appears in the *bytes* of a synthetic photo.
 *
 * Distinct from the marker in a photo's filename, which is a different claim
 * about a different thing: a listing leaking a name is not a bucket leaking
 * content, and an assertion should say which one it means.
 */
export const PHOTO_BODY_MARKER = "TEST-T2-301-PHOTO-BYTES";

/**
 * A genuine 1×1 JPEG: `FFD8` … `FFD9`, 631 bytes, decodable.
 *
 * The first version of this constant was not actually a JPEG — it had no
 * end-of-image marker, and the coherence guard in `vehicle-photos.test.ts`
 * caught that the moment the guard existed. It had never mattered because
 * Supabase's bucket filter reads the declared content type rather than
 * sniffing the bytes, which is exactly the kind of "works for a reason
 * unrelated to the claim" the graders here are meant to refuse.
 */
const JPEG_ONE_PIXEL = Buffer.from(
  "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoM" +
    "DAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/2wBDAQMEBAUEBQkFBQkUDQsN" +
    "FBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBT/wAAR" +
    "CAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAA" +
    "AgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2Jyggk" +
    "KFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIW" +
    "Gh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+T" +
    "l5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtRE" +
    "AAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChY" +
    "kNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goO" +
    "EhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uP" +
    "k5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD3+iiigD//2Q==",
  "base64"
);

/**
 * The photo fixture: a real JPEG with `PHOTO_BODY_MARKER` appended **after**
 * the end-of-image marker.
 *
 * The trailing text is why it is here rather than a bare JPEG. A grader
 * asserting `not.toContain(marker)` on a response body is worthless if the
 * bytes never contained the marker under any circumstance — it passes whether
 * the bucket leaked or not, which is precisely the vacuous-grader failure this
 * directory exists to catch, shipped inside the file that advertises catching
 * it (T2-301a review, F3).
 *
 * Safe on both sides: JPEG decoders stop at `FFD9` and ignore what follows, and
 * Supabase's bucket MIME filter reads the declared content type and the header,
 * not the tail. So the object is still a valid image *and* the leak assertions
 * can now fail.
 */
export const SYNTHETIC_JPEG = Buffer.concat([
  JPEG_ONE_PIXEL,
  Buffer.from(`\n${PHOTO_BODY_MARKER}\n`, "utf8"),
]);

/** Upload bytes into a private bucket as `actor`. */
export function uploadObject(
  scenario: Scenario,
  actor: Actor,
  path: string,
  options: UploadOptions = {}
): Promise<ApiResponse> {
  const bucket = options.bucket ?? RECEIPTS_BUCKET;
  const isPhotos = bucket === VEHICLE_PHOTOS_BUCKET;
  const bytes =
    options.bytes ??
    (isPhotos
      ? SYNTHETIC_JPEG
      : Buffer.from("%PDF-1.4 TEST-T2-201 synthetic receipt\n"));
  return request(scenario.stack, `/storage/v1/object/${bucket}/${path}`, {
    method: "POST",
    token: actor.token,
    rawBody: bytes,
    headers: {
      "content-type":
        options.contentType ?? (isPhotos ? "image/jpeg" : "application/pdf"),
    },
  });
}

/** Fetch an object as `actor` — the authenticated read path. */
export function downloadObject(
  scenario: Scenario,
  actor: Actor,
  path: string,
  bucket: string = RECEIPTS_BUCKET
): Promise<ApiResponse> {
  return request(scenario.stack, `/storage/v1/object/${bucket}/${path}`, {
    token: actor.token,
  });
}

/**
 * Hit the *public* object route — the one that exists for public buckets and
 * must not answer for this one. GAR-05′: "never publicly accessible".
 */
export async function fetchPublicObject(
  scenario: Scenario,
  path: string,
  bucket: string = RECEIPTS_BUCKET
): Promise<ApiResponse> {
  assertLocalTarget(scenario.stack.url);
  const response = await fetch(
    `${scenario.stack.url}/storage/v1/object/public/${bucket}/${path}`,
    { signal: AbortSignal.timeout(10_000) }
  );
  return {
    status: response.status,
    ok: response.ok,
    text: await response.text(),
    body: null,
  };
}

/** Ask for a signed URL as `actor`. */
export function signObject(
  scenario: Scenario,
  actor: Actor,
  path: string,
  bucket: string = RECEIPTS_BUCKET,
  expiresIn = 60
): Promise<ApiResponse> {
  return request(scenario.stack, `/storage/v1/object/sign/${bucket}/${path}`, {
    method: "POST",
    token: actor.token,
    body: { expiresIn },
  });
}

/** Follow a signed URL with no credentials at all. */
export async function followSignedUrl(
  stack: LiveStack,
  signed: string
): Promise<ApiResponse> {
  assertLocalTarget(stack.url);
  const url = signed.startsWith("http")
    ? signed
    : `${stack.url}/storage/v1${signed.startsWith("/") ? "" : "/"}${signed}`;
  assertLocalTarget(url);
  const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  return {
    status: response.status,
    ok: response.ok,
    text: await response.text(),
    body: null,
  };
}

/** List a bucket's objects as `actor` — the enumeration path. */
export function listObjects(
  scenario: Scenario,
  actor: Actor,
  prefix = "",
  bucket: string = RECEIPTS_BUCKET
): Promise<ApiResponse> {
  return request(scenario.stack, `/storage/v1/object/list/${bucket}`, {
    method: "POST",
    token: actor.token,
    body: { prefix, limit: 100, offset: 0 },
  });
}

/* -------------------------------------------------------------------------
 * Auth surface
 * ---------------------------------------------------------------------- */

/** GoTrue's advertised settings — which providers are actually switched on. */
export function authSettings(stack: LiveStack): Promise<ApiResponse> {
  return request(stack, "/auth/v1/settings", {
    token: mintJwt({ role: "anon" }, stack.jwtSecret),
  });
}

/**
 * Create a user through the admin API, optionally with a password.
 *
 * The password half exists for finding F3: the original password-grant grader
 * probed an account that did not exist, and GoTrue answers `400 invalid_grant`
 * for an unknown account whether the grant is enabled or not. The grader could
 * not fail — a stub handing out real password sessions passed it. To ask the
 * question properly there has to be a real account with a real password to ask
 * about.
 */
export function adminCreateUser(
  stack: LiveStack,
  body: Record<string, unknown>
): Promise<ApiResponse> {
  return request(stack, "/auth/v1/admin/users", {
    method: "POST",
    token: mintJwt({ role: "service_role" }, stack.jwtSecret),
    body,
  });
}

/** Remove a user created by `adminCreateUser`. Best-effort. */
export async function adminDeleteUser(
  stack: LiveStack,
  userId: string
): Promise<void> {
  try {
    await request(stack, `/auth/v1/admin/users/${userId}`, {
      method: "DELETE",
      token: mintJwt({ role: "service_role" }, stack.jwtSecret),
    });
  } catch {
    /* best effort */
  }
}

/**
 * Ask GoTrue for a magic link (OTP) for `email`.
 *
 * ACC-01's *positive* half. Finding F4: the only magic-link control here used
 * to be `GET /auth/v1/settings` returning 200, which a stack that refuses
 * every sign-in also does. This exercises the flow the requirement actually
 * mandates.
 */
export function requestMagicLink(
  stack: LiveStack,
  email: string,
  createUser = false
): Promise<ApiResponse> {
  return request(stack, "/auth/v1/otp", {
    method: "POST",
    token: mintJwt({ role: "anon" }, stack.jwtSecret),
    body: { email, create_user: createUser },
  });
}

/** Try to sign up with a password. ACC-01 requires this to be refused. */
export function passwordSignUp(
  stack: LiveStack,
  email: string,
  password: string
): Promise<ApiResponse> {
  return request(stack, "/auth/v1/signup", {
    method: "POST",
    token: mintJwt({ role: "anon" }, stack.jwtSecret),
    body: { email, password },
  });
}

/** Try to exchange a password for a session. ACC-01 requires a refusal. */
export function passwordGrant(
  stack: LiveStack,
  email: string,
  password: string
): Promise<ApiResponse> {
  return request(stack, "/auth/v1/token?grant_type=password", {
    method: "POST",
    token: mintJwt({ role: "anon" }, stack.jwtSecret),
    body: { email, password },
  });
}

/**
 * Run ACC-03 end to end: the user asks, then the window closes.
 *
 * Two calls because it is two events with two different callers, and pinning
 * them as one function was incoherent (T2-201 review, F7). `actor` requests
 * their *own* deletion — the routine takes no user id, so it cannot be aimed
 * at anyone else — and the scheduled purge then runs as the service role with
 * `p_now` set past the recovery window, which is how a grader reaches "thirty
 * days later" without waiting for it.
 *
 * Returns both responses so a grader can tell which half failed.
 */
export async function runAccountPurge(
  scenario: Scenario,
  actor: Actor
): Promise<{ readonly request: ApiResponse; readonly purge: ApiResponse }> {
  const request = await rpc(scenario, actor, REQUEST_DELETION_FUNCTION, {});
  const purge = await rpc(
    scenario,
    { token: scenario.serviceToken },
    PURGE_FUNCTION,
    { p_now: PAST_THE_WINDOW }
  );
  return { request, purge };
}

/**
 * A timestamp comfortably past any 30-day window measured from "now". Written
 * as an offset rather than a fixed date so the graders do not quietly stop
 * exercising the purge in 2027.
 */
const PAST_THE_WINDOW = new Date(
  Date.now() + (RECOVERY_WINDOW_DAYS + 1) * 24 * 60 * 60 * 1000
).toISOString();

/** Delete an `auth.users` row — ACC-03's terminal event. */
export function deleteAuthUser(
  scenario: Scenario,
  userId: string
): Promise<ApiResponse> {
  return request(scenario.stack, `/auth/v1/admin/users/${userId}`, {
    method: "DELETE",
    token: scenario.serviceToken,
  });
}
