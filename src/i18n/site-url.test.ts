import { afterEach, describe, expect, it, vi } from "vitest";
import { resetSiteWarning, warnIfSiteUnset } from "./site-url";

afterEach(() => {
  resetSiteWarning();
  vi.restoreAllMocks();
});

describe("warnIfSiteUnset", () => {
  it("says nothing when site is configured", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(
      warnIfSiteUnset(new URL("https://sandgraal.github.io"), "/en/")
    ).toBe(false);
    expect(warn).not.toHaveBeenCalled();
  });

  it("warns loudly, and only once, when site is missing", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(warnIfSiteUnset(undefined, "/en/")).toBe(true);
    expect(warnIfSiteUnset(undefined, "/es/")).toBe(true);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toMatch(/absolute hreflang/);
  });
});
