/**
 * hreflang audit of the built site (I18N-04).
 *
 * Runs against `dist/` after `astro build` and fails the build when any page's
 * alternate-language set is missing, incomplete, or asymmetric. "Asymmetric"
 * is the failure this exists to catch: `/en/x` pointing at `/es/x` while
 * `/es/x` points somewhere else (or nowhere) is invisible in review and
 * silently wrong to a search engine.
 *
 * Every expectation is derived from `astro.config.mjs` — `site`, `base` and
 * `i18n.locales` — so adding a locale or moving the deploy path cannot leave a
 * stale copy of the rules behind.
 *
 * Usage: node scripts/check-hreflang.mjs [distDir]
 */

import { readFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);

/**
 * Pages that are intentionally not part of the localized page set, with the
 * reason. Anything else without hreflang links is a bug, not a decision.
 */
export const EXEMPT_PAGES = new Map([
  ["index.html", "root redirect shim: negotiates a locale, has no content"],
  ["404.html", "error page: rendered in every locale at once, not localized"],
]);

const LINK_TAG = /<link\b[^>]*>/gi;

function readAttribute(tag, name) {
  const match = new RegExp(`\\b${name}\\s*=\\s*"([^"]*)"`, "i").exec(tag);
  return match ? match[1] : null;
}

/** All `<link rel="alternate" hreflang=…>` entries in a page. */
export function parseAlternates(html) {
  const alternates = [];
  for (const [tag] of html.matchAll(LINK_TAG)) {
    const rel = (readAttribute(tag, "rel") ?? "").toLowerCase();
    if (rel !== "alternate") continue;
    const hreflang = readAttribute(tag, "hreflang");
    const href = readAttribute(tag, "href");
    if (hreflang === null || href === null) continue;
    alternates.push({ hreflang, href });
  }
  return alternates;
}

export function parseCanonical(html) {
  for (const [tag] of html.matchAll(LINK_TAG)) {
    if ((readAttribute(tag, "rel") ?? "").toLowerCase() !== "canonical")
      continue;
    return readAttribute(tag, "href");
  }
  return null;
}

export function parseHtmlLang(html) {
  const match = /<html\b[^>]*\blang\s*=\s*"([^"]*)"/i.exec(html);
  return match ? match[1] : null;
}

function normalizeBase(base) {
  const trimmed = String(base ?? "")
    .trim()
    .replace(/\/+$/, "");
  if (trimmed === "") return "";
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

/** Turn an href (absolute or root-relative) into a served path. */
function hrefToServedPath(href, site) {
  if (/^https?:\/\//i.test(href)) {
    if (site && !href.startsWith(new URL("/", site).href.replace(/\/$/, ""))) {
      return { path: null, reason: `href is on another origin: ${href}` };
    }
    return { path: new URL(href).pathname, reason: null };
  }
  if (!href.startsWith("/")) {
    return {
      path: null,
      reason: `href is not root-relative or absolute: ${href}`,
    };
  }
  return { path: href, reason: null };
}

/** Map a served path back to the file `astro build` wrote. */
function servedPathToFile(servedPath, distDir, base) {
  const prefix = normalizeBase(base);
  let rest = servedPath;
  if (prefix !== "") {
    if (rest === prefix) rest = "/";
    else if (rest.startsWith(`${prefix}/`)) rest = rest.slice(prefix.length);
    else return null;
  }
  const relative = rest.replace(/^\/+/, "");
  if (relative === "" || relative.endsWith("/")) {
    return path.join(distDir, relative, "index.html");
  }
  if (relative.endsWith(".html")) return path.join(distDir, relative);
  return path.join(distDir, `${relative}.html`);
}

/** The served path for a built file, i.e. the inverse of the above. */
function fileToServedPath(relativeFile, base) {
  const prefix = normalizeBase(base);
  const withoutIndex = relativeFile.replace(/(^|\/)index\.html$/, "$1");
  return `${prefix}/${withoutIndex}`;
}

async function collectHtmlFiles(dir, root = dir) {
  const found = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...(await collectHtmlFiles(full, root)));
    } else if (entry.isFile() && entry.name.endsWith(".html")) {
      found.push(path.relative(root, full).split(path.sep).join("/"));
    }
  }
  return found.sort();
}

function localeOfServedPath(servedPath, base, locales) {
  const prefix = normalizeBase(base);
  let rest = servedPath;
  if (prefix !== "" && rest.startsWith(prefix))
    rest = rest.slice(prefix.length);
  const segment = rest.split("/")[1] ?? "";
  return locales.includes(segment) ? segment : null;
}

function alternateKey(alternates) {
  return alternates
    .map(({ hreflang, href }) => `${hreflang}=${href}`)
    .sort()
    .join(" | ");
}

/**
 * Audit a built site. Returns a list of human-readable problems; empty means
 * every page satisfies I18N-04.
 */
export async function auditDist({ distDir, base, site, locales }) {
  const problems = [];

  // A hard failure, not a warning: I18N-04 says the check SHALL fail. Without
  // `site` every href degrades to root-relative, the "hrefs must be absolute"
  // arm below disarms itself, and the audit would pass green while shipping
  // hreflang that search engines ignore.
  if (!site) {
    problems.push(
      "astro.config.mjs has no `site`, so hreflang and canonical hrefs cannot " +
        "be absolute. Search engines require absolute hreflang URLs — set `site`."
    );
  }

  if (!existsSync(distDir)) {
    problems.push(
      `dist directory not found: ${distDir} — run \`astro build\` first.`
    );
    return problems;
  }

  const files = await collectHtmlFiles(distDir);
  if (files.length === 0) {
    problems.push(`no HTML files found in ${distDir}.`);
    return problems;
  }

  const pages = new Map();
  for (const file of files) {
    const html = await readFile(path.join(distDir, file), "utf8");
    pages.set(file, {
      html,
      servedPath: fileToServedPath(file, base),
      alternates: parseAlternates(html),
    });
  }

  const seenLocales = new Set();

  for (const [file, page] of pages) {
    const where = `dist/${file}`;
    const exemptReason = EXEMPT_PAGES.get(file);

    if (parseHtmlLang(page.html) === null) {
      problems.push(`${where}: <html> has no lang attribute.`);
    }

    if (exemptReason) {
      if (page.alternates.length > 0) {
        problems.push(
          `${where}: exempt from hreflang (${exemptReason}) but emits ${page.alternates.length} alternate link(s). ` +
            `Either remove them or remove the page from EXEMPT_PAGES.`
        );
      }
      continue;
    }

    const locale = localeOfServedPath(page.servedPath, base, locales);
    if (locale === null) {
      problems.push(
        `${where}: served at ${page.servedPath}, which is under no locale prefix ` +
          `(expected one of ${locales.map((l) => `/${l}/`).join(", ")}). ` +
          `Every page is localized unless it is listed in EXEMPT_PAGES with a reason.`
      );
      continue;
    }
    seenLocales.add(locale);

    if (page.alternates.length === 0) {
      problems.push(
        `${where}: no hreflang links (I18N-04 requires one per locale plus x-default).`
      );
      continue;
    }

    // Resolve every href, and index the alternates by the locale they target.
    const byLocale = new Map();
    let xDefault = null;
    for (const alternate of page.alternates) {
      const resolved = hrefToServedPath(alternate.href, site);
      if (resolved.path === null) {
        problems.push(
          `${where}: hreflang="${alternate.hreflang}" ${resolved.reason}`
        );
        continue;
      }
      if (site && !/^https?:\/\//i.test(alternate.href)) {
        problems.push(
          `${where}: hreflang="${alternate.hreflang}" href is relative (${alternate.href}); ` +
            `\`site\` is configured, so hreflang hrefs must be absolute.`
        );
      }
      const targetFile = servedPathToFile(resolved.path, distDir, base);
      if (targetFile === null || !existsSync(targetFile)) {
        problems.push(
          `${where}: hreflang="${alternate.hreflang}" points at ${alternate.href}, which was not built.`
        );
        continue;
      }
      if (alternate.hreflang.toLowerCase() === "x-default") {
        if (xDefault !== null)
          problems.push(`${where}: more than one x-default link.`);
        xDefault = resolved.path;
        continue;
      }
      const targetLocale = localeOfServedPath(resolved.path, base, locales);
      if (targetLocale === null) {
        problems.push(
          `${where}: hreflang="${alternate.hreflang}" points at ${alternate.href}, ` +
            `which is not under a locale prefix.`
        );
        continue;
      }
      // The label and the destination have to agree: `hreflang="en"` pointing
      // at `/es/` is the classic swapped-pair mistake and is invisible in dist.
      const declared = alternate.hreflang.split("-")[0].toLowerCase();
      if (declared !== targetLocale) {
        problems.push(
          `${where}: declares hreflang="${alternate.hreflang}" but points at the ` +
            `"${targetLocale}" locale (${alternate.href}).`
        );
      }
      if (byLocale.has(targetLocale)) {
        problems.push(
          `${where}: two alternates target the "${targetLocale}" locale.`
        );
      }
      byLocale.set(targetLocale, resolved.path);
    }

    for (const expected of locales) {
      if (!byLocale.has(expected)) {
        problems.push(
          `${where}: missing hreflang alternate for the "${expected}" locale.`
        );
      }
    }

    if (xDefault === null) {
      problems.push(`${where}: missing the x-default hreflang link.`);
    } else if (![...byLocale.values()].includes(xDefault)) {
      problems.push(
        `${where}: x-default points at ${xDefault}, which is not one of this page's locale alternates.`
      );
    }

    // Self-reference: a page must list itself among its own alternates.
    const self = byLocale.get(locale);
    if (self !== undefined && self !== page.servedPath) {
      problems.push(
        `${where}: the "${locale}" alternate is ${self}, but this page is served at ${page.servedPath} ` +
          `(hreflang sets must be self-referencing).`
      );
    }

    // Symmetry: every counterpart must publish the identical alternate set.
    const key = alternateKey(page.alternates);
    for (const [targetLocale, targetPath] of byLocale) {
      if (targetLocale === locale) continue;
      const targetFile = servedPathToFile(targetPath, distDir, base);
      const target = targetFile
        ? pages.get(
            path.relative(distDir, targetFile).split(path.sep).join("/")
          )
        : undefined;
      if (!target) continue; // already reported as not built
      if (alternateKey(target.alternates) !== key) {
        problems.push(
          `${where}: asymmetric hreflang. This page declares [${key}] but its "${targetLocale}" ` +
            `counterpart ${targetPath} declares [${alternateKey(target.alternates)}].`
        );
      }
    }

    // A self-referencing canonical keeps the pair unambiguous for crawlers.
    const canonical = parseCanonical(page.html);
    if (canonical === null) {
      problems.push(`${where}: no canonical link.`);
    } else {
      const resolvedCanonical = hrefToServedPath(canonical, site);
      if (resolvedCanonical.path !== page.servedPath) {
        problems.push(
          `${where}: canonical is ${canonical}, which is not this page (${page.servedPath}).`
        );
      }
    }
  }

  for (const locale of locales) {
    if (!seenLocales.has(locale)) {
      problems.push(
        `no pages were built for the "${locale}" locale — the site must ship both locales or neither.`
      );
    }
  }

  return problems;
}

/** Read `site`, `base` and `i18n.locales` from the Astro config. */
export async function readAstroConfig(
  configPath = path.join(REPO_ROOT, "astro.config.mjs")
) {
  const module = await import(pathToFileURL(configPath).href);
  const config = module.default ?? {};
  return {
    site: config.site ?? null,
    base: config.base ?? "/",
    locales: (config.i18n?.locales ?? []).map((locale) =>
      typeof locale === "string" ? locale : locale.path
    ),
  };
}

async function main() {
  const { site, base, locales } = await readAstroConfig();
  if (locales.length === 0) {
    console.error(
      "check:hreflang — astro.config.mjs declares no i18n locales."
    );
    process.exitCode = 1;
    return;
  }
  // A missing `site` is reported by auditDist as a failure, not here as a
  // warning — one place decides, so the unit tests cover the real behaviour.
  const distDir = path.resolve(REPO_ROOT, process.argv[2] ?? "dist");
  const problems = await auditDist({ distDir, base, site, locales });

  if (problems.length > 0) {
    console.error(`check:hreflang — ${problems.length} problem(s):`);
    for (const problem of problems) console.error(`  • ${problem}`);
    process.exitCode = 1;
    return;
  }
  console.log(
    `check:hreflang — OK: every localized page in ${path.relative(REPO_ROOT, distDir)} ` +
      `has a symmetric ${locales.join("/")} pair plus x-default.`
  );
}

if (
  process.argv[1] &&
  pathToFileURL(process.argv[1]).href === import.meta.url
) {
  await main();
}
