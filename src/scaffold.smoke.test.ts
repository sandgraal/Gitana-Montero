/**
 * Smoke test for the content-collection registration itself (SCF-01).
 *
 * `tests/schemas/collections.test.ts` grades the *behaviour* of whatever is
 * registered and says nothing about which collections exist. This file pins
 * the inventory: the collections spec 001 §4–§8 names, all present, so a
 * collection cannot be dropped or renamed without the rename being deliberate.
 *
 * Was T101's "no collections registered yet" scaffold assertion; T104 replaced
 * it when the real schemas landed.
 *
 * refs specs/001-foundation (SCF-01)
 */
import { describe, expect, it } from "vitest";
import { collections } from "./content.config";

const EXPECTED_COLLECTIONS = [
  "community",
  "garage",
  "glossary",
  "mods",
  "parts",
  "problems",
  "procedures",
  "reference",
  "vehicles",
];

describe("content collections", () => {
  it("registers exactly the collections spec 001 names", () => {
    expect(Object.keys(collections).sort()).toEqual(EXPECTED_COLLECTIONS);
  });

  it("gives every collection a loader and a schema", () => {
    for (const [name, collection] of Object.entries(collections)) {
      expect(collection, name).toMatchObject({
        loader: expect.anything(),
        schema: expect.anything(),
      });
    }
  });
});
