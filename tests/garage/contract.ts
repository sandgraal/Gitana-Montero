/**
 * The user-data contract, in one place — declared by T2-201 [TEST], satisfied
 * by T2-202 [PLATFORM].
 *
 * Every name below is **derived from `specs/002-montero-garage/spec.md`, not
 * from an implementation**: no implementation exists yet. A test-writer
 * instance authored this file and must not be the instance that builds
 * T2-202 (AGENTS.md separation rule; T901 audits it).
 *
 * ## Why the names live here and nowhere else
 *
 * A grader has to name something. Table and column names are a *design*
 * decision that this file makes on the spec's behalf so the graders can be
 * concrete — but making them concrete in nine test files would turn a rename
 * into a nine-file argument. They are all here instead: if T2-202 wants
 * `owner_id` to be `user_id`, that is a one-line conversation with the
 * conductor, not a rewrite. What is **not** negotiable is the behaviour the
 * graders assert around them, which comes straight from the constitution:
 *
 * > User data never leaves Supabase; every user table ships with row-level
 * > security proven by graders before content flows. — AGENTS.md, Boundaries
 *
 * ## Traceability
 *
 * Each entry carries the requirement id it exists to satisfy. If a row here
 * cites no requirement, it should not be here.
 *
 * refs specs/002-montero-garage (ACC-01, ACC-03, SHR-01, SHR-03, GAR-01′,
 * GAR-02′, GAR-05′, MIG-03)
 */

/* -------------------------------------------------------------------------
 * Column and table contracts
 * ---------------------------------------------------------------------- */

/** One column T2-202's DDL must declare, and how it must declare it. */
export interface ColumnContract {
  /** Column name as it must appear in `create table`. */
  readonly name: string;
  /** The requirement that puts this column in the schema. */
  readonly requirement: string;
  /**
   * A pattern the normalised column *type* must match, when the type is
   * load-bearing. Omitted where the spec constrains meaning but not storage
   * (a display name is text; nobody cares whether it is `text` or `varchar`).
   */
  readonly type?: RegExp;
  /** `true` when the column must be declared `not null`. */
  readonly notNull?: boolean;
  /**
   * The normalised `default` expression the column must carry, when the
   * default itself is the requirement. SHR-01 is exactly this case: the
   * privacy of a user's data is a schema default, not an application habit.
   */
  readonly defaultsTo?: string;
  /**
   * `true` when `not null default '{}'` is an acceptable way to spell
   * "optional" for this column.
   *
   * Only for collection-valued columns, where an empty array genuinely *is*
   * the absence of a value — and a better model than nullable, because it
   * removes the null-versus-empty ambiguity. Never for a scalar: `cost_amount
   * numeric not null default 0` is not an empty cost, it is a claim that the
   * job was free (T2-201 review, F8).
   */
  readonly absenceDefaultAllowed?: boolean;
}

/** One table T2-202's DDL must create, with the ownership path RLS uses. */
export interface TableContract {
  /** Unqualified table name in the `public` schema. */
  readonly name: string;
  /** The requirement that puts this table in the schema. */
  readonly requirement: string;
  /**
   * How a row reaches its owning user, as a chain of foreign keys ending at
   * `auth.users.id`. `["owner_id"]` means the table carries the owner
   * directly; `["record_id", "vehicle_id", "owner_id"]` means two hops.
   *
   * The chain is what the cascade grader walks: every hop must be declared
   * `on delete cascade`, or ACC-03's hard delete leaves orphans behind.
   */
  readonly ownershipPath: readonly string[];
  readonly columns: readonly ColumnContract[];
}

/**
 * The four user-data tables. `profiles` exists because a user needs a row of
 * their own that is not `auth.users` (which no client may read).
 *
 * **Not graded here, and deliberately: SHR-02's public handle.** "a stable
 * public URL under their handle" implies a unique, immutable-ish,
 * reserved-word-screened identifier, and every one of those properties is a
 * grader of its own — uniqueness under concurrent signup, case folding,
 * whether `admin` and `api` are takeable, what happens to a published URL when
 * a handle changes. None of that is in T2-201's scope (ACC-01, ACC-03,
 * SHR-01, GAR-05′), and half-pinning it would be worse than leaving it open:
 * T2-202 would build to a contract that stops short of the hard parts.
 * **It belongs to T2-401 [TEST], with T2-402's public pages.** Named here so
 * nobody reads this file's silence as "handles are unconstrained".
 */
export const USER_TABLES: readonly TableContract[] = [
  {
    name: "profiles",
    requirement: "ACC-01 (an account has a row of its own)",
    ownershipPath: ["id"],
    columns: [
      {
        name: "id",
        requirement: "ACC-01",
        type: /uuid/,
        notNull: true,
      },
      {
        name: "deleted_at",
        requirement: "ACC-03 (the 30-day recovery window needs a mark)",
        type: /timestamptz|timestamp with time zone/,
      },
    ],
  },
  {
    name: "vehicles",
    requirement: "GAR-01′",
    ownershipPath: ["owner_id"],
    columns: [
      { name: "id", requirement: "GAR-01′", type: /uuid/, notNull: true },
      {
        name: "owner_id",
        requirement: "SHR-01 (RLS has to have something to compare)",
        type: /uuid/,
        notNull: true,
      },
      {
        name: "display_name",
        requirement: "GAR-01′ (“Gitana Blanca”)",
        notNull: true,
      },
      {
        name: "generation_id",
        requirement: "GAR-01′ (taxonomy identity, 001 VEH-01 ids)",
        notNull: true,
      },
      { name: "market_id", requirement: "GAR-01′" },
      { name: "model_year", requirement: "GAR-01′", type: /int/ },
      { name: "engine_id", requirement: "GAR-01′" },
      {
        name: "odometer_km",
        requirement: "GAR-01′ (current odometer)",
        type: /int|numeric/,
      },
      {
        // GAR-01′ names photos in the same breath as the display name. T2-201
        // could only grade that the word "photo" appeared somewhere in the
        // DDL, because no photo *surface* existed to have a shape. It does
        // now, so the column is pinned properly: an array of object paths in
        // VEHICLE_PHOTOS_BUCKET, in the same optional-collection idiom as a
        // record's reference arrays — `not null default '{}'`, where the
        // empty array is "no photos yet" with no null-versus-empty ambiguity
        // for every consumer to re-decide.
        name: "photo_paths",
        requirement: "GAR-01′ (photos) + SHR-01 (paths into a private bucket)",
        type: /\[\]|array/,
        absenceDefaultAllowed: true,
      },
      {
        name: "is_showcase_public",
        requirement: "SHR-01 + SHR-02 (showcase page, off by default)",
        type: /bool/,
        notNull: true,
        defaultsTo: "false",
      },
      {
        name: "is_worklog_public",
        requirement: "SHR-01 + SHR-02 (work-log page, off by default)",
        type: /bool/,
        notNull: true,
        defaultsTo: "false",
      },
    ],
  },
  {
    name: "records",
    requirement: "GAR-02′",
    ownershipPath: ["vehicle_id", "owner_id"],
    columns: [
      { name: "id", requirement: "GAR-02′", type: /uuid/, notNull: true },
      {
        name: "vehicle_id",
        requirement: "GAR-02′ (a record is an entry on a vehicle)",
        type: /uuid/,
        notNull: true,
      },
      {
        name: "occurred_on",
        requirement: "GAR-02′ (“dated”)",
        type: /date/,
        notNull: true,
      },
      {
        name: "kind",
        requirement: "GAR-02′ (“typed: work / receipt / note / plan”)",
        notNull: true,
      },
      { name: "cost_amount", requirement: "GAR-02′", type: /numeric|int/ },
      { name: "cost_currency", requirement: "GAR-02′" },
      { name: "time_minutes", requirement: "GAR-02′", type: /int/ },
      { name: "odometer_km", requirement: "GAR-02′", type: /int|numeric/ },
      {
        name: "problem_ids",
        requirement: "GAR-02′ (typed refs into 001 collections)",
        absenceDefaultAllowed: true,
      },
      {
        name: "part_ids",
        requirement: "GAR-02′",
        absenceDefaultAllowed: true,
      },
      {
        name: "procedure_ids",
        requirement: "GAR-02′",
        absenceDefaultAllowed: true,
      },
      {
        name: "is_public",
        requirement: "SHR-01 (per-record visibility, off by default)",
        type: /bool/,
        notNull: true,
        defaultsTo: "false",
      },
      {
        name: "is_cost_public",
        requirement: "SHR-03 (costs stay private unless opened per record)",
        type: /bool/,
        notNull: true,
        defaultsTo: "false",
      },
    ],
  },
  {
    name: "receipts",
    requirement: "GAR-05′",
    ownershipPath: ["record_id", "vehicle_id", "owner_id"],
    columns: [
      { name: "id", requirement: "GAR-05′", type: /uuid/, notNull: true },
      {
        name: "record_id",
        requirement: "GAR-05′ (a receipt is an attachment on a record)",
        type: /uuid/,
        notNull: true,
      },
      {
        name: "storage_path",
        requirement: "GAR-05′ (the object in the private bucket)",
        notNull: true,
      },
      { name: "vendor", requirement: "GAR-05′" },
      { name: "issued_on", requirement: "GAR-05′", type: /date/ },
      { name: "amount", requirement: "GAR-05′", type: /numeric|int/ },
      { name: "currency", requirement: "GAR-05′" },
    ],
  },
] as const;

/** Convenience: the table names, in the order the cascade walks them. */
export const USER_TABLE_NAMES = USER_TABLES.map((table) => table.name);

/**
 * Every column whose *default* is the privacy guarantee. SHR-01 says
 * "everything a user stores SHALL default to private"; a boolean that is
 * nullable, or defaults to true, or has no default at all, breaks it — so all
 * three are graded, not just the value.
 */
export const SHARE_FLAG_COLUMNS: readonly {
  readonly table: string;
  readonly column: string;
  readonly requirement: string;
}[] = USER_TABLES.flatMap((table) =>
  table.columns
    .filter((column) => column.defaultsTo === "false")
    .map((column) => ({
      table: table.name,
      column: column.name,
      requirement: column.requirement,
    }))
);

/* -------------------------------------------------------------------------
 * Storage
 * ---------------------------------------------------------------------- */

/**
 * The private bucket receipts live in (GAR-05′: "uploadable (image/PDF) into
 * user-private storage … never publicly accessible").
 */
export const RECEIPTS_BUCKET = "receipts";

/**
 * The private bucket vehicle photos live in — declared by T2-301a [TEST],
 * created by T2-301 [PLATFORM].
 *
 * ## Naming (T2-301a decision)
 *
 * `vehicle-photos`, not `photos`. A bucket id is global to the project and
 * permanent in every stored path, so the generic name would have to be shared
 * the first time anything else needs images — a profile avatar, a showcase
 * banner — and sharing it means one policy governing objects with different
 * ownership rules. `vehicle-photos` says what is in it and leaves the generic
 * name free.
 *
 * ## Private, like receipts, and for a reason that is *not* obvious
 *
 * A receipt is private because of what it shows. A vehicle photo is private
 * because of SHR-01: "everything a user stores SHALL default to private". A
 * truck in a driveway is a house, a plate, a neighbourhood. Nothing about
 * GAR-01′ asks for photos to be reachable without a session, and a public
 * bucket cannot be made private again for objects already uploaded.
 *
 * **Open question this deliberately does not answer, flagged for T2-401/402:**
 * SHR-02's showcase page is public, and a public page cannot render an object
 * from a private bucket without a signed URL, which expires. Whether that is
 * solved with long-lived signed URLs, a render-time proxy, or a second public
 * bucket that a user opts an image into, is a *sharing* decision and belongs
 * with the sharing graders. Pinning it here would be inventing the answer.
 *
 * The constraint that makes it hard, so T2-401 does not have to rediscover it:
 * **this site is static** (AGENTS.md, Stack — Astro, static output, on Vercel).
 * There is no request-time server to mint a fresh signed URL for an anonymous
 * visitor, so every option collapses to signing at *build* time — which means
 * a URL whose expiry is a deploy-cadence problem, and a rebuild whenever a
 * user adds a photo — or introducing an Edge Function, which is a new runtime
 * surface and therefore a stop-and-ask rather than a drive-by.
 */
export const VEHICLE_PHOTOS_BUCKET = "vehicle-photos";

/**
 * Every bucket that must never serve an object without a session.
 *
 * `vehicle-photos.test.ts` runs a `describe.each` sweep over this list —
 * created-private, policed on all four commands, reached by the account purge
 * — so a third private bucket added here inherits those invariants the day it
 * is created, rather than the day someone remembers to write graders for it.
 *
 * The sweep is unmarked and conditional on the bucket existing, because a
 * bucket's *existence* is a different claim from its privacy and is pinned
 * separately. Adding a name here therefore costs nothing until the migration
 * catches up, and starts paying the moment it does.
 */
export const PRIVATE_BUCKETS = [
  RECEIPTS_BUCKET,
  VEHICLE_PHOTOS_BUCKET,
] as const;

/* -------------------------------------------------------------------------
 * Auth surface (ACC-01)
 * ---------------------------------------------------------------------- */

/**
 * > **ACC-01** THE site SHALL authenticate users via Supabase Auth with email
 * > magic link and Google OAuth, and no password flow.
 *
 * "and no password flow" is the load-bearing half. The allowed set is closed:
 * anything not in it is a finding, including providers that are merely
 * *available* and left switched on by a default config.
 */
export const ALLOWED_AUTH_PROVIDERS = ["email", "google"] as const;

/**
 * External providers Supabase Auth can be configured with. The auth-surface
 * grader asserts every one of these except `google` is disabled — an
 * allow-list is only a guarantee if the deny half is enumerated.
 *
 * Source: `supabase/config.toml`'s `[auth.external.*]` table as shipped by
 * the Supabase CLI. If the CLI adds a provider, this list grows; a provider
 * missing from the config file counts as disabled.
 */
export const KNOWN_EXTERNAL_PROVIDERS = [
  "apple",
  "azure",
  "bitbucket",
  "discord",
  "facebook",
  "figma",
  "github",
  "gitlab",
  "google",
  "kakao",
  "keycloak",
  "linkedin_oidc",
  "notion",
  "slack_oidc",
  "spotify",
  "twitch",
  "twitter",
  "workos",
  "zoom",
] as const;

/* -------------------------------------------------------------------------
 * Account deletion (ACC-03)
 * ---------------------------------------------------------------------- */

/**
 * > **ACC-03** A user SHALL be able to delete their account; after a 30-day
 * > recovery window, all vehicles, records, and stored files SHALL be
 * > hard-deleted.
 *
 * ## Why this is two functions and not one
 *
 * The first version pinned a single `hard_delete_account(p_user_id uuid)` and
 * pinned it **inconsistently** (T2-201 review, F7): the declaration grader
 * demanded `auth.uid()` inside the body — so a stranger could not name a
 * victim — while the behavioural grader invoked it with a service token,
 * where `auth.uid()` is null. No single implementation could satisfy both.
 * The graders described two different functions and nobody noticed because
 * neither tier could run.
 *
 * They really are two different functions, so ACC-03's two events now get one
 * each:
 *
 * 1. **The user asks.** `request_account_deletion()` takes **no argument** and
 *    marks the caller's own account, using `auth.uid()`. Taking no user id is
 *    what makes "delete someone else's account" unrepresentable rather than
 *    merely forbidden — there is no parameter to put a victim in.
 * 2. **Thirty days pass.** `purge_expired_accounts(p_now timestamptz)` is the
 *    scheduled job: service-role only, no user argument, and it hard-deletes
 *    every account whose window has closed. It takes `p_now` so a grader can
 *    make "thirty days later" happen without waiting — the window stays real,
 *    and it stays testable.
 *
 * 3. **The terminal event.** Deleting the `auth.users` row must leave nothing
 *    behind, whatever route got us there. That grader names nothing at all
 *    and survives any rename of either function above.
 */
export const REQUEST_DELETION_FUNCTION = "request_account_deletion";

/** The scheduled purge. Service-role only; `p_now` makes the window testable. */
export const PURGE_FUNCTION = "purge_expired_accounts";

/** The recovery window, in days, that the purge must honour. */
export const RECOVERY_WINDOW_DAYS = 30;

/* -------------------------------------------------------------------------
 * Typed share grants (SHR-05..08) — declared by T2-401a [TEST]
 * ---------------------------------------------------------------------- */

/**
 * The roles an anonymous visitor arrives as.
 *
 * `public` is in the list because it is not a role beside `anon` — it is
 * *every* role, `anon` included. A privilege granted to `public` is a
 * privilege `anon` holds, and a `revoke … from anon` does not take it away.
 */
export const ANONYMOUS_ROLES = ["anon", "public"] as const;

/**
 * One function a grant holder with **no account** may execute.
 *
 * ## Why this list is the whole allow-list, and why it is closed
 *
 * SHR-07 puts a reader on the far side of the database with no `auth.uid()`,
 * which means RLS cannot be what protects it: the architecture decided for
 * T2-404 is a `security definer` function granted to `anon`, and a definer
 * function runs as its owner with RLS on the tables it reads **not consulted**.
 * Whatever the body checks is the entire access control.
 *
 * So the question a grader has to be able to answer is not "are these three
 * functions safe" but "is anything *else* reachable". That is only answerable
 * against a closed set: the functions executable by `anon` or `public` must
 * **equal** this list. The deny half is enumerated the same way
 * `KNOWN_EXTERNAL_PROVIDERS` enumerates it for auth providers — an allow-list
 * is only a guarantee when the complement is computed, not assumed.
 *
 * ## The names are this file's decision, and renegotiable in one line
 *
 * Exactly as for the table names above: T2-401a has to name something for the
 * graders to be concrete, and it names it here rather than in five test files.
 * If T2-404 prefers `share_records_read`, that is a one-line conversation with
 * the conductor. What is **not** negotiable is the behaviour graded around
 * them — definer, `set search_path = ''`, hash-not-plaintext, expiry,
 * revocation, and a named column projection.
 *
 * ## Why three readers and not one
 *
 * SHR-06: "costs and receipts are two decisions, not one", and where a grant
 * does not open costs "THE data returned SHALL omit the cost fields entirely
 * rather than blanking them at render time". Two independent capability bits
 * over one all-or-nothing payload is how a blanking bug gets written; separate
 * entry points make the omission structural. The vehicle reader is separate
 * again because §10's fourth ruling gives the accountless holder the 001
 * reference "filtered to that exact vehicle by the fitment engine", and that
 * needs the taxonomy identity and nothing else.
 */
/**
 * The schema every unqualified name in this file lives in.
 *
 * ## Why this is a named constant and not the string `"public"` in six places
 *
 * Every routine name here is written unqualified, and a grader that matches an
 * unqualified name against a parsed routine is matching **half an identity**.
 * Postgres will happily hold a `private.share_read_records` beside a
 * `public.share_read_records`; they are different functions with different
 * ACLs, and a comparison on `name` alone cannot tell them apart. That is not a
 * hypothetical — it is the shape a schema-qualified migration takes the first
 * time someone moves a helper out of `public` to tidy the API surface.
 *
 * Named here so the schema half of every comparison comes from one place, and
 * so a contract entry that ever needs a different schema is a one-line change
 * rather than a hunt (PR #74 review).
 */
export const CONTRACT_SCHEMA = "public";

export interface ShareReaderContract {
  /** Unqualified function name, resolved in `CONTRACT_SCHEMA`. */
  readonly name: string;
  /** The requirement that puts this function on the anon surface. */
  readonly requirement: string;
  /** What it is for, in one line, for a finding message. */
  readonly purpose: string;
}

export const SHARE_READER_FUNCTIONS: readonly ShareReaderContract[] = [
  {
    name: "share_read_vehicle",
    requirement:
      "SHR-05 + SHR-07 (§10 ruling 4: reference filtered by fitment)",
    purpose:
      "the vehicle's taxonomy identity, so the 001 fitment engine can filter " +
      "the reference to this exact truck",
  },
  {
    name: "share_read_records",
    requirement: "SHR-05 + SHR-06 (history; cost fields omitted, not blanked)",
    purpose:
      "the vehicle's history, with cost columns present only when the grant opens them",
  },
  {
    name: "share_read_receipts",
    requirement: "SHR-06 (receipts open independently of costs)",
    purpose:
      "receipt metadata and the storage path the Edge signer resolves, only " +
      "when the grant opens receipts",
  },
] as const;

/** Convenience: the share-reader names. */
export const SHARE_READER_NAMES = SHARE_READER_FUNCTIONS.map(
  (reader) => reader.name
);

/**
 * The enumerated deny half: routines that exist today and must never become
 * executable by `anon` or `public`.
 *
 * The closed allow-list above already catches any of these by computing the
 * complement, so this list is belt and braces — but it is the half that names
 * *why* each one is dangerous, and a finding that says
 * "purge_expired_accounts is anon-executable" is worth more than one that says
 * "an unexpected function is anon-executable".
 *
 * A name absent from the migrations is not a finding here: this asks what is
 * true of the routines that exist, not that they all still exist.
 */
export const PRIVILEGED_FUNCTIONS: readonly {
  readonly name: string;
  readonly why: string;
}[] = [
  {
    name: "handle_new_user",
    why: "inserts into profiles as its owner; anon-executable means anyone mints rows",
  },
  {
    name: "request_account_deletion",
    why: "ACC-03: marks an account for deletion — must require a session to name one",
  },
  {
    name: "purge_expired_accounts",
    why: "ACC-03: hard-deletes accounts whose window closed; service-role only",
  },
  {
    name: "handle_vehicle_deleted",
    why: "deletes storage objects as its owner",
  },
  {
    name: "deny_password_login",
    why: "ACC-01: GoTrue's auth hook; only supabase_auth_admin may call it",
  },
] as const;

/**
 * The column a share token is stored in — **a hash, never the token**.
 *
 * T2-404's architecture record: 256 bits from `gen_random_bytes(32)`, stored
 * as `token_hash bytea not null unique` = `digest(token, 'sha256')`. Plain
 * sha256 is deliberate and correct against a 256-bit keyspace; the point the
 * graders pin is that the *stored* value is not the bearer secret, so a
 * database leak is not a grant leak.
 */
export const SHARE_TOKEN_HASH_COLUMN = "token_hash";

/**
 * Column names that would mean the bearer secret is stored in the clear.
 *
 * Graded as a sweep over every created table rather than over a `shares` table
 * this file has not declared: the claim is "no table anywhere stores a share
 * token in plaintext", and naming the table would make it a claim about one.
 */
export const PLAINTEXT_TOKEN_COLUMNS = [
  "token",
  "token_plaintext",
  "plain_token",
  "share_token",
  "secret",
] as const;

/**
 * > **SHR-08** Every grant SHALL be revocable by its issuer at any time and
 * > SHALL carry an expiry.
 *
 * Two columns, because they are two independent failures. A grant that
 * validates the hash but never reads `revoked_at` is a grant that **cannot be
 * revoked**, and SHR-08 says revocation "SHALL take effect on the next request"
 * — which makes it the likeliest and the worst defect in the feature.
 */
export const GRANT_EXPIRY_COLUMN = "expires_at";
export const GRANT_REVOCATION_COLUMN = "revoked_at";

/**
 * Tables that may exist in `public` without being user data.
 *
 * In the style of `check-hreflang.mjs`'s `EXEMPT_PAGES`: a *named* exemption
 * with a reason, so the sweep over `createdTables()` stays closed. Anything
 * created in `public` that is neither in `USER_TABLES` nor named here is a
 * finding — "an ungraded table", which is what the constitution's "every user
 * table ships with row-level security proven by graders" forbids.
 *
 * **Empty today, and deliberately so.** The four tables that exist are all
 * enumerated. In particular `shares` is *not* exempt: when T2-404 creates it,
 * this sweep goes red until T2-401 adds it to `USER_TABLES`, which is exactly
 * the ordering the task list already encodes (T2-401 merges before T2-404).
 * Exempting it here to keep the build quiet would re-open the hole this map
 * was added to close.
 */
export const EXEMPT_PUBLIC_TABLES: ReadonlyMap<string, string> = new Map<
  string,
  string
>([]);

/* -------------------------------------------------------------------------
 * Synthetic fixture namespace
 * ---------------------------------------------------------------------- */

/**
 * Every row, file, and account these graders create is stamped `TEST-` and
 * addressed in the RFC 2606 `.invalid` TLD, so a fixture that escapes into a
 * real database is obvious on sight and its email can never be delivered.
 * Nothing here resembles a real owner, a real truck, or a real receipt.
 */
export const TEST_NAMESPACE = "TEST-T2-201";

/** A non-routable address for synthetic actor `slot` (`a`, `b`, …). */
export function testEmail(slot: string, runId: string): string {
  return `${TEST_NAMESPACE.toLowerCase()}-${slot}-${runId}@t2-201.invalid`;
}

/** A display name no real user would pick. */
export function testVehicleName(slot: string): string {
  return `${TEST_NAMESPACE}-VEHICLE-${slot.toUpperCase()}`;
}

/** A receipt object path inside the private bucket. */
export function testReceiptPath(ownerId: string, slot: string): string {
  return `${ownerId}/${TEST_NAMESPACE}-RECEIPT-${slot}.pdf`;
}

/**
 * A vehicle-photo object path — **`<owner uuid>/<vehicle id>/<file>`**.
 *
 * ## Why two segments (T2-301a decision)
 *
 * The first segment is the owner, exactly as for receipts, because
 * `(storage.foldername(name))[1]` is what every storage policy compares to
 * `auth.uid()`. Keeping that position identical means the photos policies are
 * the receipts policies with one bucket id changed — a shape already proved
 * against the whole cross-user matrix, rather than a second thing to get
 * right.
 *
 * The second segment is the vehicle, and it is what makes
 * "delete this vehicle's photos" a prefix operation instead of a join. Without
 * it, removing one vehicle from a garage with three would mean reading
 * `photo_paths`, diffing it against the bucket, and hoping the two agree —
 * a reconciliation that is wrong the moment either side is written outside
 * the happy path.
 */
export function testVehiclePhotoPath(
  ownerId: string,
  vehicleId: string,
  slot: string
): string {
  return `${ownerId}/${vehicleId}/${TEST_NAMESPACE}-PHOTO-${slot}.jpg`;
}

/**
 * A taxonomy identity for a synthetic vehicle. Real 001 ids (`gen3`, `us`,
 * `6g74-sohc`) on purpose: GAR-01′ says the identity is "resolved against
 * 001's vehicles collection", so a fixture with an invented generation would
 * be testing the wrong thing the day that resolution is enforced.
 */
export const TEST_TAXONOMY_IDENTITY = {
  generation_id: "gen3",
  market_id: "us",
  model_year: 2002,
  engine_id: "6g74-sohc",
} as const;
