import { describe, expect, it } from "vitest";
import { collections } from "./content.config";

describe("content collections scaffold", () => {
  it("exports a collections map (schemas land in T104)", () => {
    expect(typeof collections).toBe("object");
  });
});
