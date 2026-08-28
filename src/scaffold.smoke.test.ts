import { describe, expect, it } from "vitest";
import { collections } from "./content.config";

describe("content collections scaffold", () => {
  it("has no collections registered yet (real schemas land in T104)", () => {
    expect(collections).toEqual({});
  });
});
