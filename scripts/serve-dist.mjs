/**
 * A static server for `dist/`, mounted at the site's `base`.
 *
 * The a11y sweep (`scripts/check-a11y.mjs`) and the Lighthouse budgets
 * (`scripts/check-lighthouse.mjs`) both need the *built* site over HTTP, on
 * the same path prefix GitHub Pages serves it from. Serving `dist/` at the
 * server root instead would 404 every asset — the build writes absolute URLs
 * under `base` (`/Gitana-Montero/_astro/…`), so a root-mounted preview
 * silently strips the CSS and audits an unstyled page: colour-contrast checks
 * pass on a page nobody will ever see, and the performance numbers describe a
 * document that is not the artifact.
 *
 * `astro preview` would also mount at `base`, but it is a dev-tool dependency
 * with its own port negotiation and readiness output. This is ~100 lines with
 * no negotiation: bind port 0, report the port that was actually assigned,
 * and expose `close()`. That matters because both audits run in the same CI
 * job and a fixed port is a flake waiting for a busy runner.
 *
 * Usage:
 *   node scripts/serve-dist.mjs [--port 4321] [--dist dist]
 *
 * refs specs/001-foundation (SCF-03, SCF-06)
 */
import { createReadStream, existsSync, statSync } from "node:fs";
import http from "node:http";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  REPO_ROOT,
  normalizeBase,
  readSiteConfig,
} from "./lib/audit-targets.mjs";

const MIME_TYPES = new Map(
  Object.entries({
    ".css": "text/css; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".ico": "image/x-icon",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".map": "application/json; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".png": "image/png",
    ".svg": "image/svg+xml",
    ".txt": "text/plain; charset=utf-8",
    ".webp": "image/webp",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
    ".xml": "application/xml; charset=utf-8",
  })
);

/**
 * Map a requested URL path to a file inside `distDir`, or to a reason it
 * cannot be served. Pure, so `tests/audit-targets.test.ts` can grade the base
 * handling and the traversal guard without opening a socket.
 *
 * @returns {{ file: string|null, redirect?: string, reason?: string }}
 */
export function resolveRequest(urlPath, { distDir, base }) {
  const prefix = normalizeBase(base);

  let decoded;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return { file: null, reason: "undecodable path" };
  }

  let rest = decoded;
  if (prefix !== "") {
    if (rest === prefix) return { file: null, redirect: `${prefix}/` };
    if (!rest.startsWith(`${prefix}/`)) {
      return { file: null, reason: `outside base ${prefix}/` };
    }
    rest = rest.slice(prefix.length);
  }

  const relative = rest.replace(/^\/+/, "");
  // Resolve first, then prove containment: `..` segments and absolute-looking
  // inputs are both handled by the same check rather than by pattern-matching.
  const candidate = path.resolve(distDir, relative);
  const root = path.resolve(distDir);
  if (candidate !== root && !candidate.startsWith(root + path.sep)) {
    return { file: null, reason: "path traversal" };
  }

  if (existsSync(candidate) && statSync(candidate).isDirectory()) {
    if (!decoded.endsWith("/")) return { file: null, redirect: `${decoded}/` };
    const index = path.join(candidate, "index.html");
    return existsSync(index)
      ? { file: index }
      : { file: null, reason: "directory has no index.html" };
  }

  if (existsSync(candidate)) return { file: candidate };
  return { file: null, reason: "not found" };
}

/**
 * Start the server. Pass `port: 0` (the default) to let the OS pick a free
 * one; the resolved port is on the returned handle.
 *
 * @returns {Promise<{ origin: string, port: number, close: () => Promise<void> }>}
 */
export async function startServer({
  distDir = path.join(REPO_ROOT, "dist"),
  base = "/",
  port = 0,
  host = "127.0.0.1",
} = {}) {
  const notFoundPage = path.join(distDir, "404.html");

  const server = http.createServer((request, response) => {
    const requested = new URL(request.url ?? "/", "http://localhost");
    const resolved = resolveRequest(requested.pathname, { distDir, base });

    if (resolved.redirect) {
      response.writeHead(301, { location: resolved.redirect });
      response.end();
      return;
    }

    if (resolved.file === null) {
      // The built 404 page, with the status a real visitor would get. The
      // audits request `/404.html` directly, which takes the branch above and
      // returns 200 — a tool that refuses to score a 404 response still sees
      // the page.
      if (existsSync(notFoundPage)) {
        response.writeHead(404, { "content-type": "text/html; charset=utf-8" });
        createReadStream(notFoundPage).pipe(response);
        return;
      }
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      response.end(`404 — ${resolved.reason ?? "not found"}\n`);
      return;
    }

    response.writeHead(200, {
      "content-type":
        MIME_TYPES.get(path.extname(resolved.file).toLowerCase()) ??
        "application/octet-stream",
      "cache-control": "no-store",
    });
    createReadStream(resolved.file).pipe(response);
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, resolve);
  });

  const address = server.address();
  const actualPort =
    typeof address === "object" && address ? address.port : port;

  return {
    origin: `http://${host}:${actualPort}`,
    port: actualPort,
    close: () =>
      new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve()))
      ),
  };
}

async function main() {
  const argv = process.argv.slice(2);
  const readFlag = (name) => {
    const index = argv.indexOf(`--${name}`);
    return index === -1 ? null : argv[index + 1];
  };

  const { base } = await readSiteConfig();
  const distDir = path.resolve(REPO_ROOT, readFlag("dist") ?? "dist");
  if (!existsSync(distDir)) {
    console.error(
      `serve-dist — ${distDir} does not exist; run \`astro build\` first.`
    );
    process.exitCode = 1;
    return;
  }

  const port = Number(readFlag("port") ?? 0);
  const { origin } = await startServer({ distDir, base, port });
  console.log(`serve-dist — listening on ${origin}${normalizeBase(base)}/`);
}

if (
  process.argv[1] &&
  pathToFileURL(process.argv[1]).href === import.meta.url
) {
  await main();
}
