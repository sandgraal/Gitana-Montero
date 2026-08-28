import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { LOCALES } from "./routing";
import { SITE_NAME, TRUCK_YEAR } from "../site";
import { allUi, t, ui } from "./ui";

describe("UI strings module (I18N-08)", () => {
  it("covers every locale", () => {
    expect(Object.keys(ui).sort()).toEqual([...LOCALES].sort());
  });

  it("has identical key sets in both locales — no string ships in one language", () => {
    const en = Object.keys(ui.en).sort();
    const es = Object.keys(ui.es).sort();
    expect(es).toEqual(en);
  });

  it("has no empty or placeholder values", () => {
    for (const locale of LOCALES) {
      for (const [key, value] of Object.entries(ui[locale])) {
        expect(typeof value, `${locale}.${key}`).toBe("string");
        expect(value.trim(), `${locale}.${key}`).not.toBe("");
        expect(value, `${locale}.${key}`).not.toMatch(/^(TODO|TBD|FIXME)/i);
      }
    }
  });

  it("uses the usted register in ES, never tú or vos (AGENTS.md)", () => {
    const forbidden = /\b(t[úu]|vos|vosotros|tuyo|tuya|contigo)\b/i;
    for (const [key, value] of Object.entries(ui.es)) {
      expect(value, `es.${key}`).not.toMatch(forbidden);
    }
  });

  it("translates every string — nothing is copied through untranslated", () => {
    // Locale-independent values (the site name, URLs, figures) live in
    // src/site.ts, so no key here may be byte-identical across locales.
    const shared = Object.keys(ui.en).filter(
      (key) =>
        ui.en[key as keyof typeof ui.en] === ui.es[key as keyof typeof ui.es]
    );
    expect(shared).toEqual([]);
  });

  it("stores no figure per locale — numbers are interpolated, not retyped", () => {
    // AGENTS.md: "if you find yourself writing the same figure twice, the
    // schema is wrong". The truck's model year comes from src/site.ts.
    expect(ui.en.homeIntro).toContain(String(TRUCK_YEAR));
    expect(ui.es.homeIntro).toContain(String(TRUCK_YEAR));

    const source = readFileSync(new URL("./ui.ts", import.meta.url), "utf8");
    expect(source).not.toContain(String(TRUCK_YEAR));
  });

  it("keeps the site name out of the per-locale records", () => {
    for (const locale of LOCALES) {
      expect(Object.keys(ui[locale])).not.toContain("siteName");
      expect(Object.values(ui[locale])).not.toContain(SITE_NAME);
    }
  });

  it("t() returns the strings for the requested locale", () => {
    expect(t("en").navHome).toBe(ui.en.navHome);
    expect(t("es").navHome).toBe(ui.es.navHome);
  });

  it("allUi exposes every locale in a stable order for non-localized pages", () => {
    expect(allUi.map((entry) => entry.locale)).toEqual([...LOCALES]);
  });
});
