/**
 * Unit coverage for the shared inputs of the two post-build audits
 * (`scripts/lib/audit-targets.mjs`) and for the preview server's path
 * mapping (`scripts/serve-dist.mjs`).
 *
 * Both audits are otherwise only exercised end-to-end, where a wrong base
 * prefix looks like a passing run over zero pages, or — worse — like a
 * passing run over an unstyled page whose CSS 404'd. These are the two pure
 * functions where that mistake is visible.
 *
 * refs specs/001-foundation (SCF-03, SCF-06)
 */
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  auditTargets,
  builtServedPaths,
  collectionSampleTargets,
  normalizeBase,
  resolveChromePath,
} from "../scripts/lib/audit-targets.mjs";
import { resolveRequest } from "../scripts/serve-dist.mjs";

const LOCALES = ["en", "es"];

describe("normalizeBase", () => {
  it("normalises every spelling of the deploy path to one form", () => {
    expect(normalizeBase("/Gitana-Montero")).toBe("/Gitana-Montero");
    expect(normalizeBase("/Gitana-Montero/")).toBe("/Gitana-Montero");
    expect(normalizeBase("Gitana-Montero")).toBe("/Gitana-Montero");
  });

  it("treats a root deploy as no prefix at all", () => {
    expect(normalizeBase("/")).toBe("");
    expect(normalizeBase("")).toBe("");
    expect(normalizeBase(undefined)).toBe("");
  });
});

describe("auditTargets", () => {
  it("audits both locales' home pages, neither privileged (I18N-01)", () => {
    const { a11y, lighthouse } = auditTargets({
      base: "/Gitana-Montero",
      locales: LOCALES,
    });

    for (const locale of LOCALES) {
      expect(lighthouse).toContain(`/Gitana-Montero/${locale}/`);
      expect(a11y).toContain(`/Gitana-Montero/${locale}/`);
    }
  });

  it("sweeps the 404 for a11y but keeps it out of the score budget", () => {
    const { a11y, lighthouse } = auditTargets({
      base: "/Gitana-Montero",
      locales: LOCALES,
    });

    expect(a11y).toContain("/Gitana-Montero/404.html");
    expect(lighthouse).not.toContain("/Gitana-Montero/404.html");
  });

  it("never audits the root redirect shim, which redirects on load", () => {
    const { a11y, lighthouse } = auditTargets({
      base: "/Gitana-Montero",
      locales: LOCALES,
    });

    expect(a11y).not.toContain("/Gitana-Montero/");
    expect(lighthouse).not.toContain("/Gitana-Montero/");
  });

  it("follows the deploy path when the site moves to a domain root", () => {
    const { lighthouse } = auditTargets({ base: "/", locales: LOCALES });
    expect(lighthouse).toEqual(["/en/", "/es/"]);
  });

  // SCF-06's "one representative content page per collection". The audits
  // pass `builtPaths` from `dist/`; if that plumbing is ever cut, the two
  // assertions below are what notice — a reviewer reading the docstring
  // cannot tell a wired-up helper from an exported-but-unused one.
  it("adds a representative content page per collection when one is built", () => {
    const builtPaths = [
      "/Gitana-Montero/",
      "/Gitana-Montero/404.html",
      "/Gitana-Montero/en/",
      "/Gitana-Montero/en/problems/transfer-case-wont-engage/",
      "/Gitana-Montero/en/problems/rear-diff-whine/",
      "/Gitana-Montero/es/",
      "/Gitana-Montero/es/problemas/transferencia-no-engrana/",
    ];

    const { a11y, lighthouse } = auditTargets({
      base: "/Gitana-Montero",
      locales: LOCALES,
      builtPaths,
    });

    for (const targets of [a11y, lighthouse]) {
      // One per locale+collection, not one per page.
      expect(targets).toContain("/Gitana-Montero/en/problems/rear-diff-whine/");
      expect(targets).not.toContain(
        "/Gitana-Montero/en/problems/transfer-case-wont-engage/"
      );
      expect(targets).toContain(
        "/Gitana-Montero/es/problemas/transferencia-no-engrana/"
      );
      // The homes never drop out when samples appear.
      expect(targets).toContain("/Gitana-Montero/en/");
      expect(targets).toContain("/Gitana-Montero/es/");
    }
  });

  it("audits only the homes (+404) when nothing else was built", () => {
    const { a11y, lighthouse } = auditTargets({
      base: "/Gitana-Montero",
      locales: LOCALES,
      builtPaths: [
        "/Gitana-Montero/",
        "/Gitana-Montero/404.html",
        "/Gitana-Montero/en/",
        "/Gitana-Montero/es/",
      ],
    });

    expect(lighthouse).toEqual(["/Gitana-Montero/en/", "/Gitana-Montero/es/"]);
    expect(a11y).toEqual([
      "/Gitana-Montero/en/",
      "/Gitana-Montero/es/",
      "/Gitana-Montero/404.html",
    ]);
  });
});

describe("builtServedPaths", () => {
  let distDir: string;

  beforeAll(async () => {
    distDir = await mkdtemp(path.join(os.tmpdir(), "gitana-dist-"));
    const pages = [
      "index.html",
      "404.html",
      "en/index.html",
      "es/index.html",
      "en/problems/transfer-case-wont-engage/index.html",
      "es/problemas/transferencia-no-engrana/index.html",
    ];
    for (const page of pages) {
      const file = path.join(distDir, page);
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, '<!doctype html><html lang="en"></html>');
    }
    // Assets must not be mistaken for pages.
    await mkdir(path.join(distDir, "_astro"), { recursive: true });
    await writeFile(path.join(distDir, "_astro", "site.css"), "body{}");
  });

  afterAll(async () => {
    await rm(distDir, { recursive: true, force: true });
  });

  it("maps built files to the paths they are served at, under base", async () => {
    const served = await builtServedPaths({
      distDir,
      base: "/Gitana-Montero",
    });

    expect(served).toEqual([
      "/Gitana-Montero/",
      "/Gitana-Montero/404.html",
      "/Gitana-Montero/en/",
      "/Gitana-Montero/en/problems/transfer-case-wont-engage/",
      "/Gitana-Montero/es/",
      "/Gitana-Montero/es/problemas/transferencia-no-engrana/",
    ]);
  });

  it("feeds a real dist into the audit target set, end to end", async () => {
    const builtPaths = await builtServedPaths({
      distDir,
      base: "/Gitana-Montero",
    });
    const { a11y, lighthouse } = auditTargets({
      base: "/Gitana-Montero",
      locales: LOCALES,
      builtPaths,
    });

    expect(lighthouse).toEqual([
      "/Gitana-Montero/en/",
      "/Gitana-Montero/es/",
      "/Gitana-Montero/en/problems/transfer-case-wont-engage/",
      "/Gitana-Montero/es/problemas/transferencia-no-engrana/",
    ]);
    expect(a11y).toContain("/Gitana-Montero/404.html");
    expect(a11y).toContain(
      "/Gitana-Montero/es/problemas/transferencia-no-engrana/"
    );
  });

  it("returns nothing rather than throwing when dist is absent", async () => {
    expect(
      await builtServedPaths({
        distDir: path.join(distDir, "no-such-dir"),
        base: "/Gitana-Montero",
      })
    ).toEqual([]);
  });
});

describe("collectionSampleTargets", () => {
  const config = { base: "/Gitana-Montero", locales: LOCALES };

  it("returns nothing while every collection is empty", () => {
    expect(
      collectionSampleTargets(
        ["/Gitana-Montero/en/", "/Gitana-Montero/es/"],
        config
      )
    ).toEqual([]);
  });

  it("samples one page per collection per locale (SCF-06)", () => {
    // Deliberately unsorted, and `rear-diff-whine` sorts before
    // `transfer-case-wont-engage`: the sample is the first page in *path*
    // order, not in whatever order the directory walk returned, or a budget
    // regression on a stable site would look like a flake.
    const built = [
      "/Gitana-Montero/en/",
      "/Gitana-Montero/en/problems/transfer-case-wont-engage/",
      "/Gitana-Montero/en/problems/rear-diff-whine/",
      "/Gitana-Montero/en/parts/front-brake-pads/",
      "/Gitana-Montero/es/problemas/transferencia-no-engrana/",
    ];

    expect(collectionSampleTargets(built, config)).toEqual([
      "/Gitana-Montero/en/parts/front-brake-pads/",
      "/Gitana-Montero/en/problems/rear-diff-whine/",
      "/Gitana-Montero/es/problemas/transferencia-no-engrana/",
    ]);
  });

  it("ignores paths that are not under a known locale", () => {
    expect(
      collectionSampleTargets(["/Gitana-Montero/fr/problems/whatever/"], config)
    ).toEqual([]);
  });
});

describe("resolveChromePath", () => {
  it("names the variable that pointed at a missing browser", () => {
    expect(() =>
      resolveChromePath({ CHROME_PATH: "/nowhere/google-chrome" })
    ).toThrow(/CHROME_PATH/);
  });
});

describe("serve-dist resolveRequest", () => {
  const distDir = path.resolve("/tmp/does-not-need-to-exist/dist");
  const config = { distDir, base: "/Gitana-Montero" };

  it("refuses anything outside the deploy base", () => {
    // Serving dist at the server root is the mistake that silently drops
    // every `/Gitana-Montero/_astro/…` asset and audits an unstyled page.
    const resolved = resolveRequest("/en/", config);
    expect(resolved.file).toBeNull();
    expect(resolved.reason).toMatch(/outside base/);
  });

  it("sends the bare base to its trailing-slash form", () => {
    expect(resolveRequest("/Gitana-Montero", config).redirect).toBe(
      "/Gitana-Montero/"
    );
  });

  it("refuses to escape dist via traversal", () => {
    const resolved = resolveRequest(
      "/Gitana-Montero/../../../../etc/passwd",
      config
    );
    expect(resolved.file).toBeNull();
    expect(resolved.reason).toBe("path traversal");
  });

  it("refuses an undecodable path instead of throwing", () => {
    const resolved = resolveRequest("/Gitana-Montero/%E0%A4%A", config);
    expect(resolved.file).toBeNull();
    expect(resolved.reason).toBe("undecodable path");
  });
});
