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
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  auditTargets,
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
    const built = [
      "/Gitana-Montero/en/",
      "/Gitana-Montero/en/problems/transfer-case-wont-engage/",
      "/Gitana-Montero/en/problems/rear-diff-whine/",
      "/Gitana-Montero/en/parts/front-brake-pads/",
      "/Gitana-Montero/es/problemas/transferencia-no-engrana/",
    ];

    expect(collectionSampleTargets(built, config)).toEqual([
      "/Gitana-Montero/en/parts/front-brake-pads/",
      "/Gitana-Montero/en/problems/transfer-case-wont-engage/",
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
