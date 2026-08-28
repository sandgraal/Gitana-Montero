/**
 * ES `usted`-register lint (I18N-07).
 *
 * > ES prose SHALL use the `usted` register; a lint rule SHALL flag
 * > second-person `tú`/`vos` conjugations in ES prose files.
 *
 * This is a heuristic, not a parser: Spanish conjugation is not regular
 * enough to catch every informal slip with a handful of regexes, and a rule
 * that over-flags is worse than one that under-flags — a false positive on
 * every published page trains everyone to ignore the check. So this rule
 * only fires on patterns that are **structurally unambiguous** for informal
 * register, and stays silent on anything that also has a legitimate `usted`
 * reading:
 *
 * 1. **Pronouns/possessives exclusive to tú/vos** — `tú`, `tu`, `tus`, `vos`,
 *    `ti`, `contigo`. `usted` never uses any of these (its object/reflexive
 *    forms are `lo`/`la`/`le`/`se`, its possessive is `su`/`sus`), so any
 *    occurrence is unambiguous.
 * 2. **A curated lexicon of tú/vos-conjugated verb forms** (`revisas`,
 *    `tienes`, `revisá`, `tenés`, …). Never matched as a suffix — see point 3
 *    for why — only these specific, listed forms are flagged.
 * 3. **Vos present-indicative verbs, by their stressed final vowel *plus a
 *    required trailing `-s`*** (`hablás`, `tenés`, `vivís`, `estás`…). This
 *    is deliberately narrower than "any word ending in an accented vowel":
 *      - Spanish has no legitimate 1st-person or `usted`/3rd-person
 *        conjugation ending in a stressed á/é/í **followed by `-s`** — that
 *        shape belongs to `tú`/`vos` alone (`usted`'s plural, `ustedes`,
 *        conjugates `-an`/`-en`, not an accented vowel).
 *      - The bare accented vowel *without* the trailing `-s` is exactly
 *        where informal and correct-`usted` Spanish collide: `usted` future
 *        tense (`revisará`, `tendrá`) and present subjunctive (`esté`, `dé`)
 *        both end bare-accented, and so does 1st-person preterite narration
 *        common in this site's first-hand build-log prose (`yo revisé`, `yo
 *        viví`, `yo recibí`). A suffix rule over bare endings was tried and
 *        rejected during T105 review for exactly this reason — it flagged
 *        `está`, `esté`, `dé`, and ordinary first-person narration. The
 *        *imperative* vos forms that shape would have caught (`revisá`,
 *        `comé`) are instead hand-picked into the point-2 lexicon, limited to
 *        `-á`/`-é` endings that do not collide with 1st-person preterite
 *        (`-ir` verbs' preterite and imperative both end bare `-í`, so `-í`
 *        vos imperatives are deliberately left out of the lexicon too).
 *      - A short **denylist** still guards the trailing-`-s` rule against the
 *        handful of ordinary Costa Rican Spanish words that happen to end
 *        that way (`país`, `después`, `además`…) — the words this module's
 *        docstring/task line specifically warns about.
 *
 * Scans `prose.es` in every content entry, plus (cheaply, since it is
 * already clean) the `es` block of `src/i18n/ui.ts` — I18N-08's own lint
 * gate already keeps UI strings out of components, so this is a second,
 * independent pass over the same small, stable string set, not a new
 * responsibility.
 *
 * Usage: node scripts/check-es-register.mjs
 *
 * refs specs/001-foundation (I18N-07)
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  CONTENT_ROOT,
  REPO_ROOT,
  formatPath,
  loadContentEntries,
  stringLeaves,
} from "./lib/content-entries.mjs";

/** Never valid in `usted` register — `usted` has no reading that uses these. */
export const PRONOUN_TERMS = new Set([
  "tú",
  "tu",
  "tus",
  "vos",
  "ti",
  "contigo",
]);

/**
 * Explicit tú/vos-conjugated verb forms likely in automotive/procedural
 * Costa Rican Spanish prose. Deliberately a lexicon, not a suffix rule — see
 * module docstring point 2.
 */
export const INFORMAL_VERB_LEXICON = new Set([
  // tú present indicative, -ar verbs (-as, unaccented)
  "hablas",
  "cambias",
  "revisas",
  "verificas",
  "compruebas",
  "ajustas",
  "aprietas",
  "aflojas",
  "sacas",
  "quitas",
  "colocas",
  "instalas",
  "desinstalas",
  "conectas",
  "desconectas",
  "limpias",
  "drenas",
  "llenas",
  "rellenas",
  "purgas",
  "giras",
  "enciendes",
  "apagas",
  "usas",
  "presionas",
  "sueltas",
  "sostienes",
  "sujetas",
  "empujas",
  "jalas",
  "tiras",
  "levantas",
  "bajas",
  "necesitas",
  "debes",
  "arrancas",
  // tú present indicative, irregular / -er / -ir verbs (-es, unaccented)
  "tienes",
  "puedes",
  "sabes",
  "quieres",
  "vienes",
  "sales",
  "dices",
  "eres",
  "vas",
  "haces",
  "pones",
  "das",
  "ves",
  "oyes",
  "sigues",
  "pides",
  "mides",
  // vos irregular, no written accent
  "sos",
  // vos imperative, -ar verbs (bare -á; safe — -ar 1st-person preterite ends
  // -é, not -á, so there is no first-hand-narration collision)
  "hablá",
  "cambiá",
  "revisá",
  "verificá",
  "comprobá",
  "ajustá",
  "apretá",
  "aflojá",
  "sacá",
  "quitá",
  "colocá",
  "instalá",
  "desinstalá",
  "conectá",
  "desconectá",
  "limpiá",
  "drená",
  "llená",
  "rellená",
  "purgá",
  "girá",
  "usá",
  "presioná",
  "soltá",
  "sujetá",
  "empujá",
  "jalá",
  "tirá",
  "levantá",
  "bajá",
  "andá",
  // vos imperative, -er verbs (bare -é; safe for the same reason — -er
  // 1st-person preterite ends -í, not -é)
  "tené",
  "hacé",
  "poné",
  "volvé",
  "sabé",
  "encendé",
  "comé",
]);

/**
 * Common non-verb Costa Rican Spanish words that end in a stressed á/é/í
 * followed by `-s` and would otherwise collide with the vos-ending suffix
 * rule. See module docstring point 3.
 */
export const ACCENTED_SUFFIX_DENYLIST = new Set([
  "además",
  "detrás",
  "atrás",
  "jamás",
  "compás",
  "quizás",
  "país",
  "países",
  "después",
  "través",
  "revés",
  "cortés",
  "descortés",
  "inglés",
  "francés",
  "interés",
]);

/**
 * Classify one lowercased word: `"pronoun"`, `"informal-verb"`, `"vos-verb"`,
 * or `null` if it is not a flagged informal-register signal.
 */
export function classifyWord(lower) {
  if (PRONOUN_TERMS.has(lower)) return "pronoun";
  if (INFORMAL_VERB_LEXICON.has(lower)) return "informal-verb";

  // The suffix rule requires a trailing -s (module docstring point 3): a
  // bare accented ending is exactly where usted-register Spanish (future
  // tense, subjunctive) and first-hand preterite narration collide with vos.
  if (!lower.endsWith("s")) return null;
  const core = lower.slice(0, -1);
  const lastChar = core.slice(-1);
  if (
    (lastChar === "á" || lastChar === "é" || lastChar === "í") &&
    !ACCENTED_SUFFIX_DENYLIST.has(lower)
  ) {
    return "vos-verb";
  }

  return null;
}

const WORD_PATTERN = /\p{L}+/gu;

/** Every flagged word in `text`, with its offset and classification. */
export function findRegisterViolations(text) {
  const violations = [];
  for (const match of text.matchAll(WORD_PATTERN)) {
    const word = match[0];
    const kind = classifyWord(word.toLowerCase());
    if (kind !== null) {
      violations.push({ word, index: match.index, kind });
    }
  }
  return violations;
}

const KIND_LABEL = {
  pronoun: "tú/vos pronoun or possessive",
  "informal-verb": "tú/vos-conjugated verb",
  "vos-verb": "vos-conjugated verb",
};

/** Register problems for one entry's `prose.es`. */
export function findEntryRegisterIssues(entry) {
  const { file, data } = entry;
  const es = data && typeof data === "object" ? data.prose?.es : undefined;
  if (typeof es !== "object" || es === null) return [];

  const issues = [];
  for (const { path: fieldPath, value } of stringLeaves(es)) {
    for (const violation of findRegisterViolations(value)) {
      issues.push({
        file,
        field: `prose.es.${formatPath(fieldPath)}`,
        word: violation.word,
        message:
          `${file}: \`prose.es.${formatPath(fieldPath)}\` uses "${violation.word}" ` +
          `(${KIND_LABEL[violation.kind]}) — ES prose is \`usted\` register only (I18N-07).`,
      });
    }
  }
  return issues;
}

export function auditContentRegister(entries) {
  return entries.flatMap(findEntryRegisterIssues);
}

/**
 * Pull the `const es: UiStrings = { … };` object literal's *text* out of
 * `src/i18n/ui.ts`, without executing or type-checking the file — this is a
 * lint, not a build step, and plain Node cannot import `ui.ts` directly (it
 * transitively imports sibling `.ts` modules by extensionless specifier; see
 * `scripts/lib/content-entries.mjs`'s note on `RESERVED_ENTRY_FIELDS`).
 * String literal values only (`"…"` / `` `…` ``); good enough to tokenize for
 * word-level register violations, even though template interpolations like
 * `${TRUCK_YEAR}` are left as literal source text (harmless — a numeric
 * placeholder tokenizes to nothing `WORD_PATTERN` matches).
 */
export function extractUiEsBlockStrings(source) {
  const match = /const\s+es\s*:\s*UiStrings\s*=\s*\{([\s\S]*?)\n\};/.exec(
    source
  );
  if (!match) return [];
  const block = match[1];
  const stringPattern =
    /`((?:\\.|[^`\\])*)`|"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)'/g;
  const values = [];
  for (const m of block.matchAll(stringPattern)) {
    values.push(m[1] ?? m[2] ?? m[3] ?? "");
  }
  return values;
}

export function auditUiEsBlock(source, { file = "src/i18n/ui.ts" } = {}) {
  const issues = [];
  for (const value of extractUiEsBlockStrings(source)) {
    for (const violation of findRegisterViolations(value)) {
      issues.push({
        file,
        message:
          `${file}: the ES \`ui\` strings use "${violation.word}" ` +
          `(${KIND_LABEL[violation.kind]}) — ES prose is \`usted\` register only (I18N-07).`,
      });
    }
  }
  return issues;
}

async function main() {
  const entries = await loadContentEntries(CONTENT_ROOT);
  const problems = [...auditContentRegister(entries)];

  const uiPath = path.join(REPO_ROOT, "src", "i18n", "ui.ts");
  try {
    const uiSource = await readFile(uiPath, "utf8");
    problems.push(...auditUiEsBlock(uiSource));
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }

  if (problems.length > 0) {
    console.error(`check:es-register — ${problems.length} problem(s):`);
    for (const problem of problems) console.error(`  • ${problem.message}`);
    process.exitCode = 1;
    return;
  }

  console.log(
    `check:es-register — OK: ${entries.length} entr${entries.length === 1 ? "y" : "ies"} ` +
      `and src/i18n/ui.ts checked, all ES prose is \`usted\` register.`
  );
}

if (
  process.argv[1] &&
  new URL(process.argv[1], "file://").pathname ===
    new URL(import.meta.url).pathname
) {
  await main();
}
