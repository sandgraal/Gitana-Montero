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
 *    copy-pasted into both fields.
 * 2. **Reachability.** `url` and `archiveUrl` are fetched (HEAD, falling back
 *    to GET when a host rejects HEAD) and a non-2xx/3xx status or network
 *    error fails the check, naming the entry, field, and URL.
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
 * refs specs/001-foundation (SCF-02, SCF-03)
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
 * Every `{ entry, field, url }` this script should check reachability for,
 * across every entry's `sources[]`.
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

/** Structural (no network) problems: an `archiveUrl` that is not on web.archive.org. */
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

/**
 * Fetch `url`, HEAD first (cheaper), retrying with GET when the host
 * rejects HEAD (`405`/`501`, common on forums and vendor sites) or the
 * fetcher throws for a reason other than an HTTP status. Returns
 * `{ ok, status?, error? }`.
 */
async function checkReachable(url, fetchImpl) {
  for (const method of ["HEAD", "GET"]) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const response = await fetchImpl(url, {
        method,
        redirect: "follow",
        signal: controller.signal,
      });
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
    } catch (error) {
      if (method === "HEAD") continue; // try GET before giving up
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      };
    } finally {
      clearTimeout(timeout);
    }
  }
  return { ok: false, error: "unreachable" };
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
 * Reachability audit. `fetchImpl` is injectable so tests never hit the
 * network — production default is the global `fetch` (Node 24, no
 * dependency needed).
 *
 * @param {{ file: string, data: unknown }[]} entries
 * @param {{ fetchImpl?: FetchLike }} [options]
 */
export async function findUnreachableLinks(entries, options = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const targets = collectLinkTargets(entries);
  const results = await mapWithConcurrency(
    targets,
    CONCURRENCY,
    async (target) => {
      const result = await checkReachable(target.url, fetchImpl);
      return { target, result };
    }
  );

  return results
    .filter(({ result }) => !result.ok)
    .map(({ target, result }) => ({
      entry: target.entry,
      field: target.field,
      url: target.url,
      message:
        `${target.entry.file}: \`${target.field}\` (${target.url}) is not reachable` +
        (result.status
          ? ` (HTTP ${result.status})`
          : result.error
            ? ` (${result.error})`
            : "") +
        ".",
    }));
}

export async function auditLinks(entries, options = {}) {
  const shapeIssues = findArchiveShapeIssues(entries);
  const unreachable = await findUnreachableLinks(entries, options);
  return [...shapeIssues, ...unreachable];
}

async function main() {
  const entries = await loadContentEntries(CONTENT_ROOT);
  const problems = await auditLinks(entries);

  if (problems.length > 0) {
    console.error(`check:links — ${problems.length} problem(s):`);
    for (const problem of problems) console.error(`  • ${problem.message}`);
    process.exitCode = 1;
    return;
  }

  const targetCount = collectLinkTargets(entries).length;
  console.log(
    `check:links — OK: ${targetCount} source URL(s) across ${entries.length} entr${
      entries.length === 1 ? "y" : "ies"
    } checked, all reachable and archived.`
  );
}

if (
  process.argv[1] &&
  new URL(process.argv[1], "file://").pathname ===
    new URL(import.meta.url).pathname
) {
  await main();
}
