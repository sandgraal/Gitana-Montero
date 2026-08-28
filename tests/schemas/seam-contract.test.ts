/**
 * T103 canary — **T104 deletes this whole file.**
 *
 * The rest of the T103 graders are marked `it.fails`: they are expected to
 * throw today because `src/schemas/entry.ts` and `src/schemas/slugs.ts` are
 * seam stubs. That marker is only honest if the throw is the *seam* throw. A
 * grader that fails because of a typo'd import path, a moved fixture, or a
 * renamed export would look identical in the report and would prove nothing.
 *
 * So this file is the positive control for the whole task: it asserts, with
 * no marker, that both seam modules resolve, export the symbols the graders
 * import, and fail with the agreed `not implemented: T104` message. If any of
 * these three tests goes red, the `it.fails` markers elsewhere are lying.
 *
 * ## Activation (T104)
 *
 * Once the seams are implemented these assertions become false — the stubs no
 * longer throw — so this file must be deleted in the same commit that
 * implements them. It is intentionally self-enforcing: leaving it behind
 * turns `npm test` red.
 *
 * refs specs/001-foundation (I18N-05, I18N-06, SCF-04)
 */
import { describe, expect, it } from "vitest";
import { z } from "astro/zod";
import {
  CONFIDENCE_TIERS,
  LOCALES,
  SEAM_NOT_IMPLEMENTED,
  confidenceSchema,
  defineEntrySchema,
  fitmentSchema,
  localeSchema,
  sourceSchema,
} from "../../src/schemas/entry.ts";
import { validateSlugRegistry } from "../../src/schemas/slugs.ts";

const seamError = new RegExp(SEAM_NOT_IMPLEMENTED);

describe("T103 seam contract (delete this file in T104)", () => {
  it("agrees on the seam message the other graders rely on", () => {
    expect(SEAM_NOT_IMPLEMENTED).toBe("not implemented: T104");
  });

  it.each([
    ["LOCALES", () => LOCALES.includes("en")],
    ["CONFIDENCE_TIERS", () => CONFIDENCE_TIERS.includes("tsb")],
    ["localeSchema", () => localeSchema.safeParse("en")],
    ["confidenceSchema", () => confidenceSchema.safeParse("tsb")],
    ["sourceSchema", () => sourceSchema.safeParse({})],
    ["fitmentSchema", () => fitmentSchema.safeParse({})],
    ["defineEntrySchema", () => defineEntrySchema({}, { title: z.string() })],
  ])(
    "src/schemas/entry.ts exports %s as an unimplemented T103 seam",
    (_symbol, touch) => {
      expect(touch).toThrow(seamError);
    }
  );

  it("src/schemas/slugs.ts exports validateSlugRegistry as a seam", () => {
    expect(() => validateSlugRegistry({})).toThrow(seamError);
  });
});
