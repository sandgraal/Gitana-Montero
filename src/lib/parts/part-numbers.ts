/**
 * What a part number *is*, as plain rules with no dependencies (PRT-01).
 *
 * A tiny module on purpose. Three consumers need these rules and they are not
 * allowed to reach each other:
 *
 * - `src/schemas/parts.ts` wraps them in Zod to validate one entry;
 * - `src/lib/parts/index.ts` uses {@link normalizePartNumber} for the
 *   corpus-level uniqueness rule (PRT-03);
 * - `src/integrations/validate-parts.ts` reaches the second of those from
 *   inside an Astro build hook, which Node's own ESM resolver walks — so
 *   every module on that chain must import with an explicit `.ts` extension
 *   and must not drag the whole schema graph in behind it (the constraint
 *   `astro.config.mjs` records for the FIT-02 hook).
 *
 * Keeping the rules here rather than in the schema is what lets the build
 * chain stay a straight line, and it means "the same number" has exactly one
 * definition rather than one per caller.
 *
 * refs specs/001-foundation (PRT-01, PRT-03)
 */

/**
 * A part number as a catalogue prints it: uppercase letters and digits, joined
 * by single hyphens.
 *
 * Uppercase for the reason taxonomy ids are lowercase — `md976075` and
 * `MD976075` must not become two rows for one part — and hyphens as
 * *separators* rather than as characters that may appear anywhere, so `MB-`
 * and `MB--123` are rejected rather than stored as though they meant
 * something. The pattern requires at least one alphanumeric, so `""` and
 * `" "` are refused too.
 *
 * Same shape as `CODE_PATTERN` in `src/schemas/reference.ts`, and deliberately
 * not an import of it: that constant is one schema object shared by the two
 * decoder kinds, and its docstring records that the sharing is load-bearing.
 * A part number is a different fact with a different rule attached
 * (corpus-level uniqueness), and tying the two together would mean neither
 * could be narrowed without touching the other collection's guarantees.
 */
export const PART_NUMBER_PATTERN = /^[0-9A-Z]+(?:-[0-9A-Z]+)*$/;

/**
 * A catalogue token, not a description. Real Mitsubishi numbers run to about
 * ten characters (`MR455009`, `1234A123`); aftermarket numbers are longer
 * (`WPM-050-AISIN`). This cap is far above anything genuine and still refuses
 * a sentence pasted into a data field.
 */
export const PART_NUMBER_MAX_LENGTH = 32;

/**
 * How two part numbers are compared: hyphens removed, so `MB598152` and
 * `MB-598152` are recognised as the one number they are.
 *
 * Comparison only. The **stored** value keeps whatever punctuation its cited
 * catalogue prints, because that is the string a reader will read out at a
 * parts counter; normalizing on the way in would quietly rewrite a cited
 * source. Two genuinely different OEM numbers that differ only by a hyphen do
 * not exist in this catalogue system, so the collapse costs nothing and
 * catches the realistic case — the same part entered twice, punctuated two
 * ways, on two different days.
 */
export function normalizePartNumber(value: string): string {
  return value.replace(/-/g, "");
}
