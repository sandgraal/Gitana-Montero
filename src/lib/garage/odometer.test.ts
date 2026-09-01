import { describe, expect, it } from "vitest";
import {
  KM_PER_MILE,
  MAX_ODOMETER_KM,
  ODOMETER_UNITS,
  formatOdometer,
  isOdometerUnit,
  odometerInUnit,
  odometerToKm,
  parseOdometer,
  readOdometerUnit,
  writeOdometerUnit,
} from "./odometer.ts";

/** A `Window`-shaped stub with a real, in-memory `localStorage`. */
function fakeWindow(seed: Record<string, string> = {}): Window {
  const store = new Map(Object.entries(seed));
  return {
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
    },
  } as unknown as Window;
}

/** A `Window` whose storage throws, as in private mode. */
function hostileWindow(): Window {
  return {
    get localStorage(): Storage {
      throw new Error("storage is blocked");
    },
  } as unknown as Window;
}

describe("odometer units", () => {
  it("knows exactly two units and rejects anything else", () => {
    expect([...ODOMETER_UNITS]).toEqual(["km", "mi"]);
    expect(isOdometerUnit("km")).toBe(true);
    expect(isOdometerUnit("mi")).toBe(true);
    expect(isOdometerUnit("miles")).toBe(false);
    expect(isOdometerUnit(null)).toBe(false);
  });

  it("uses the exact definition of a mile", () => {
    expect(KM_PER_MILE).toBe(1.609344);
  });
});

describe("conversion", () => {
  it("stores kilometres unchanged", () => {
    expect(odometerToKm(160934, "km")).toBe(160934);
    expect(odometerInUnit(160934, "km")).toBe(160934);
  });

  it("converts miles to whole kilometres on the way in", () => {
    expect(odometerToKm(100000, "mi")).toBe(160934);
    expect(odometerToKm(1, "mi")).toBe(2);
  });

  it("round-trips a typed mileage back to the same number", () => {
    // The whole justification for storing one unit: a reader who types 137,412
    // miles has to see 137,412 miles again, not 137,411.
    for (const miles of [1, 999, 42_195, 100_000, 137_412, 250_000]) {
      expect(odometerInUnit(odometerToKm(miles, "mi"), "mi")).toBe(miles);
    }
  });
});

describe("parseOdometer", () => {
  it("treats an empty field as no answer, not as zero", () => {
    // The column is nullable and "I have not walked out to the truck yet" is
    // a legitimate state. Zero would be a claim the truck is brand new.
    expect(parseOdometer("", "km")).toEqual({ km: null, issue: null });
    expect(parseOdometer("   ", "km")).toEqual({ km: null, issue: null });
  });

  it("accepts the separators a person actually types", () => {
    for (const typed of ["160934", "160,934", "160.934", "160 934"]) {
      expect(parseOdometer(typed, "km").km).toBe(160934);
    }
  });

  it("converts a mileage reading to kilometres", () => {
    expect(parseOdometer("100000", "mi").km).toBe(160934);
  });

  it("names a negative reading as negative, not as gibberish", () => {
    expect(parseOdometer("-5", "km")).toEqual({ km: null, issue: "negative" });
  });

  it("refuses text", () => {
    expect(parseOdometer("about 160k", "km").issue).toBe("not-a-number");
    expect(parseOdometer("12e5", "km").issue).toBe("not-a-number");
  });

  it("refuses an implausible distance", () => {
    expect(parseOdometer(String(MAX_ODOMETER_KM), "km").issue).toBe(null);
    expect(parseOdometer(String(MAX_ODOMETER_KM + 1), "km").issue).toBe(
      "too-large"
    );
  });

  it("applies the ceiling after converting, not before", () => {
    // 9,000,000 miles is under the numeric ceiling but 14.5 million km is not.
    expect(parseOdometer("9000000", "mi").issue).toBe("too-large");
  });
});

describe("formatOdometer", () => {
  it("formats one stored figure per locale, never storing it twice", () => {
    const en = formatOdometer(160934, "km", "en-US");
    const es = formatOdometer(160934, "km", "es-CR");

    expect(en).toContain("160");
    expect(es).toContain("160");
    expect(en).toMatch(/km/);
    expect(es).toMatch(/km/);
  });

  it("renders the same row in miles when the reader asks for miles", () => {
    expect(formatOdometer(160934, "mi", "en-US")).toMatch(/100,000/);
  });
});

describe("the stored unit preference", () => {
  it("defaults to the storage unit", () => {
    expect(readOdometerUnit(fakeWindow())).toBe("km");
  });

  it("reads a stored preference back", () => {
    const win = fakeWindow();
    writeOdometerUnit("mi", win);
    expect(readOdometerUnit(win)).toBe("mi");
  });

  it("ignores a value that is not a unit", () => {
    // localStorage is reader-writable and survives deploys.
    expect(
      readOdometerUnit(fakeWindow({ "monterogarage:odometer-unit": "furlong" }))
    ).toBe("km");
  });

  it("degrades to the default when storage throws", () => {
    expect(readOdometerUnit(hostileWindow())).toBe("km");
    expect(() => writeOdometerUnit("mi", hostileWindow())).not.toThrow();
  });
});
