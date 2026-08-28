/**
 * Text normalization shared by everything that compares Spanish words.
 *
 * One definition, three consumers that must agree or the site lies to the
 * reader: the glossary page's server-rendered search haystack, the same
 * page's client-side filter, and `scripts/check-glossary.mjs`'s conformance
 * scan (which mirrors this in plain JavaScript — it runs under bare Node and
 * cannot import a `.ts` module that imports its siblings by extensionless
 * specifier; `tests/check-glossary.test.ts` asserts the mirror matches this
 * implementation on a shared corpus, so the two cannot drift).
 *
 * refs specs/001-foundation (GLO-02, GLO-03)
 */

/**
 * Case- and accent-insensitive comparison form.
 *
 * Accents are stripped, not preserved: a reader searching `neumatico` on a
 * phone keyboard without accents must find `neumático`, and an author who
 * types `balatas` without the accent they did not need must still trip the
 * conformance scan. The cost is a handful of Spanish minimal pairs collapsing
 * together (`esta`/`está`), which matters for a general text search and does
 * not matter here — both consumers compare against a curated list of terms
 * the glossary itself declares, not against the whole language.
 *
 * `\p{M}` (combining marks) is removed after NFD decomposition, so `ñ` → `n`
 * as well. That is deliberate for the same reason: `anio`, `año` and `ano`
 * are not words a glossary lookup should distinguish on a keyboard that may
 * not have the key.
 */
export function normalizeForSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Word tokens in `text`, normalized, each with the offset it started at in
 * the original string.
 *
 * Tokenizing beats a regex with `\b`: JavaScript's `\b` is ASCII-only, so
 * `/\bcafé\b/` requires a *word* character after `é` (the boundary is
 * inverted the moment the pattern ends in a non-ASCII letter) and quietly
 * fails to match at end of sentence. Comparing token *sequences* is exact,
 * Unicode-safe, and gives multi-word terms (`pastillas de freno`) for free.
 *
 * **An internal hyphen joins, it does not split.** `goma-espuma` is one
 * token, not `goma` + `espuma`. Splitting on the hyphen made a hyphenated
 * compound match its first element, so a glossary variant `goma` fired on
 * `goma-espuma` — a false positive in a merge-blocking gate, and a direct
 * contradiction of the "cannot match inside another word" guarantee the scan
 * is built on. Only the ASCII hyphen joins, and only between two word
 * characters: a trailing `goma-` still yields `goma`, and an em dash used as
 * punctuation (`rin — goma`) still separates.
 */
export function tokenize(
  text: string
): { value: string; index: number; length: number }[] {
  const pattern =
    /[\p{L}\p{N}][\p{L}\p{M}\p{N}]*(?:-[\p{L}\p{N}][\p{L}\p{M}\p{N}]*)*/gu;
  const tokens: { value: string; index: number; length: number }[] = [];
  for (const match of text.matchAll(pattern)) {
    tokens.push({
      value: normalizeForSearch(match[0]),
      index: match.index ?? 0,
      length: match[0].length,
    });
  }
  return tokens;
}
