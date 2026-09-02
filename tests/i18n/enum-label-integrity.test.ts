/**
 * Closed-enum label integrity — the graders that do not read from the table
 * they are grading.
 *
 * **The gap this file closes.** Every other grader that touches a
 * `drivability.*` / `severity.*` / `confidenceTier.*` / `costBand.*` label
 * renders the page and then compares the rendered text against
 * `ui[locale][key]` — the same lookup the page itself just used. That is a
 * tautology: it proves the renderer read the table, and says nothing about
 * whether the table is right. An audit confirmed it by mutation against a real
 * `astro build`: swapping the Spanish values of `drivability["do-not-drive"]`
 * and `drivability["drive-normally"]` left `npm run verify` fully green, so a
 * Spanish-reading owner sitting in the red `do-not-drive` band would have been
 * told "Maneje normalmente". The same swap survives for `severity.*`.
 *
 * Three rules, each independent of that circularity:
 *
 * 1. **Coverage** — exactly one key per enum member, per locale, and no key in
 *    a family that is not an enum member. (Cross-*locale* key-set equality is
 *    already `src/i18n/ui.test.ts`'s; this is the enum-member ↔ key direction,
 *    which today only the TypeScript mapped types enforce and therefore only
 *    at `astro check` time, not at runtime and not through a cast.)
 * 2. **Within-locale distinctness** — no two members of one family may render
 *    the same string in one locale. This alone kills "collapse all four to one
 *    string" and any swap that duplicates a value; combined with rule 3 it
 *    kills the clean two-way swap as well.
 * 3. **Semantic anchors** — the one place in this repo where a literal
 *    Spanish or English word belongs in a grader, precisely because a lookup
 *    table cannot grade itself. Anchors are deliberately *keyword* checks with
 *    generous alternations, not exact-string pins: they must survive a
 *    legitimate copy edit ("Do not drive" → "Do not drive it") and still fail
 *    a swap. They cover `drivability.*` and `severity.*` only — the two
 *    families where being told the wrong thing has a physical consequence.
 *    `costBand.*` and `confidenceTier.*` get coverage and distinctness, no
 *    anchors: their EN labels legitimately share vocabulary ("A **major**
 *    component…" is the `significant` band), so a keyword anchor there would
 *    be a false-positive generator rather than a guard.
 *
 * Rules 1 and 2 are stated as pure functions over an arbitrary label table and
 * exercised against synthetic corpora — a clean one that must report nothing
 * and the audit's exact mutants, which must each be reported — so that the
 * rules are shown able to fail in the same run in which they pass against the
 * real table (GRADER-PRINCIPLES: "a test that cannot fail is worse than none",
 * "every finding needs a positive control").
 *
 * The families are derived from their enum constants, never hand-listed, so a
 * fifth drivability state cannot reach a page unguarded.
 *
 * refs specs/001-foundation (PRB-03, PRB-04, PRB-05, I18N-08)
 */
import { describe, expect, it } from "vitest";
import { LOCALES, type Locale } from "../../src/i18n/routing.ts";
import { type UiStrings, ui } from "../../src/i18n/ui.ts";
import { CONFIDENCE_TIERS } from "../../src/schemas/entry.ts";
import {
  COST_BANDS,
  DRIVABILITY_STATES,
  PROBLEM_SEVERITIES,
} from "../../src/schemas/problems.ts";

/* -------------------------------------------------------------------------
 * The rules, as functions over a table — so they can be mutation-tested here.
 * ---------------------------------------------------------------------- */

/** `{ member -> rendered label }` for one family in one locale. */
type LabelTable = Readonly<Record<string, string>>;

/**
 * Members with no key in `table`, and keys in `table` that are not members.
 *
 * Both directions on purpose: a family missing `tow-only` renders nothing
 * where the most restrictive triage belongs, and a stray
 * `drivability.do-not-drive-yet` is a label nobody can reach, which is how a
 * renamed enum member leaves a dead translation behind.
 */
function coverageIssues(
  members: readonly string[],
  table: LabelTable
): readonly string[] {
  const issues: string[] = [];
  const keys = Object.keys(table);

  for (const member of members) {
    const present = keys.filter((key) => key === member);
    if (present.length !== 1) {
      issues.push(`no label for enum member \`${member}\``);
    }
  }
  for (const key of keys) {
    if (!members.includes(key)) {
      issues.push(`label \`${key}\` is not an enum member`);
    }
  }
  return issues;
}

/**
 * Groups of two or more members whose labels are byte-identical after trimming
 * — reported as `"a + b = <label>"` so a failure names the collision rather
 * than only its count.
 *
 * Trimmed, not normalized further: two labels differing only in case or
 * punctuation are still two different strings a reader can tell apart, and
 * over-normalizing here would reject legitimate pairs.
 */
function duplicateLabelGroups(table: LabelTable): readonly string[] {
  const byLabel = new Map<string, string[]>();
  for (const [member, label] of Object.entries(table)) {
    const normalized = label.trim();
    const members = byLabel.get(normalized) ?? [];
    members.push(member);
    byLabel.set(normalized, members);
  }
  return [...byLabel.entries()]
    .filter(([, members]) => members.length > 1)
    .map(([label, members]) => `${members.join(" + ")} = ${label}`);
}

/* -------------------------------------------------------------------------
 * The real families, derived from their enum constants.
 * ---------------------------------------------------------------------- */

interface Family {
  readonly name: string;
  readonly prefix: string;
  readonly members: readonly string[];
}

const FAMILIES: readonly Family[] = [
  { name: "drivability", prefix: "drivability.", members: DRIVABILITY_STATES },
  { name: "severity", prefix: "severity.", members: PROBLEM_SEVERITIES },
  {
    name: "confidenceTier",
    prefix: "confidenceTier.",
    members: CONFIDENCE_TIERS,
  },
  { name: "costBand", prefix: "costBand.", members: COST_BANDS },
];

/** The `{ member -> label }` view of one family in one locale. */
function labelTable(family: Family, locale: Locale): LabelTable {
  const strings = ui[locale] as unknown as Readonly<Record<string, string>>;
  const table: Record<string, string> = {};
  for (const key of Object.keys(strings)) {
    if (!key.startsWith(family.prefix)) continue;
    table[key.slice(family.prefix.length)] = strings[key] as string;
  }
  return table;
}

/** One label, read through the same key shape the site's accessors use. */
function label(family: Family, locale: Locale, member: string): string {
  const strings = ui[locale] as unknown as Readonly<Record<string, string>>;
  const value = strings[`${family.prefix}${member}`];
  if (typeof value !== "string") {
    throw new Error(
      `no \`${family.prefix}${member}\` in \`${locale}\` — coverage rule ` +
        `should have caught this first`
    );
  }
  return value;
}

const cases = FAMILIES.flatMap((family) =>
  LOCALES.map((locale) => ({ family, locale }))
);

describe("closed-enum label families cover their enum exactly", () => {
  it.each(cases)(
    "$family.name in $locale has one label per enum member and no extras",
    ({ family, locale }) => {
      expect(
        coverageIssues(family.members, labelTable(family, locale))
      ).toEqual([]);
    }
  );
});

describe("closed-enum labels are distinct within a locale", () => {
  /*
   * The mutant this kills, verbatim from the audit: set all four ES
   * `drivability.*` labels to one string. Nothing else in the suite notices,
   * because every renderer grader compares the page against the same table.
   */
  it.each(cases)(
    "no two $family.name members render the same string in $locale",
    ({ family, locale }) => {
      expect(duplicateLabelGroups(labelTable(family, locale))).toEqual([]);
    }
  );
});

/* -------------------------------------------------------------------------
 * Semantic anchors — drivability and severity, both locales.
 *
 * Read these as "this label must still be about the thing its id names", not
 * as a translation. Each `must` is an alternation wide enough that rewording
 * the copy keeps passing; each `mustNot` exists to make a swap with a sibling
 * fail from two directions at once.
 * ---------------------------------------------------------------------- */

/** A negation, in either language — the load-bearing word in a triage band. */
const NEGATION = {
  en: /\b(not|don'?t|do\s+not|never|no)\b/i,
  es: /\b(no|nunca|jam[áa]s|evite|ning[úu]n)\b/i,
} as const;

interface Anchor {
  readonly family: string;
  readonly member: string;
  readonly locale: Locale;
  readonly must: RegExp;
  readonly mustNot?: RegExp;
  readonly because: string;
}

const ANCHOR_SPECS: readonly Anchor[] = [
  /* --- drivability: the single highest-stakes label on the site --- */
  {
    family: "drivability",
    member: "do-not-drive",
    locale: "en",
    must: NEGATION.en,
    because:
      "the red band must tell an English reader NOT to drive; without a " +
      "negation it reads as permission",
  },
  {
    family: "drivability",
    member: "do-not-drive",
    locale: "es",
    must: NEGATION.es,
    because:
      "the red band must tell a Spanish reader NOT to drive — this is the " +
      "exact mutant the audit landed: `No lo maneje` swapped for `Maneje " +
      "normalmente` survived a full `npm run verify`",
  },
  {
    family: "drivability",
    member: "drive-normally",
    locale: "en",
    must: /\bdriv(e|ing)\b/i,
    mustNot: NEGATION.en,
    because:
      "the green band grants permission; a negation in it means it has been " +
      "swapped with a restrictive state",
  },
  {
    family: "drivability",
    member: "drive-normally",
    locale: "es",
    must: /\b(manej|conduz|conduc)/i,
    mustNot: NEGATION.es,
    because:
      "same as EN — `Maneje normalmente` carries no negation, and `\\bno\\b` " +
      "deliberately does not match inside `normalmente`",
  },
  {
    family: "drivability",
    member: "tow-only",
    locale: "en",
    must: /\b(tow|towed|towing|flatbed|trailer)\b/i,
    because:
      "the most restrictive state names how the truck moves; it cannot be " +
      "swapped with a band that lets the reader drive",
  },
  {
    family: "drivability",
    member: "tow-only",
    locale: "es",
    must: /(gr[uú]a|remolq|remolc|plataforma|arrastr)/i,
    because: "`grúa` is the Costa Rican word; the alternation covers rewording",
  },
  {
    family: "drivability",
    member: "drive-gently-repair-soon",
    locale: "en",
    must: /(gentl|care|easy|light|short)/i,
    mustNot: /\b(do\s+not|don'?t|never)\b/i,
    because:
      "the amber band permits driving under a condition — an outright " +
      "prohibition in it means it has been swapped with `do-not-drive`",
  },
  {
    family: "drivability",
    member: "drive-gently-repair-soon",
    locale: "es",
    must: /(cuidado|suave|despacio|calma|corto)/i,
    mustNot: /\b(no|nunca|jam[áa]s)\b/i,
    because: "same as EN: a conditional permission, never a prohibition",
  },

  /* --- severity: what ignoring the fault costs --- */
  {
    family: "severity",
    member: "safety-critical",
    locale: "en",
    must: /(safety|hazard|danger|injur|hurt|harm)/i,
    because:
      "PRB-03 keys the standing bilingual safety notice off this value; its " +
      "chip has to say so",
  },
  {
    family: "severity",
    member: "safety-critical",
    locale: "es",
    must: /(segurid|peligr|riesg|lesion|da[ñn]o\s+a\s+person)/i,
    because: "same, in Spanish",
  },
  {
    family: "severity",
    member: "cosmetic",
    locale: "en",
    must: /(cosmetic|appearance|looks|comfort|trim)/i,
    mustNot: /(safety|hazard|danger|injur)/i,
    because:
      "the bottom of the ladder must not read as the top — this is the " +
      "`safety-critical` ↔ `cosmetic` swap the audit confirmed survives",
  },
  {
    family: "severity",
    member: "cosmetic",
    locale: "es",
    must: /(cosm[eé]tic|apariencia|est[eé]tic|confort|acabado)/i,
    mustNot: /(segurid|peligr|riesg)/i,
    because: "same swap, in Spanish",
  },
  {
    family: "severity",
    member: "stranding",
    locale: "en",
    must: /(strand|stuck|stop|immobil|move|home)/i,
    because: "this value is about being left somewhere, not about cost",
  },
  {
    family: "severity",
    member: "stranding",
    locale: "es",
    must: /(varad|var[ae]|inmoviliz|tirad|parad|deten)/i,
    because: "same, in Spanish",
  },
  {
    family: "severity",
    member: "damaging",
    locale: "en",
    must: /(damag|destroy|ruin|wreck|harm|other\s+part)/i,
    mustNot: /(cosmetic|appearance)/i,
    because: "this value is about wrecking something else, not about hazard",
  },
  {
    family: "severity",
    member: "damaging",
    locale: "es",
    must: /(da[ñn]|destru|arruin|deterior|otras\s+piezas)/i,
    mustNot: /(cosm[eé]tic|apariencia)/i,
    because: "same, in Spanish",
  },
  {
    family: "severity",
    member: "degrading",
    locale: "en",
    must: /(worse|degrad|less|poor|reduc|weaker|no\s+longer)/i,
    mustNot: /(safety|hazard|danger|injur)/i,
    because:
      "the truck still works, worse — a hazard word here means it has been " +
      "swapped with the top of the ladder",
  },
  {
    family: "severity",
    member: "degrading",
    locale: "es",
    must: /(peor|degrad|menos|deficien|reduc|ya\s+no)/i,
    mustNot: /(segurid|peligr|riesg)/i,
    because: "same, in Spanish",
  },
];

/**
 * `key` is precomputed rather than interpolated in the `it.each` title:
 * vitest reads `$family.$member` as one dotted property path and prints
 * `undefined`, which makes a red anchor unreadable — the failure has to name
 * the label it is about.
 */
const ANCHORS = ANCHOR_SPECS.map((anchor) => ({
  ...anchor,
  key: `${anchor.family}.${anchor.member}`,
}));

describe("safety-bearing labels still say what their enum id means", () => {
  it("anchors every drivability state and every severity, in both locales", () => {
    // A sweep, so an anchor cannot be quietly dropped: the anchor set must
    // cover the full cross-product of the two families and the two locales.
    const expected = new Set<string>();
    for (const member of DRIVABILITY_STATES) {
      for (const locale of LOCALES)
        expected.add(`drivability.${member}.${locale}`);
    }
    for (const member of PROBLEM_SEVERITIES) {
      for (const locale of LOCALES)
        expected.add(`severity.${member}.${locale}`);
    }
    const covered = new Set(
      ANCHORS.map((anchor) => `${anchor.key}.${anchor.locale}`)
    );
    expect([...expected].filter((key) => !covered.has(key))).toEqual([]);
  });

  it.each(ANCHORS)(
    "$locale $key — $because",
    ({ family: familyName, member, locale, must, mustNot }) => {
      const family = FAMILIES.find(
        (candidate) => candidate.name === familyName
      );
      if (family === undefined) throw new Error(`unknown family ${familyName}`);
      const value = label(family, locale, member);

      expect(value, `${locale}.${familyName}.${member}`).toMatch(must);
      if (mustNot !== undefined) {
        expect(value, `${locale}.${familyName}.${member}`).not.toMatch(mustNot);
      }
    }
  );

  it("keeps the red triage band and the green one from reading alike", () => {
    // Belt and braces beside the distinctness rule: these two specifically,
    // named, because they are the pair whose confusion the audit demonstrated.
    for (const locale of LOCALES) {
      const strings = ui[locale] as unknown as Record<string, string>;
      expect(strings["drivability.do-not-drive"]).not.toBe(
        strings["drivability.drive-normally"]
      );
      expect(strings["severity.safety-critical"]).not.toBe(
        strings["severity.cosmetic"]
      );
    }
  });
});

/* -------------------------------------------------------------------------
 * Positive and negative controls for the rules themselves.
 *
 * Everything above asserts "the real table is clean". These assert "the rules
 * would have said so if it were not" — reproducing the audit's mutants as
 * synthetic tables so the proof lives in the suite rather than only in a
 * commit message.
 * ---------------------------------------------------------------------- */

const CLEAN_DRIVABILITY_ES: LabelTable = {
  "drive-normally": "Maneje normalmente",
  "drive-gently-repair-soon": "Maneje con cuidado — repare pronto",
  "do-not-drive": "No lo maneje",
  "tow-only": "Solo en grúa",
};

describe("the rules above can fail (mutation controls)", () => {
  it("reports nothing on a clean table — the positive control", () => {
    expect(coverageIssues(DRIVABILITY_STATES, CLEAN_DRIVABILITY_ES)).toEqual(
      []
    );
    expect(duplicateLabelGroups(CLEAN_DRIVABILITY_ES)).toEqual([]);
  });

  it("catches all four labels collapsed to one string", () => {
    const collapsed = Object.fromEntries(
      DRIVABILITY_STATES.map((state) => [state, "Maneje normalmente"])
    );
    expect(duplicateLabelGroups(collapsed)).toHaveLength(1);
  });

  it("catches a member whose label was dropped, and a label with no member", () => {
    const missing: Record<string, string> = { ...CLEAN_DRIVABILITY_ES };
    delete missing["do-not-drive"];
    expect(coverageIssues(DRIVABILITY_STATES, missing)).toContain(
      "no label for enum member `do-not-drive`"
    );

    const stray = {
      ...CLEAN_DRIVABILITY_ES,
      "do-not-drive-yet": "No lo mueva",
    };
    expect(coverageIssues(DRIVABILITY_STATES, stray)).toContain(
      "label `do-not-drive-yet` is not an enum member"
    );
  });

  it("catches the swapped pair through the anchors, not through distinctness", () => {
    // The clean two-way swap keeps every value distinct, so rule 2 stays
    // silent by design and rule 3 is what fires. Stated here so a future
    // reader does not "simplify" the anchors away as redundant.
    const swapped: LabelTable = {
      ...CLEAN_DRIVABILITY_ES,
      "do-not-drive": CLEAN_DRIVABILITY_ES["drive-normally"] as string,
      "drive-normally": CLEAN_DRIVABILITY_ES["do-not-drive"] as string,
    };
    expect(duplicateLabelGroups(swapped)).toEqual([]);
    expect(swapped["do-not-drive"]).not.toMatch(NEGATION.es);
    expect(swapped["drive-normally"]).toMatch(NEGATION.es);
  });

  it("catches an EN label mistranslated into its own opposite", () => {
    // The audit's third mutant: `drivability.do-not-drive` set to the words
    // of `drive-normally` in the same locale.
    expect("Drive normally").not.toMatch(NEGATION.en);
  });
});

/* A compile-time reminder that `UiStrings` is the shape being read. */
const _shape: UiStrings = ui.en;
void _shape;
