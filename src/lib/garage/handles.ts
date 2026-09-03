/**
 * Public handles — the seam, declared by T2-401 [TEST], filled by T2-402
 * [PLATFORM].
 *
 * > **SHR-02** A user SHALL be able to publish, per vehicle: a showcase page
 * > and/or a work-log page, each at a **stable public URL under their handle**,
 * > bilingual chrome, user content in whatever language the user wrote.
 *
 * ## Why a handle is a security object and not a nickname
 *
 * A handle is the only part of a garage URL a stranger can guess or type, and
 * three of its properties decide whether a link means what its reader thinks:
 *
 * 1. **Uniqueness has to live in the database.** Two signups checking "is
 *    `gitana` free?" at the same moment both get "yes", so the answer must be a
 *    unique index and not a lookup in the form. `handles.test.ts` proves the
 *    constraint exists by writing twice; it does not simulate the race itself,
 *    and says so.
 * 2. **Case must fold.** `Gitana` and `gitana` are the same string in the same
 *    position of the same URL to every reader on earth, and two accounts that
 *    differ only in case is an impersonation kit.
 * 3. **A released handle must not immediately become somebody else's.** SHR-02
 *    says the URL is *stable*. If a rename frees the old handle for a stranger,
 *    every link already shared quietly starts pointing at a different person's
 *    garage — a URL that changed its meaning without changing its text.
 *
 * None of those is expressible as a column type, which is why this module and
 * `handles.test.ts` exist beside `contract.ts`'s one-line `handle` column.
 *
 * ## The reserved list is not a taste question
 *
 * `RESERVED_HANDLES` in `tests/garage/contract.ts` covers the impersonation
 * words (`admin`, `api`, `support`, …). What it cannot know is the route
 * segment somebody adds next year, so the grader reads the site's own segments
 * out of `src/i18n/routes.ts` at test time and requires the reserved set to be
 * a superset of them. A list checked only against itself is a list that stops
 * being complete the first time the site grows.
 *
 * The list itself stays hand-written — reserving a word is a decision, and the
 * grader's job is to make forgetting one a red build rather than to guess on
 * the author's behalf.
 *
 * ## Not implemented
 *
 * Every function throws {@link NOT_IMPLEMENTED}.
 *
 * refs specs/002-montero-garage (SHR-01, SHR-02, SHR-04)
 */

/** The seam marker. Every grader waiting on T2-402 asserts on this string. */
export const NOT_IMPLEMENTED = "not implemented: T2-401";

/** Why a candidate handle cannot be used. One reason per failing rule. */
export type HandleIssue =
  "empty" | "too-short" | "too-long" | "bad-characters" | "reserved";

/**
 * Fold a candidate handle to its canonical form.
 *
 * Canonicalisation is what makes uniqueness meaningful: the unique index is on
 * *this* value, so `Gitana`, `gitana`, and ` gitana ` are one handle and not
 * three. It is deliberately **not** a validator — it returns a string for any
 * input, including one that {@link handleIssues} will then reject, so the two
 * concerns stay separable and each is graded on its own.
 */
export function normalizeHandle(input: string): string {
  throw new Error(
    `${NOT_IMPLEMENTED} — normalizeHandle(${JSON.stringify(input)})`
  );
}

/**
 * Every reason `input` may not be claimed as a handle, in a stable order.
 *
 * An array rather than a boolean or a first-failure: a form that can only say
 * "invalid" makes the user guess, and a grader that only sees "invalid" cannot
 * tell a length rule from a reservation rule — which is how a reservation rule
 * gets accidentally deleted and nothing notices.
 */
export function handleIssues(input: string): readonly HandleIssue[] {
  throw new Error(
    `${NOT_IMPLEMENTED} — handleIssues(${JSON.stringify(input)})`
  );
}

/**
 * The path a published page lives at, for `handle` in `locale`.
 *
 * Here rather than in a page component because it is the thing SHR-02 calls
 * stable, and I18N-04 needs the two locales' spellings of it to emit the
 * hreflang pair. A URL built inline in markup is a URL with no test.
 */
export function handlePath(input: {
  readonly handle: string;
  readonly locale: string;
}): string {
  throw new Error(
    `${NOT_IMPLEMENTED} — handlePath(${input.locale}/${input.handle})`
  );
}
