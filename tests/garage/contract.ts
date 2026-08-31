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
