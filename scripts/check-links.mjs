/**
 * `check:links` — SCF-02/SCF-03's link check, source half.
 *
 * ci.yml's `links-a11y` job runs `npm run check:links --if-present` on its
 * own runner with no build step first, so this cannot assume `dist/` exists
 * (that is `check:hreflang`'s job, which runs post-`astro build` inside
 * `verify`). What this script can check without a build: every entry's cited
 * sources, walked straight from `src/content/`.
 *
 * Two checks, both real (not a stub):
 *
 * 1. **Archive shape.** AGENTS.md: "Archive every source URL
 *    (web.archive.org) at the time of citation." The schema only checks
 *    `archiveUrl` is *an* http(s) URL (`src/schemas/entry.ts`); this checks
 *    it is actually a Wayback Machine snapshot, not e.g. the same live URL
 *    copy-pasted into both fields. Always a hard failure — it's a citation
 *    practice defect, not a reachability question.
 * 2. **Reachability, scored per *source*, not per field.** AGENTS.md: "Archive
 *    every source URL... forum threads die and take the evidence with them" —
 *    the whole point of `archiveUrl` is to survive `url` going dead. So a
 *    source only *fails* this check when **both** `url` and `archiveUrl` are
 *    unreachable; a dead original with a live archive snapshot is exactly the
 *    case the schema was designed to tolerate, and is downgraded to a
 *    warning (exit 0) rather than a build failure. Fixing it — re-citing a
 *    fresher original — is content work tracked by the gaps report's
 *    "dead source links" line (GAP-01, T703), not something `verify` should
 *    block a PR over. (T105 review, 2026-08-27: the original one-field-fails
 *    policy contradicted the very reason `archiveUrl` exists.)
 *
 * Reachability is fetched HEAD first (cheaper), falling back to GET when a
 * host rejects HEAD (`405`/`501`), with one retry on a thrown network error
 * before a side is declared unreachable — a single dropped packet should not
 * cost a citation its status. If *every* check this run performs fails with
 * the identical network-level error and none succeed, that is far more
 * likely a runner with no outbound network access than a coincidence of
 * dead links; `main()` prints a distinguishing note for that case so a red
 * `check:links` run in an offline sandbox is not mistaken for real link rot
 * (see `findUnreachableLinks`'s `offlineNotice`).
 *
 * Scope note: "internal references resolve" (AGENTS.md) is not implemented
 * here yet. Nothing in the T104 base schema creates an internal cross-entry
 * reference to validate — `fitment.{gens,engines,…}` are opaque id lists
 * against a vehicle taxonomy that does not exist as data until FIT-02/T203
 * (`src/schemas/entry.ts`'s fitment placeholder docstring), and resolving
 * them here would be exactly the kind of drive-by taxonomy assumption
 * AGENTS.md rules out for this task. When cross-entry references exist, they
 * get their own audit here, alongside this one, not instead of it.
 *
 * Usage: node scripts/check-links.mjs
 *
 * refs specs/001-foundation (SCF-02, SCF-03, GAP-01)
 */
import { CONTENT_ROOT, loadContentEntries } from "./lib/content-entries.mjs";

const ARCHIVE_HOST = "web.archive.org";
const FETCH_TIMEOUT_MS = 10_000;
const CONCURRENCY = 6;

/** `sources[]` entries are `{ title, url, archiveUrl, accessed, kind }`. */
function sourcesOf(data) {
  const sources = data && typeof data === "object" ? data.sources : undefined;
  return Array.isArray(sources) ? sources : [];
}

/** Structural check: is `url` actually a web.archive.org snapshot? */
export function isArchiveUrl(url) {
  try {
    return new URL(url).host === ARCHIVE_HOST;
  } catch {
    return false;
  }
}

/**
 * Every `{ entry, field, url }` this script could check reachability for,
 * across every entry's `sources[]` — one row per field. Used for the
 * end-of-run summary count; reachability itself is scored per-*source* by
 * {@link collectSourcePairs}, not per field (see module docstring point 2).
 */
export function collectLinkTargets(entries) {
  const targets = [];
  for (const entry of entries) {
    sourcesOf(entry.data).forEach((source, index) => {
      if (typeof source?.url === "string" && source.url !== "") {
        targets.push({
          entry,
          field: `sources[${index}].url`,
          url: source.url,
        });
      }
      if (typeof source?.archiveUrl === "string" && source.archiveUrl !== "") {
        targets.push({
          entry,
          field: `sources[${index}].archiveUrl`,
          url: source.archiveUrl,
        });
      }
    });
  }
  return targets;
}

/**
 * One `{ entry, index, url, archiveUrl }` per source, `url`/`archiveUrl`
 * `undefined` when blank/absent. The unit reachability is scored against —
 * see module docstring point 2 for why a source, not a field, is the unit.
 */
export function collectSourcePairs(entries) {
  const pairs = [];
  for (const entry of entries) {
    sourcesOf(entry.data).forEach((source, index) => {
      const url =
        typeof source?.url === "string" && source.url !== ""
          ? source.url
          : undefined;
      const archiveUrl =
        typeof source?.archiveUrl === "string" && source.archiveUrl !== ""
          ? source.archiveUrl
          : undefined;
      if (url === undefined && archiveUrl === undefined) return;
      pairs.push({ entry, index, url, archiveUrl });
    });
  }
  return pairs;
}

/**
 * Structural (no network) problems: an `archiveUrl` that is not on
 * web.archive.org.
 *
 * @returns {LinkIssue[]}
 */
export function findArchiveShapeIssues(entries) {
  const issues = [];
  for (const entry of entries) {
    sourcesOf(entry.data).forEach((source, index) => {
      if (typeof source?.archiveUrl !== "string" || source.archiveUrl === "")
        return;
      if (isArchiveUrl(source.archiveUrl)) return;
      issues.push({
        entry,
        field: `sources[${index}].archiveUrl`,
        message:
          `${entry.file}: \`sources[${index}].archiveUrl\` (${source.archiveUrl}) is not ` +
          `a ${ARCHIVE_HOST} snapshot — archive every source at citation time (AGENTS.md).`,
      });
    });
  }
  return issues;
}

/** Bounded-concurrency map, so a large source list does not open hundreds of sockets at once. */
async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    for (;;) {
      const index = next++;
      if (index >= items.length) return;
      results[index] = await fn(items[index], index);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker)
  );
  return results;
}

/** One fetch attempt. Never throws — network failures come back as `{ ok: false, error }`. */
async function attemptOnce(url, method, fetchImpl) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetchImpl(url, {
      method,
      redirect: "follow",
      signal: controller.signal,
    });
    return { ok: true, response };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timeout);
  }
}

/** One retry on a thrown network error before this method's attempt gives up. */
async function attemptWithRetry(url, method, fetchImpl) {
  const first = await attemptOnce(url, method, fetchImpl);
  if (first.ok) return first;
  return attemptOnce(url, method, fetchImpl);
}

/**
 * Fetch `url`, HEAD first (cheaper), falling back to GET when the host
 * rejects HEAD (`405`/`501`, common on forums and vendor sites) or every
 * attempt at a method throws. Each method gets one retry on a thrown network
 * error (see {@link attemptWithRetry}) before this function moves on.
 * Returns `{ ok, status?, error? }`.
 */
async function checkReachable(url, fetchImpl) {
  let lastError;
  for (const method of ["HEAD", "GET"]) {
    const attempt = await attemptWithRetry(url, method, fetchImpl);
    if (attempt.ok) {
      const { response } = attempt;
      if (response.ok || (response.status >= 200 && response.status < 400)) {
        return { ok: true, status: response.status };
      }
      if (
        method === "HEAD" &&
        (response.status === 405 || response.status === 501)
      ) {
        continue; // try GET
      }
      return { ok: false, status: response.status };
    }
    lastError = attempt.error;
    // Still failing after the retry — try GET before giving up entirely.
  }
  return { ok: false, error: lastError ?? "unreachable" };
}

/**
 * A duck-typed subset of `fetch`'s signature — just enough for
 * {@link checkReachable}. Named explicitly rather than typed as `typeof
 * fetch` so test doubles do not have to satisfy the full `Response` shape
 * (headers, `redirected`, `statusText`, …) they never use.
 *
 * @typedef {(url: string, init: { method: string, redirect: string, signal: AbortSignal }) => Promise<{ ok: boolean, status?: number }>} FetchLike
 */

/**
 * @typedef {object} LinkIssue
 * @property {{ file: string, data: unknown }} entry
 * @property {string} field
 * @property {string} message
 */

/** @typedef {LinkIssue} LinkWarning Same shape; kept as a separate name for readability at call sites. */

function describeResult(result) {
  if (!result) return "not cited";
  if (result.ok) return `reachable (HTTP ${result.status})`;
  if (result.status !== undefined) return `HTTP ${result.status}`;
  return result.error ?? "unreachable";
}

/** `"ok"` (nothing to report) | `"warning"` (one side dead) | `"issue"` (both dead) | `"skip"` (neither side cited). */
function classifyPair(urlResult, archiveResult) {
  const urlOk = urlResult ? urlResult.ok : null;
  const archiveOk = archiveResult ? archiveResult.ok : null;
  if (urlOk === null && archiveOk === null) return "skip";
  if (urlOk === null) return archiveOk ? "ok" : "issue";
  if (archiveOk === null) return urlOk ? "ok" : "issue";
  if (urlOk && archiveOk) return "ok";
  if (!urlOk && !archiveOk) return "issue";
  return "warning";
}

/** @returns {LinkIssue} */
function makeIssue(pair, urlResult, archiveResult) {
  const { entry, index } = pair;
  return {
    entry,
    field: `sources[${index}]`,
    message:
      `${entry.file}: \`sources[${index}]\` is unreachable on both sides — ` +
      `url (${pair.url ?? "not cited"}): ${describeResult(urlResult)}; ` +
      `archiveUrl (${pair.archiveUrl ?? "not cited"}): ${describeResult(archiveResult)}.`,
  };
}

/** @returns {LinkWarning} */
function makeWarning(pair, urlResult, archiveResult) {
  const urlDead = urlResult !== null && !urlResult.ok;
  const deadSide = urlDead ? "url" : "archiveUrl";
  const liveSide = urlDead ? "archiveUrl" : "url";
  const deadValue = urlDead ? pair.url : pair.archiveUrl;
  const deadResult = urlDead ? urlResult : archiveResult;
  return {
    entry: pair.entry,
    field: `sources[${pair.index}].${deadSide}`,
    message:
      `${pair.entry.file}: \`sources[${pair.index}].${deadSide}\` (${deadValue}) is ` +
      `unreachable (${describeResult(deadResult)}), but \`${liveSide}\` still resolves — ` +
      `not a build failure. Re-citing a live original is content work tracked by the ` +
      `gaps report's dead-source-links line (GAP-01, T703).`,
  };
}

/**
 * When every reachability check in this run fails with the identical
 * network-level error and none succeed, that pattern is far more consistent
 * with "this runner has no outbound network access" than with a coincidence
 * of unrelated dead links — distinguish it so a red `check:links` run in an
 * offline sandbox is not read as real link rot. Requires at least two
 * checks: one failure proves nothing about the network as a whole.
 */
function detectOfflineNotice(results) {
  if (results.some((r) => r.ok)) return null;
  const errors = results
    .filter((r) => !r.ok)
    .map((r) => r.error)
    .filter((e) => typeof e === "string");
  if (errors.length < 2 || errors.length !== results.length) return null;
  const distinct = new Set(errors);
  if (distinct.size !== 1) return null;
  return (
    `all ${errors.length} reachability check(s) in this run failed identically ` +
    `(${[...distinct][0]}) — this looks like the runner has no outbound network ` +
    `access rather than ${errors.length} genuinely dead links. Verify connectivity ` +
    `before treating this result as real link rot.`
  );
}

/**
 * Reachability audit, scored per source (module docstring point 2).
 * `fetchImpl` is injectable so tests never hit the network — production
 * default is the global `fetch` (Node 24, no dependency needed).
 *
 * @param {{ file: string, data: unknown }[]} entries
 * @param {{ fetchImpl?: FetchLike }} [options]
 * @returns {Promise<{ issues: LinkIssue[], warnings: LinkWarning[], offlineNotice: string | null }>}
 */
export async function findUnreachableLinks(entries, options = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const pairs = collectSourcePairs(entries);

  const checks = pairs.flatMap((pair) => [
    pair.url ? { pair, side: "url", target: pair.url } : null,
    pair.archiveUrl
      ? { pair, side: "archiveUrl", target: pair.archiveUrl }
      : null,
  ]);
  const performed = checks.filter((c) => c !== null);

  const results = await mapWithConcurrency(
    performed,
    CONCURRENCY,
    async (check) => ({
      ...check,
      result: await checkReachable(check.target, fetchImpl),
    })
  );

  const bySide = new Map();
  for (const { pair, side, result } of results) {
    const record = bySide.get(pair) ?? {};
    record[side] = result;
    bySide.set(pair, record);
  }

  const issues = [];
  const warnings = [];
  for (const pair of pairs) {
    const sides = bySide.get(pair) ?? {};
    const urlResult = sides.url ?? null;
    const archiveResult = sides.archiveUrl ?? null;
    const classification = classifyPair(urlResult, archiveResult);
    if (classification === "issue") {
      issues.push(makeIssue(pair, urlResult, archiveResult));
    } else if (classification === "warning") {
      warnings.push(makeWarning(pair, urlResult, archiveResult));
    }
  }

  const offlineNotice = detectOfflineNotice(results.map((r) => r.result));

  return { issues, warnings, offlineNotice };
}

/**
 * @param {{ file: string, data: unknown }[]} entries
 * @param {{ fetchImpl?: FetchLike }} [options]
 * @returns {Promise<{ issues: LinkIssue[], warnings: LinkWarning[], offlineNotice: string | null }>}
 */
export async function auditLinks(entries, options = {}) {
  const shapeIssues = findArchiveShapeIssues(entries);
  const { issues, warnings, offlineNotice } = await findUnreachableLinks(
    entries,
    options
  );
  return { issues: [...shapeIssues, ...issues], warnings, offlineNotice };
}

async function main() {
  const entries = await loadContentEntries(CONTENT_ROOT);
  const { issues, warnings, offlineNotice } = await auditLinks(entries);

  if (offlineNotice) {
    console.error(`check:links — ${offlineNotice}`);
  }

  if (warnings.length > 0) {
    console.warn(
      `check:links — ${warnings.length} warning(s) — dead original with a live archive, ` +
        `not a build failure (GAP-01/T703 tracks these):`
    );
    for (const warning of warnings) console.warn(`  • ${warning.message}`);
  }

  if (issues.length > 0) {
    console.error(`check:links — ${issues.length} problem(s):`);
    for (const problem of issues) console.error(`  • ${problem.message}`);
    process.exitCode = 1;
    return;
  }

  const targetCount = collectLinkTargets(entries).length;
  console.log(
    `check:links — OK: ${targetCount} source URL(s) across ${entries.length} entr${
      entries.length === 1 ? "y" : "ies"
    } checked, every source has at least one reachable side and every ` +
      `archiveUrl is a real web.archive.org snapshot.`
  );
}

if (
  process.argv[1] &&
  new URL(process.argv[1], "file://").pathname ===
    new URL(import.meta.url).pathname
) {
  await main();
}
