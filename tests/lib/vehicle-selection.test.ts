/**
 * The stored vehicle selection (T204, FIT-03) — parsing, persistence, and the
 * event a listing re-filters on.
 *
 * `localStorage` is reader-writable and survives deploys, so the parser is
 * where a corrupt or outdated value has to stop. Everything below the parser
 * is about the promise FIT-03 makes in four words: "across pages and locales".
 *
 * refs specs/001-foundation (FIT-03)
 */
import { JSDOM } from "jsdom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  VEHICLE_CHANGE_EVENT,
  VEHICLE_STORAGE_KEY,
  clearVehicleSelection,
  onVehicleSelectionChange,
  parseVehicleSelection,
  readVehicleSelection,
  sameVehicleSelection,
  serializeVehicleSelection,
  writeVehicleSelection,
  type StoredVehicleSelection,
} from "../../src/lib/vehicle-selection.ts";

const GITANA: StoredVehicleSelection = {
  gen: "gen3",
  market: "us",
  year: 2002,
  engine: "6g74-sohc",
};

describe("parseVehicleSelection", () => {
  it("accepts FIT-03's quadruple", () => {
    expect(parseVehicleSelection(GITANA)).toEqual(GITANA);
  });

  it("accepts the optional drive facet", () => {
    expect(parseVehicleSelection({ ...GITANA, drive: "4wd" })).toEqual({
      ...GITANA,
      drive: "4wd",
    });
  });

  it("parses the stored JSON string form", () => {
    expect(parseVehicleSelection(JSON.stringify(GITANA))).toEqual(GITANA);
  });

  it.each([
    ["no value", null],
    ["a non-object", 7],
    ["an array", [GITANA]],
    ["unparseable JSON", "{not json"],
    ["an unknown generation", { ...GITANA, gen: "gen9" }],
    ["an unknown market", { ...GITANA, market: "mars" }],
    ["an unknown drive", { ...GITANA, drive: "awd" }],
    ["a non-kebab engine id", { ...GITANA, engine: "6G74_SOHC" }],
    ["a year outside production", { ...GITANA, year: 1940 }],
    ["a non-integer year", { ...GITANA, year: 2002.5 }],
    ["a missing facet", { gen: "gen3", market: "us", year: 2002 }],
    ["an extra field", { ...GITANA, transmission: "manual-5-speed" }],
  ])("refuses %s", (_label, value) => {
    expect(parseVehicleSelection(value)).toBeNull();
  });

  it("refuses an extra field rather than dropping it", () => {
    /*
     * The strict reading matters: a stored value carrying a facet this UI
     * cannot set would filter the site in a way the reader has no control to
     * undo. Better to forget the truck than to filter by something invisible.
     */
    expect(parseVehicleSelection({ ...GITANA, trim: "limited" })).toBeNull();
  });
});

describe("serializeVehicleSelection", () => {
  it("writes a stable key order, whatever order the object was built in", () => {
    const built: StoredVehicleSelection = {
      engine: "6g74-sohc",
      year: 2002,
      market: "us",
      gen: "gen3",
      drive: "4wd",
    };
    expect(serializeVehicleSelection(built)).toBe(
      '{"gen":"gen3","market":"us","year":2002,"engine":"6g74-sohc","drive":"4wd"}'
    );
  });

  it("omits an unstated drive rather than writing null", () => {
    expect(serializeVehicleSelection(GITANA)).not.toContain("drive");
  });
});

describe("sameVehicleSelection", () => {
  it("is true for the same truck described in a different key order", () => {
    expect(
      sameVehicleSelection(GITANA, {
        engine: "6g74-sohc",
        gen: "gen3",
        market: "us",
        year: 2002,
      })
    ).toBe(true);
  });

  it("is false when one names a drive and the other does not", () => {
    expect(sameVehicleSelection(GITANA, { ...GITANA, drive: "4wd" })).toBe(
      false
    );
  });

  it("treats two absences as the same and one absence as different", () => {
    expect(sameVehicleSelection(null, null)).toBe(true);
    expect(sameVehicleSelection(null, GITANA)).toBe(false);
  });
});

describe("browser persistence", () => {
  let dom: JSDOM;
  let win: Window;

  beforeEach(() => {
    dom = new JSDOM("<!doctype html><html><body></body></html>", {
      url: "https://monterogarage.com/en/",
    });
    win = dom.window as unknown as Window;
  });

  it("round-trips a selection through storage", () => {
    writeVehicleSelection(GITANA, win);
    expect(readVehicleSelection(win)).toEqual(GITANA);
  });

  it("stores under one locale-independent key", () => {
    // The FIT-03 promise "across locales" is this and nothing else: one
    // origin-scoped key, read identically from /en/ and /es/.
    writeVehicleSelection(GITANA, win);
    expect(win.localStorage.getItem(VEHICLE_STORAGE_KEY)).toBe(
      serializeVehicleSelection(GITANA)
    );
    expect(VEHICLE_STORAGE_KEY).not.toMatch(/\b(en|es)\b/);
  });

  it("reads a corrupt stored value as no selection", () => {
    win.localStorage.setItem(VEHICLE_STORAGE_KEY, "{oops");
    expect(readVehicleSelection(win)).toBeNull();
  });

  it("refuses to store a selection the parser rejects", () => {
    const bad = { ...GITANA, gen: "gen9" } as StoredVehicleSelection;
    expect(writeVehicleSelection(bad, win)).toBeNull();
    expect(win.localStorage.getItem(VEHICLE_STORAGE_KEY)).toBeNull();
  });

  it("clears the selection", () => {
    writeVehicleSelection(GITANA, win);
    clearVehicleSelection(win);
    expect(readVehicleSelection(win)).toBeNull();
  });

  it("survives storage throwing (private mode) without throwing itself", () => {
    const broken = {
      ...win,
      localStorage: {
        getItem() {
          throw new Error("denied");
        },
        setItem() {
          throw new Error("denied");
        },
        removeItem() {
          throw new Error("denied");
        },
      },
      document: win.document,
      CustomEvent: (win as unknown as { CustomEvent: unknown }).CustomEvent,
    } as unknown as Window;

    expect(() => writeVehicleSelection(GITANA, broken)).not.toThrow();
    expect(readVehicleSelection(broken)).toBeNull();
    expect(() => clearVehicleSelection(broken)).not.toThrow();
  });
});

describe("onVehicleSelectionChange", () => {
  let dom: JSDOM;
  let win: Window;

  beforeEach(() => {
    dom = new JSDOM("<!doctype html><html><body></body></html>", {
      url: "https://monterogarage.com/en/",
    });
    win = dom.window as unknown as Window;
  });

  it("announces a write to a listener that never met the selector", () => {
    // The selector is in the site chrome and the listing is in a page
    // component: separate bundles, no shared instance. The event is the only
    // thing between them.
    const seen = vi.fn();
    onVehicleSelectionChange(win, seen);

    writeVehicleSelection(GITANA, win);

    expect(seen).toHaveBeenCalledWith(GITANA);
  });

  it("announces a clear as null", () => {
    const seen = vi.fn();
    onVehicleSelectionChange(win, seen);

    clearVehicleSelection(win);

    expect(seen).toHaveBeenCalledWith(null);
  });

  it("stops listening once unsubscribed", () => {
    const seen = vi.fn();
    const stop = onVehicleSelectionChange(win, seen);

    stop();
    writeVehicleSelection(GITANA, win);

    expect(seen).not.toHaveBeenCalled();
  });

  it("picks up a selection made in another tab", () => {
    const seen = vi.fn();
    onVehicleSelectionChange(win, seen);

    // What a real cross-tab write looks like: storage already updated, then a
    // `storage` event with the key that changed.
    win.localStorage.setItem(
      VEHICLE_STORAGE_KEY,
      serializeVehicleSelection(GITANA)
    );
    const event = new dom.window.Event("storage") as StorageEvent & {
      key: string | null;
    };
    Object.defineProperty(event, "key", { value: VEHICLE_STORAGE_KEY });
    win.dispatchEvent(event);

    expect(seen).toHaveBeenCalledWith(GITANA);
  });

  it("ignores a storage event for an unrelated key", () => {
    const seen = vi.fn();
    onVehicleSelectionChange(win, seen);

    const event = new dom.window.Event("storage");
    Object.defineProperty(event, "key", { value: "monterogarage:locale" });
    win.dispatchEvent(event);

    expect(seen).not.toHaveBeenCalled();
  });

  it("names its event once, so both sides cannot drift", () => {
    expect(VEHICLE_CHANGE_EVENT).toBe("montero:vehicle-change");
  });
});
