import { describe, expect, it } from "vitest";
import { LINK_KINDS } from "../schemas/community";
import {
  LINK_KIND_BRAND_NAMES,
  TRANSLATABLE_LINK_KINDS,
} from "./community-brand-names";

describe("LINK_KIND_BRAND_NAMES", () => {
  it("only names real LINK_KINDS values", () => {
    for (const kind of Object.keys(LINK_KIND_BRAND_NAMES)) {
      expect(LINK_KINDS as readonly string[]).toContain(kind);
    }
  });

  it("names a non-empty proper noun for every entry", () => {
    for (const [kind, name] of Object.entries(LINK_KIND_BRAND_NAMES)) {
      expect(name.trim(), kind).not.toBe("");
    }
  });

  it("and TRANSLATABLE_LINK_KINDS partition LINK_KINDS exactly, with no overlap", () => {
    const brand: string[] = Object.keys(LINK_KIND_BRAND_NAMES).sort();
    const translatable: string[] = [...TRANSLATABLE_LINK_KINDS].sort();
    expect([...brand, ...translatable].sort()).toEqual([...LINK_KINDS].sort());
    expect(brand.filter((kind) => translatable.includes(kind))).toEqual([]);
  });

  it("leaves the translatable kinds (website, forum, map) out", () => {
    expect(TRANSLATABLE_LINK_KINDS).toEqual(["website", "forum", "map"]);
    for (const kind of TRANSLATABLE_LINK_KINDS) {
      expect(Object.hasOwn(LINK_KIND_BRAND_NAMES, kind)).toBe(false);
    }
  });
});
