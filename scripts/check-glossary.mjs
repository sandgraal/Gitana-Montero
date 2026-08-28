/**
 * `check:glossary` — canonical-term conformance scan of ES prose (GLO-02),
 * plus the glossary's own internal integrity (GLO-01).
 *
 * > **GLO-02** WHEN ES prose uses a term for which the glossary designates a
 * > canonical form, THE glossary check SHALL flag any non-canonical variant
 * > used in prose.
 *
 * AGENTS.md states the same rule from the other end: canonical Costa Rican
 * terms in prose; "regional variants from other countries live in the
 * glossary's `aliases` field — metadata and search index only, never in
 * prose". This script is what makes that structural instead of a review note.
 * It replaces the T105 tripwire stub, whose only job was to fail loudly if
 * glossary content arrived before a real scanner did.
 *
 * ## Two audits
 *
 * 1. **Conformance** — every entry in every collection, `prose.es` only, is
 *    scanned for the regional variants the glossary itself declares. A hit
 *    names the file, the prose field, the variant, and the canonical term it
 *    should have been.
 * 2. **Integrity** — the glossary cannot be authoritative if it contradicts
 *    itself, and nothing else can see these: two entries claiming the same
 *    canonical term, an alias that repeats its own entry's canonical form, one
 *    variant claimed by two entries, a `relatedTerms` id that names no entry.
 *
 * ## What the scan covers
 *
 * Both places ES prose lives: **every content collection's `prose.es`**, and
 * **the ES block of `src/i18n/ui.ts`** — site chrome is prose a reader sees on
 * every page, so "canonical terms in prose" applies to it too. Individual UI
 * keys can be exempted, but only by name and only with a reason, in
 * {@link UI_STRING_EXEMPTIONS}.
 *
 * Nothing else. Not `aliases` data (the variants must be writable somewhere to
 * be forbidden everywhere), not `prose.en`, not Markdown bodies, not component
 * markup — the I18N-08 lint already keeps user-facing strings out of
 * components, so `ui.ts` is the whole chrome surface.
 *
 * ## Zero false positives beats recall (the T105 design principle)
 *
 * This gate blocks merges. A rule that fires on correct prose trains everyone
 * to ignore it, so every ambiguity resolves to *silence*, and every silence is
 * written down:
 *
 * - **Token-sequence matching, never substring or `\b` regex.** `\b` in
 *   JavaScript is ASCII-only, so a pattern ending in an accented letter has
 *   its trailing boundary inverted and silently mismatches. Comparing
 *   normalized word *sequences* is exact, handles multi-word terms
 *   (`pastillas de freno`) and cannot match inside another word — including
 *   inside a hyphenated compound, since an internal hyphen joins a token
 *   rather than splitting it (`goma-espuma` is one token, so the variant
 *   `goma` does not fire on it).
 * - **A variant whose token sequence contains a one-character token is never
 *   scanned.** `A/C` tokenizes to `["a","c"]`, which would match ordinary
 *   punctuated prose ("la A. C. del taller"). Indexed for search, silent for
 *   the gate.
 * - **A variant that is also somebody's canonical term is never scanned.**
 *   Peninsular `llanta` is an alias of CR `aro`, and it is *also* the
 *   canonical CR term for the tire. Flagging it on sight would fire on
 *   correct prose in every entry that mentions a tire. Recorded for search
 *   (GLO-03), silent for the gate.
 * - **`falseFriend` variants are never scanned.** The flag means the word has
 *   a legitimate different meaning in Costa Rican Spanish; that is precisely
 *   the condition under which "this word appeared" does not imply "the author
 *   meant the variant".
 * - **A variant is exempt inside the prose of the entry that declares it.** A
 *   glossary definition legitimately names its own variants — the design
 *   artboard's own `llanta` card does exactly this.
 * - **A variant claimed by two different entries is never scanned** (and is
 *   reported as an integrity error): the glossary does not know which
 *   canonical form to recommend, so it recommends neither.
 * - **Variants shorter than {@link MIN_SCANNABLE_ALIAS_LENGTH} normalized
 *   characters are never scanned.** Two-letter tokens are abbreviations and
 *   prepositions far more often than they are regionalisms.
 * - **No morphological expansion.** A declared `balatas` does not catch
 *   `balata`, and a declared `rin` does not catch `rines`. Spanish inflection
 *   is regular enough to tempt and irregular enough to misfire; an author who
 *   wants both forms caught lists both. This is the one place recall is
 *   knowingly traded away, so it is pinned by negative tests — a future
 *   stemming change has to break them visibly rather than widen a
 *   merge-blocking gate by accident.
 *
 * Every exclusion above is recorded on `buildGlossaryIndex(...).skipped` and
 * printed by name on a successful run. A gate that silently stops enforcing a
 * term is the failure this script exists to prevent, so it reports what it
 * chose not to check, not just what it checked.
 *
 * ## Seams
 *
 * Every rule is an exported pure function taking entries as data, so
 * `tests/check-glossary.test.ts` grades them on synthetic fixtures with no
 * filesystem and no build. `main()` is the only impure part.
 *
 * Usage: node scripts/check-glossary.mjs
 *
 * refs specs/001-foundation (SCF-02, GLO-01, GLO-02, GLO-04)
 */
import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  CONTENT_ROOT,
  REPO_ROOT,
  deriveAstroEntryId,
  formatPath,
  loadContentEntries,
  stringLeaves,
} from "./lib/content-entries.mjs";

/**
 * The prose field holding a glossary entry's canonical term in a locale.
 *
 * Mirrors `CANONICAL_TERM_PROSE_FIELD` in `src/schemas/glossary.ts` — this
 * script runs under bare Node and cannot import that module (it imports its
 * siblings by extensionless specifier; see `scripts/lib/content-entries.mjs`).
 * `tests/check-glossary.test.ts` imports both and asserts they are equal, so
 * the mirror cannot drift.
 */
export const CANONICAL_TERM_PROSE_FIELD = "title";

/** The collection this script is about. */
export const GLOSSARY_COLLECTION = "glossary";

/** Shortest normalized variant the conformance scan will look for. */
export const MIN_SCANNABLE_ALIAS_LENGTH = 3;

/**
 * Mirror of `normalizeForSearch` in `src/lib/text.ts` — same reason as
 * {@link CANONICAL_TERM_PROSE_FIELD}, same drift test.
 */
export function normalizeForSearch(value) {
  return String(value)
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Mirror of `tokenize` in `src/lib/text.ts`. An internal ASCII hyphen joins
 * rather than splits — see that module for why (`goma-espuma` must not match
 * the variant `goma`).
 */
export function tokenize(text) {
  const pattern =
    /[\p{L}\p{N}][\p{L}\p{M}\p{N}]*(?:-[\p{L}\p{N}][\p{L}\p{M}\p{N}]*)*/gu;
  const tokens = [];
  for (const match of String(text).matchAll(pattern)) {
    tokens.push({
      value: normalizeForSearch(match[0]),
      index: match.index ?? 0,
      length: match[0].length,
    });
  }
  return tokens;
}

/** The normalized word sequence of a term (`["pastillas","de","freno"]`). */
export function termTokens(term) {
  return tokenize(term).map((token) => token.value);
}

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * A glossary entry reduced to what this script reads, or `null` when the
 * entry is not shaped like one.
 *
 * Malformed entries are skipped rather than reported: the Zod schema is what
 * names a bad field and fails the build (SCF-04), and a second, differently
 * worded complaint from a lint script would only obscure it.
 */
export function readGlossaryEntry(entry) {
  const { data, file, relativePath } = entry ?? {};
  if (!isPlainObject(data)) return null;

  const prose = isPlainObject(data.prose) ? data.prose : {};
  const terms = {};
  for (const [locale, block] of Object.entries(prose)) {
    if (!isPlainObject(block)) continue;
    const term = block[CANONICAL_TERM_PROSE_FIELD];
    if (typeof term === "string" && term.trim() !== "") {
      terms[locale] = term;
    }
  }

  const aliases = Array.isArray(data.aliases)
    ? data.aliases.filter(
        (alias) =>
          isPlainObject(alias) &&
          typeof alias.term === "string" &&
          typeof alias.locale === "string"
      )
    : [];

  const relatedTerms = Array.isArray(data.relatedTerms)
    ? data.relatedTerms.filter((id) => typeof id === "string" && id.trim())
    : [];

  return {
    // The id `astro:content` would give this file, which is what
    // `relatedTerms` names. `check:locales` already fails when `data.id`
    // disagrees with it, so there is exactly one id in play.
    id: relativePath ? deriveAstroEntryId(relativePath) : String(data.id ?? ""),
    file,
    terms,
    aliases,
    relatedTerms,
  };
}

/** Every glossary entry in `entries`, in file order. */
export function glossaryEntriesOf(entries) {
  return entries
    .filter((entry) => entry?.collection === GLOSSARY_COLLECTION)
    .map(readGlossaryEntry)
    .filter((entry) => entry !== null);
}

/**
 * The glossary as the scan needs it.
 *
 * @returns `{ terms, scannable, issues }` where `terms` maps
 *   `"<locale>\0<normalized term>"` to the entry that owns it,
 *   `scannable` is the variant list the conformance scan may fire on, and
 *   `issues` holds the integrity problems found while building it.
 */
export function buildGlossaryIndex(entries) {
  const glossary = glossaryEntriesOf(entries);
  const issues = [];

  /** `locale\0normalizedTerm -> { id, file, term }` */
  const terms = new Map();
  for (const entry of glossary) {
    for (const [locale, term] of Object.entries(entry.terms)) {
      const key = `${locale}\0${normalizeForSearch(term)}`;
      const holder = terms.get(key);
      if (holder && holder.id !== entry.id) {
        issues.push({
          code: "duplicate-canonical-term",
          file: entry.file,
          message:
            `${entry.file}: the \`${locale}\` canonical term "${term}" is ` +
            `already claimed by \`${holder.id}\` (${holder.file}). The ` +
            `glossary designates exactly one canonical form per concept per ` +
            `locale — merge the entries or rename one (GLO-01).`,
        });
        continue;
      }
      terms.set(key, { id: entry.id, file: entry.file, term });
    }
  }

  /** `locale\0normalizedAlias -> [{ entry, alias }]`, before exclusions. */
  const claims = new Map();
  for (const entry of glossary) {
    for (const alias of entry.aliases) {
      const normalized = normalizeForSearch(alias.term);
      if (normalized === "") continue;
      const key = `${alias.locale}\0${normalized}`;

      const own = entry.terms[alias.locale];
      if (own !== undefined && normalizeForSearch(own) === normalized) {
        issues.push({
          code: "alias-equals-own-canonical",
          file: entry.file,
          message:
            `${entry.file}: the \`${alias.locale}\` alias "${alias.term}" is ` +
            `this entry's own canonical term. An alias is a *different* ` +
            `regional variant; listing the canonical form as its own alias ` +
            `says nothing (GLO-01).`,
        });
        continue;
      }

      const list = claims.get(key) ?? [];
      list.push({ entry, alias, normalized });
      claims.set(key, list);
    }
  }

  const scannable = [];
  /** Variants deliberately not scanned, with the reason — reported by `main`. */
  const skipped = [];

  const skip = (claim, locale, reason) => {
    skipped.push({
      term: claim.alias.term,
      locale,
      reason,
      ownerId: claim.entry.id,
      ownerFile: claim.entry.file,
    });
  };

  for (const [key, list] of claims) {
    const [locale] = key.split("\0");
    const owners = [...new Set(list.map((claim) => claim.entry.id))];

    if (owners.length > 1) {
      const [first] = list;
      const files = [...new Set(list.map((claim) => claim.entry.file))];
      issues.push({
        code: "alias-claimed-twice",
        file: first.entry.file,
        message:
          `${files.join(", ")}: the \`${locale}\` variant ` +
          `"${first.alias.term}" is claimed by ${owners.length} glossary ` +
          `entries (${owners.join(", ")}). One variant cannot point at two ` +
          `canonical terms — the conformance scan skips it entirely until ` +
          `this is resolved (GLO-01, GLO-02).`,
      });
      for (const claim of list) skip(claim, locale, "claimed by two entries");
      continue;
    }

    for (const claim of list) {
      // Every remaining exclusion is a *silence* rule, not an error: see the
      // module docstring on why ambiguity never fires. Each one is recorded
      // in `skipped` so the run reports what it chose not to enforce — a
      // silent exclusion is how a gate stops working without anyone noticing.
      if (locale !== "es") continue;
      if (claim.alias.falseFriend === true) {
        skip(claim, locale, "marked falseFriend");
        continue;
      }
      if (claim.normalized.length < MIN_SCANNABLE_ALIAS_LENGTH) {
        skip(claim, locale, "shorter than the minimum scannable length");
        continue;
      }
      if (terms.has(key)) {
        skip(claim, locale, "is also a canonical term");
        continue;
      }

      const tokens = termTokens(claim.alias.term);
      if (tokens.length === 0) continue;
      // A one-character token makes the sequence match ordinary punctuated
      // prose: the variant `A/C` tokenizes to ["a","c"], which would fire on
      // "la A. C. del taller". Indexed for search (GLO-03), never scanned.
      if (tokens.some((token) => token.length < 2)) {
        skip(claim, locale, "contains a single-character token");
        continue;
      }

      const canonical = claim.entry.terms[locale];
      if (canonical === undefined) continue;

      scannable.push({
        term: claim.alias.term,
        tokens,
        locale,
        canonical,
        ownerId: claim.entry.id,
        ownerFile: claim.entry.file,
      });
    }
  }

  return { terms, scannable, skipped, issues, glossary };
}

/**
 * Occurrences of any `scannable` variant in `text`.
 *
 * Matching is on normalized token sequences, so `Neumáticos` does not match
 * `neumático` (no stemming — see the module docstring) but `NEUMÁTICO` and
 * `neumatico` both do.
 */
export function findAliasUsages(text, scannable) {
  const tokens = tokenize(text);
  if (tokens.length === 0) return [];

  const found = [];
  for (const alias of scannable) {
    const { tokens: needle } = alias;
    for (let start = 0; start + needle.length <= tokens.length; start += 1) {
      let matched = true;
      for (let offset = 0; offset < needle.length; offset += 1) {
        if (tokens[start + offset].value !== needle[offset]) {
          matched = false;
          break;
        }
      }
      if (!matched) continue;
      const first = tokens[start];
      const last = tokens[start + needle.length - 1];
      found.push({
        alias,
        index: first.index,
        text: text.slice(first.index, last.index + last.length),
      });
    }
  }

  return found.sort((a, b) => a.index - b.index);
}

/** Conformance problems in one entry's `prose.es`. */
export function findEntryConformanceIssues(entry, scannable) {
  const { file, data } = entry ?? {};
  const es =
    isPlainObject(data) && isPlainObject(data.prose)
      ? data.prose.es
      : undefined;
  if (!isPlainObject(es)) return [];

  // The entry's own id, so a glossary entry is exempt from its own variants.
  const selfId =
    entry.collection === GLOSSARY_COLLECTION && entry.relativePath
      ? deriveAstroEntryId(entry.relativePath)
      : null;

  const issues = [];
  for (const { path: fieldPath, value } of stringLeaves(es)) {
    for (const usage of findAliasUsages(value, scannable)) {
      if (selfId !== null && usage.alias.ownerId === selfId) continue;
      const field = `prose.es.${formatPath(fieldPath)}`;
      issues.push({
        code: "non-canonical-term",
        file,
        field,
        term: usage.text,
        canonical: usage.alias.canonical,
        message:
          `${file}: \`${field}\` uses "${usage.text}" — the glossary's ` +
          `canonical Costa Rican term is "${usage.alias.canonical}" ` +
          `(glossary/${usage.alias.ownerId}). Regional variants are ` +
          `\`aliases\` metadata, never prose (GLO-02, AGENTS.md).`,
      });
    }
  }
  return issues;
}

/** `relatedTerms` ids that name no glossary entry, and self-references. */
export function findRelatedTermIssues(index) {
  const known = new Set(index.glossary.map((entry) => entry.id));
  const issues = [];

  for (const entry of index.glossary) {
    for (const id of entry.relatedTerms) {
      if (id === entry.id) {
        issues.push({
          code: "related-term-self",
          file: entry.file,
          message:
            `${entry.file}: \`relatedTerms\` lists this entry's own id ` +
            `("${id}"). A term is not related to itself (GLO-01).`,
        });
        continue;
      }
      if (!known.has(id)) {
        issues.push({
          code: "related-term-missing",
          file: entry.file,
          message:
            `${entry.file}: \`relatedTerms\` names "${id}", which is not a ` +
            `glossary entry. A link to a related entry has to resolve, or ` +
            `the page renders nothing where a cross-reference should be ` +
            `(GLO-01).`,
        });
      }
    }
  }

  return issues;
}

/* -------------------------------------------------------------------------
 * The UI strings (I18N-08) — the other place ES prose lives
 * ---------------------------------------------------------------------- */

/**
 * UI-string keys exempt from the conformance scan, each with its reason.
 *
 * An exemption is a hole in a merge-blocking gate, so it is a named list of
 * individual keys and never a pattern: adding one is a visible diff with a
 * justification next to it.
 *
 * - `glossarySearchPlaceholder` — its whole pedagogical job is to *name real
 *   regional variants* ("Busque cualquier variante — rin, goma, balatas…") so
 *   a reader from Mexico or Colombia recognizes their own word and learns the
 *   search accepts it (GLO-03, SRCH-02). Scanning it would flag exactly the
 *   words that make it work, and the only "fix" would be to delete them.
 */
export const UI_STRING_EXEMPTIONS = new Map([
  [
    "glossarySearchPlaceholder",
    "names regional variants on purpose, so a reader recognizes their own " +
      "word and learns the search accepts it (GLO-03)",
  ],
]);

/**
 * Pull `key: "value"` pairs out of the `const es: UiStrings = { … };` literal
 * in `src/i18n/ui.ts`, as source text.
 *
 * Same approach and same reason as `scripts/check-es-register.mjs`'s
 * `extractUiEsBlockStrings`: this is a lint, not a build step, and plain Node
 * cannot import `ui.ts` (it imports siblings by extensionless specifier).
 * This variant keeps the *key* as well as the value, because the exemption
 * list above is keyed and an unkeyed exemption could not be audited.
 */
export function extractUiEsStrings(source) {
  const block = /const\s+es\s*:\s*UiStrings\s*=\s*\{([\s\S]*?)\n\};/.exec(
    source
  );
  if (!block) return [];

  const pair =
    /(?:^|[{,])\s*(?:"([^"]+)"|'([^']+)'|([A-Za-z_$][\w$]*))\s*:\s*(?:`((?:\\.|[^`\\])*)`|"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)')/g;

  const found = [];
  for (const match of block[1].matchAll(pair)) {
    const key = match[1] ?? match[2] ?? match[3] ?? "";
    const value = match[4] ?? match[5] ?? match[6] ?? "";
    if (key !== "") found.push({ key, value });
  }
  return found;
}

/**
 * Conformance problems in the ES UI strings (B3).
 *
 * The chrome is ES prose a reader sees on every page, so "canonical terms in
 * prose" applies to it exactly as it applies to content. It is checked here
 * rather than left to review for the same reason content is.
 */
export function findUiStringIssues(source, scannable, file = "src/i18n/ui.ts") {
  const issues = [];
  for (const { key, value } of extractUiEsStrings(source)) {
    if (UI_STRING_EXEMPTIONS.has(key)) continue;
    for (const usage of findAliasUsages(value, scannable)) {
      issues.push({
        code: "non-canonical-term",
        file,
        field: `es.${key}`,
        term: usage.text,
        canonical: usage.alias.canonical,
        message:
          `${file}: the ES UI string \`${key}\` uses "${usage.text}" — the ` +
          `glossary's canonical Costa Rican term is ` +
          `"${usage.alias.canonical}" (glossary/${usage.alias.ownerId}). ` +
          `Site chrome is ES prose too (GLO-02, I18N-08).`,
      });
    }
  }
  return issues;
}

/**
 * Every problem: integrity first, then conformance, in file order.
 *
 * `uiSource` is the text of `src/i18n/ui.ts`; omit it to audit content only
 * (which is what the unit tests do, so a fixture never depends on the real
 * chrome strings).
 */
export function auditGlossary(entries, uiSource = null) {
  const index = buildGlossaryIndex(entries);
  return [
    ...index.issues,
    ...findRelatedTermIssues(index),
    ...entries.flatMap((entry) =>
      findEntryConformanceIssues(entry, index.scannable)
    ),
    ...(uiSource === null ? [] : findUiStringIssues(uiSource, index.scannable)),
  ];
}

/** `src/i18n/ui.ts`, or `null` when it is not there (nothing to scan). */
async function readUiSource() {
  try {
    return await readFile(path.join(REPO_ROOT, "src", "i18n", "ui.ts"), "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

async function main() {
  const entries = await loadContentEntries(CONTENT_ROOT);
  const uiSource = await readUiSource();
  const index = buildGlossaryIndex(entries);
  const problems = auditGlossary(entries, uiSource);

  if (problems.length > 0) {
    console.error(`check:glossary — ${problems.length} problem(s):`);
    for (const problem of problems) console.error(`  • ${problem.message}`);
    process.exitCode = 1;
    return;
  }

  if (index.glossary.length === 0) {
    console.log(
      "check:glossary — OK: the glossary has no terms yet, so no canonical " +
        "form is designated and nothing in ES prose can contradict one. " +
        "The scan runs the moment the first term lands."
    );
    return;
  }

  console.log(
    `check:glossary — OK: ${index.glossary.length} glossary term(s), ` +
      `${index.scannable.length} scannable ES variant(s), ` +
      `${entries.length} entr${entries.length === 1 ? "y" : "ies"} of ES ` +
      `prose plus the ES UI strings all use canonical terms.`
  );

  // Named, not counted. A variant the gate has quietly stopped enforcing is
  // the failure mode this whole script is built to avoid, so every exclusion
  // is printed with its reason and the entry that declared it.
  if (index.skipped.length > 0) {
    console.log(
      `check:glossary — ${index.skipped.length} variant(s) deliberately not ` +
        `scanned:`
    );
    for (const entry of index.skipped) {
      console.log(
        `  · "${entry.term}" (${entry.locale}, glossary/${entry.ownerId}) — ` +
          `${entry.reason}`
      );
    }
  }

  for (const [key, reason] of UI_STRING_EXEMPTIONS) {
    console.log(
      `check:glossary — ES UI string \`${key}\` is exempt from the scan: ` +
        `${reason}`
    );
  }
}

if (
  process.argv[1] &&
  new URL(process.argv[1], "file://").pathname ===
    new URL(import.meta.url).pathname
) {
  await main();
}
