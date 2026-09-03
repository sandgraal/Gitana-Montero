/**
 * Where a share token lives in a URL — the seam, declared by T2-401 [TEST],
 * filled by T2-404 [PLATFORM].
 *
 * ## The whole module is one decision, and it is a security decision
 *
 * A share token is a bearer credential (SHR-05). Every place a URL is recorded
 * is a place that credential leaks, and the list is longer than it looks: the
 * Vercel edge log, the Supabase request log, the browser's history and its
 * sync, the `Referer` header on every outbound link and every third-party
 * asset, an analytics beacon, a proxy, a shoulder, a screenshot.
 *
 * **A fragment reaches no server.** `https://…/s/#t=<token>` is sent to the
 * origin as `https://…/s/`; the fragment never leaves the browser, appears in
 * no access log, and is not part of any `Referer`. A path segment or a query
 * parameter is the opposite of that in every respect — and a path token also
 * cannot be prerendered, so it would force SSR (001 SCF-01) for no benefit at
 * all.
 *
 * The three rules, and each is graded separately because each fails on its own:
 *
 * 1. **The token is in the fragment.** {@link shareLinkFor} puts it there;
 *    `share-delivery.test.ts` asserts no route under `src/pages/` takes a token
 *    as a path segment or a search parameter.
 * 2. **The client POSTs it, never GETs it.** A `GET /rest/v1/rpc/x?token=…`
 *    puts the credential straight back into the log the fragment kept it out
 *    of. PostgREST accepts RPC over both verbs, so this is a real choice
 *    somebody can make wrongly.
 * 3. **`Referrer-Policy: no-referrer` on the share page.** The fragment is not
 *    in a `Referer`, but the *path* still is, and the path names a page that
 *    exists only because somebody was given a grant. `vercel.json` has no
 *    `headers` block today; this is a file edit, not a dashboard setting.
 *
 * ## Not implemented
 *
 * Every function throws {@link NOT_IMPLEMENTED}.
 *
 * refs specs/002-montero-garage (SHR-05, SHR-07, SHR-08), 003 (MEC-04)
 */

/** The seam marker. Every grader waiting on T2-404 asserts on this string. */
export const NOT_IMPLEMENTED = "not implemented: T2-401";

/**
 * The fragment key the token travels under.
 *
 * Named rather than spelled inline in two places, because the writer and the
 * reader disagreeing about it is a bug whose symptom is "the link does not
 * work", which somebody fixes by moving the token into the query string.
 */
export const SHARE_TOKEN_FRAGMENT_KEY = "t";

/**
 * The full share URL for `token`, in `locale`.
 *
 * `origin` is a parameter rather than read from `import.meta.env` so this stays
 * pure and gradeable without a build.
 */
export function shareLinkFor(input: {
  readonly origin: string;
  readonly locale: string;
  readonly token: string;
}): string {
  // The token is deliberately NOT interpolated into this message. A seam error
  // is precisely the kind of string that ends up in a log, and a bearer secret
  // has no business in one.
  throw new Error(`${NOT_IMPLEMENTED} — shareLinkFor(${input.locale})`);
}

/**
 * The token carried by `url`, or `null` when there is none.
 *
 * `null`, never `""`: an absent token and an empty one are different states and
 * only one of them is worth sending to the database (AGENTS.md — a failure is
 * not a zero).
 *
 * **Reads the fragment only.** A token in the query string is not a token this
 * function will honour, so a link that leaked one into the log does not also
 * work — it fails, loudly, where somebody will notice.
 */
export function shareTokenFromUrl(url: string): string | null {
  // Origin and path only, never the fragment — same reasoning as above.
  throw new Error(
    `${NOT_IMPLEMENTED} — shareTokenFromUrl(${url.split("#")[0]})`
  );
}
