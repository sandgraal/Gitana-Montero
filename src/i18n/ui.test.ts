import { describe, expect, it } from "vitest";
import { LOCALES } from "./routing";
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

  it("translates prose rather than copying English through", () => {
    // Brand names are legitimately identical; sentences are not.
    const shared = Object.keys(ui.en).filter(
      (key) =>
        ui.en[key as keyof typeof ui.en] === ui.es[key as keyof typeof ui.es]
    );
    expect(shared).toEqual(["siteName"]);
  });

  it("t() returns the strings for the requested locale", () => {
    expect(t("en").navHome).toBe(ui.en.navHome);
    expect(t("es").navHome).toBe(ui.es.navHome);
  });

  it("allUi exposes every locale in a stable order for non-localized pages", () => {
    expect(allUi.map((entry) => entry.locale)).toEqual([...LOCALES]);
  });
});
