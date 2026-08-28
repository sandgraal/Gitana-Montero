/**
 * Glossary collection schema (GLO-01, GLO-02, GLO-04).
 *
 * > **GLO-01** THE `glossary` collection SHALL hold, per term: canonical EN,
 * > canonical ES (Costa Rican), regional aliases with country tags,
 * > definition prose in both locales, and links to related entries.
 *
 * Built on the T104 seam (`defineEntrySchema`), so the bilingual rule, the
 * data/prose split, the strict-object rule and the fitment/confidence
 * requirement are inherited rather than re-implemented.
 *
 * ## Where the canonical term lives, and why it is `prose.<locale>.title`
 *
 * A canonical term is a *word*, i.e. human-language text, so it belongs in
 * `prose` and not in shared `data` — putting `{ en, es }` term strings in the
 * shared half would be exactly the per-locale duplication the split exists to
 * prevent, just pointed the other way. The base entry prose already has a
 * `title`, and for a glossary entry the title *is* the term: adding a second
 * `term` field next to it would make every one of T206's ~150 entries carry
 * the same word twice, and give the merge-blocking conformance scan two
 * candidate inputs that can silently disagree.
 *
 * So `title` is the canonical term, and this module makes that safe rather
 * than assumed: {@link canonicalTermSchema} refuses anything that is not a
 * bare term (a sentence, a parenthetical, a multi-line value), so the scan's
 * input is guaranteed well-formed instead of merely hoped to be. Consumers
 * read it through {@link CANONICAL_TERM_PROSE_FIELD} /
 * {@link canonicalTermOf} rather than by hard-coding `"title"`, which keeps
 * the field a seam.
 *
 * `summary` is the entry's definition — the paragraph the glossary page
 * renders in both languages. Same reasoning: an entry whose whole content is
 * one definition does not need both a `summary` and a `definition`.
 *
 * ## `fitment` + `confidence` on a glossary term
 *
 * The T104 base shape requires both on every collection, glossary included,
 * and the task note asks whether that distorts the model here. It does not,
 * so nothing is relaxed and no schema negotiation is opened:
 *
 * - **`fitment`** is real for terminology. Plenty of terms are
 *   generation-specific (`GDI`, `Super Select 4WD II`, `4M41`) and a reader
 *   filtering to their truck should not be told about a system it never had.
 *   A term that genuinely spans the range says so explicitly by listing every
 *   generation — which is the point of "'it's a Montero thing' is not a
 *   fitment" (AGENTS.md).
 * - **`confidence`** is terminology *provenance*: a term lifted from the
 *   Spanish-language FSM is `fsm-confirmed`, a term heard at the taller is
 *   `first-hand`, a regional variant attested by a forum is
 *   `community-consensus`. The base schema's citation rule then applies
 *   unchanged — claiming `fsm-confirmed` for a word nobody can point at in a
 *   document fails at parse time.
 *
 * ## What deliberately is *not* here
 *
 * Cross-collection references (`this term is explained by problem X`) are
 * typed references whose *resolution* is T703's deferred internal-reference
 * work, with T203's resolver as its dependency. GLO-01's "links to related
 * entries" is served today by {@link glossarySharedShape}'s `relatedTerms`,
 * which links glossary entries to each other — the only link this task can
 * both validate and render, since no other collection has a page template
 * yet. `check:glossary` fails on a `relatedTerms` id that names no entry.
 *
 * refs specs/001-foundation (GLO-01, GLO-02, GLO-04)
 */
import { z } from "astro/zod";
import {
  defineEntrySchema,
  localeSchema,
  nonBlankString,
  type Locale,
} from "./entry";

/* -------------------------------------------------------------------------
 * Systems — GLO-04 ("filterable by system (engine, brakes, suspension, …)")
 * ---------------------------------------------------------------------- */

/**
 * The system a term belongs to. These are **ids**, not labels: the words a
 * visitor reads are `glossarySystems` in `src/i18n/ui.ts`, in both locales.
 *
 * Ordered roughly the way a service manual is: powertrain, then chassis, then
 * body and support systems, with `general` last for terms that belong to no
 * single system (`repuestos`, `taller`). The glossary page renders the filter
 * pills in this order, so it is a display decision as much as a data one.
 */
export const GLOSSARY_SYSTEMS = [
  "engine",
  "fuel",
  "cooling",
  "exhaust",
  "transmission",
  "transfer-case",
  "drivetrain",
  "brakes",
  "suspension",
  "steering",
  "wheels-tires",
  "electrical",
  "hvac",
  "body",
  "interior",
  "tools",
  "fluids",
  "general",
] as const;

export type GlossarySystem = (typeof GLOSSARY_SYSTEMS)[number];

export const glossarySystemSchema = z.enum(GLOSSARY_SYSTEMS);

/* -------------------------------------------------------------------------
 * Canonical terms
 * ---------------------------------------------------------------------- */

/**
 * The prose field that holds a glossary entry's canonical term in a locale.
 *
 * Exported so nothing hard-codes `"title"`. `scripts/check-glossary.mjs`
 * mirrors this constant (it runs under plain Node and cannot import a `.ts`
 * module that imports its siblings by extensionless specifier — see
 * `scripts/lib/content-entries.mjs`); `tests/check-glossary.test.ts` asserts
 * the two agree, so the mirror cannot drift.
 */
export const CANONICAL_TERM_PROSE_FIELD = "title";

/** A canonical term is a term, not a sentence: 60 characters is generous. */
export const TERM_MAX_LENGTH = 60;

/**
 * Why a string is not usable as a canonical term, or `null` when it is.
 *
 * The rules are all "this is not a bare lexical form". They exist because
 * `check:glossary` is a merge-blocking gate that searches ES prose for these
 * strings: a value like `Pastillas de freno (balatas)` would not *false*-flag
 * anything, it would silently match nothing, and the gate would quietly stop
 * enforcing that term. Guaranteeing the shape at parse time is cheaper than
 * discovering the silence later.
 *
 * Exported for direct unit testing — the schema below is a thin wrapper.
 */
export function canonicalTermIssue(value: string): string | null {
  if (value !== value.trim()) {
    return "must not have leading or trailing whitespace";
  }
  if (value.length === 0) return "must not be blank";
  if (/[\n\r]/.test(value)) {
    return "must be a single line — a canonical term is one lexical form";
  }
  if (/\s{2,}/.test(value)) {
    return "must not contain runs of whitespace";
  }
  if (!/\p{L}/u.test(value)) {
    return "must contain at least one letter";
  }
  if (value.length > TERM_MAX_LENGTH) {
    return `must be at most ${TERM_MAX_LENGTH} characters — a canonical term is a term, not a definition`;
  }
  if (/[.!?;:,]$/.test(value)) {
    return "must not end with sentence punctuation — it is a term, not a sentence";
  }
  if (/[()[\]{}]/.test(value)) {
    return (
      "must not contain brackets — a parenthetical variant is an `aliases` " +
      "entry, not part of the canonical form (GLO-01)"
    );
  }
  if (/[/|]/.test(value)) {
    return (
      "must not contain `/` or `|` — one entry designates exactly one " +
      "canonical form per locale; the other forms are `aliases` (GLO-01)"
    );
  }
  return null;
}

/**
 * The canonical term in one locale. This is `prose.<locale>.title`: see the
 * module docstring on why the term is prose and why it is not a second field.
 */
export const canonicalTermSchema = z.string().superRefine((value, ctx) => {
  const issue = canonicalTermIssue(value);
  if (issue === null) return;
  ctx.addIssue({
    code: "custom",
    message:
      `not a canonical term: ${issue}. This field is the glossary's ` +
      `canonical form for this locale and is what \`check:glossary\` looks ` +
      `for in ES prose (GLO-02). refs specs/001-foundation`,
  });
});

/* -------------------------------------------------------------------------
 * Regional aliases — GLO-01, GLO-03
 * ---------------------------------------------------------------------- */

/** ISO 3166-1 alpha-2, uppercase (`MX`, `CO`, `ES`, `GB`, `AU`). */
export const countryCodeSchema = z.string().regex(/^[A-Z]{2}$/, {
  message:
    "must be an uppercase ISO 3166-1 alpha-2 country code (MX, CO, ES, AU…)",
});

/**
 * A regional variant of the canonical term.
 *
 * AGENTS.md: variants "live in the glossary's `aliases` field — metadata and
 * search index only, never in prose". Two consumers read this: GLO-03's
 * search index (T702) and GLO-02's conformance scan.
 *
 * - **`locale`** is required, with no default, because guessing it wrong is
 *   not symmetric. An English variant (`tyre`, `bonnet`, `spanner` — the UK
 *   and AU markets are first-class here, spec §2) silently defaulted to `es`
 *   would be scanned against Spanish prose, which is a false positive in a
 *   merge-blocking gate. Making the author say which language the variant
 *   belongs to costs one line and removes the whole failure mode.
 * - **`falseFriend`** marks a variant that means something *else* in Costa
 *   Rican Spanish — the artboard's `llanta ES — ¡ojo!`, where peninsular
 *   `llanta` is CR's `aro`. It does two jobs: the page renders the warning,
 *   and `check:glossary` drops the variant from the conformance scan, because
 *   a word with a legitimate local meaning cannot be flagged on sight without
 *   false positives. (A variant that collides with *any* entry's canonical
 *   term is dropped from the scan automatically for the same reason, marked
 *   or not.)
 */
export const glossaryAliasSchema = z
  .object({
    term: canonicalTermSchema,
    locale: localeSchema,
    /** Where the variant is used. At least one: an untagged alias is a rumor. */
    countries: z.array(countryCodeSchema).min(1),
    falseFriend: z.boolean().optional(),
  })
  .strict();

export type GlossaryAlias = z.infer<typeof glossaryAliasSchema>;

/* -------------------------------------------------------------------------
 * The collection shape
 * ---------------------------------------------------------------------- */

/** Locale-independent data for a glossary term. */
export const glossarySharedShape = {
  system: glossarySystemSchema,
  aliases: z.array(glossaryAliasSchema).default([]),
  /**
   * Ids of other glossary entries this term should be read with — GLO-01's
   * "links to related entries", scoped to the links this task can validate
   * *and* render (see the module docstring). `check:glossary` fails on an id
   * that names no glossary entry.
   */
  relatedTerms: z.array(nonBlankString()).default([]),
};

/**
 * Per-locale prose. `title` is the canonical term, `summary` is the
 * definition; both are inherited names from the base entry prose on purpose,
 * so a glossary entry is not a special case for anything that reads entries
 * generically (search, nav, the gaps report).
 */
export const glossaryProseShape = {
  title: canonicalTermSchema,
  summary: z.string(),
};

export const glossaryEntrySchema = defineEntrySchema(
  glossarySharedShape,
  glossaryProseShape
);

export type GlossaryEntryData = z.infer<typeof glossaryEntrySchema>;

/* -------------------------------------------------------------------------
 * Readers
 * ---------------------------------------------------------------------- */

/** Shape of the parsed data a renderer sees, narrowed to what it reads. */
interface CanonicalTermSource {
  prose: Record<string, Record<string, unknown>>;
}

/**
 * The canonical term of `entry` in `locale`. The only supported way to read
 * it — see {@link CANONICAL_TERM_PROSE_FIELD}.
 */
export function canonicalTermOf(
  entry: CanonicalTermSource,
  locale: Locale
): string {
  return String(entry.prose[locale]?.[CANONICAL_TERM_PROSE_FIELD] ?? "");
}
