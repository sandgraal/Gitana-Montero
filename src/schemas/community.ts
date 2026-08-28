/**
 * The `community` collection schema (T700) — COM-01, COM-02.
 *
 * > **COM-01** THE `community` collection SHALL hold forums, subreddits,
 * > groups, Discords, clubs, channels, vendors, and shops — tagged by region,
 * > language, generation focus, activity level, and "what it's good for" in
 * > both locales.
 * >
 * > **COM-02** Spanish-language and Central American communities SHALL be
 * > first-class entries, not an appendix.
 *
 * Built from `./entry`'s primitives and `defineEntrySchema`, so a community
 * entry has the same envelope every other entry has:
 * `{ id, fitment, ...shared, confidence, sources, prose: { en, es } }`.
 *
 * ## Why the base contract fits a directory entry unchanged
 *
 * The task allowed for a stop-and-ask if `fitment` + `confidence` distorted
 * community data. They do not, and the readings below are the honest ones,
 * not a workaround:
 *
 * - **`fitment.gens` is COM-01's "generation focus", not a bolt-on.** A Gen-3
 *   owners' group lists `gen3`; a general Montero forum lists every gen,
 *   because it genuinely is about every gen. "At least one generation"
 *   (AGENTS.md: "'it's a Montero thing' is not a fitment") is a real editorial
 *   demand here — it forces the researcher to say which trucks a community can
 *   actually help with, which is the whole point of a directory.
 * - **`fitment.markets` carries vehicle-market scope** (which trucks), while
 *   `regions` below carries *the community's own* geographic reach (where its
 *   people are, where the shop physically is). A JDM-Pajero forum whose
 *   members are worldwide is `markets: ["jdm"]`, `regions: ["001"]`; a San
 *   José taller is `regions: ["CR"]`. Two different facts, two fields.
 * - **`confidence` grades the assessment, not the community's existence.**
 *   The claim an entry makes is "this is what this place is good for, in these
 *   languages, at this activity level". `first-hand` = the researcher opened
 *   it and read it; `community-consensus` = other owners vouch for the shop.
 *   `fsm-confirmed` / `tsb` are meaningless here and simply never used — and
 *   because only those two tiers require a citation
 *   (`CITATION_REQUIRED_TIERS`), a directory entry is never forced to invent a
 *   source or to archive a Discord invite. `sources` stays available for the
 *   cases that need it (a vendor's own parts catalogue, a thread recommending
 *   a shop).
 *
 * No relaxation of the T104 contract was needed, so none was made.
 *
 * ## How COM-02 is structural rather than editorial
 *
 * Nothing in this shape has an English or US default that a Spanish-language
 * or Central American entry would then have to opt out of:
 *
 * - `languages` and `regions` are both **required, unordered, non-empty**
 *   with no default value. Every entry declares them explicitly, so an
 *   ES-only Costa Rican group is described exactly as completely as an
 *   anglophone forum. There is no "primary language" field and no
 *   "alternate languages" field, because that pair is how an appendix gets
 *   built.
 * - The language vocabulary is **not** the site's `Locale` type. `Locale`
 *   is the two languages this site is published in; `languages` is data
 *   *about a community*, which may be Japanese, Thai, or Portuguese and is
 *   still a legitimate entry. Conflating them would have made every
 *   non-EN/ES community unrepresentable.
 *
 * ## Vocabularies
 *
 * `regions` and `languages` use CLDR/BCP-47 codes validated against `Intl`
 * rather than a hand-written list of places and tongues. That is deliberate:
 * an invented geography would need a schema change — never a drive-by edit
 * (AGENTS.md) — the first time a researcher found a Montero club in a country
 * nobody had thought to enumerate.
 *
 * **This buys openness at the cost of an ICU dependency.** The shape and
 * canonicality gates are pure (a regex and `Intl.getCanonicalLocales`), but
 * the third gate — "is this code actually assigned?" — is answered by
 * `Intl.DisplayNames`, so it moves with whatever CLDR data the running Node
 * ships. A future ICU release could in principle assign a code that is
 * unassigned today, or retire one. The tripwire is deliberate and lives in
 * `community.test.ts`: the pinned `it.each` tables of accepted codes (`CR`,
 * `013`, `419`, `001`, `es-CR`, `zh-Hans`, …) and rejected ones (`UK`, `ZZ`,
 * `XX`, `999`, …) turn a CLDR shift into a red test naming the code that
 * moved, rather than a content entry silently gaining or losing validity.
 *
 * refs specs/001-foundation (COM-01, COM-02)
 */
import { z } from "astro/zod";
import {
  defineEntrySchema,
  httpUrlSchema,
  isoDateSchema,
  nonBlankString,
} from "./entry";

/* -------------------------------------------------------------------------
 * Community type — COM-01's "forums, subreddits, groups, Discords, clubs,
 * channels, vendors, and shops"
 * ---------------------------------------------------------------------- */

/**
 * What kind of place this is, one value per entry: the thing a reader would
 * name if asked "what is it?".
 *
 * The list is COM-01's enumeration, one member per named kind — "groups" is
 * `facebook-group` and "channels" is `youtube-channel`, the forms the task
 * spelled out. Nothing beyond the spec's list is invented here; a kind the
 * directory turns out to need (WhatsApp and Telegram groups are the likely
 * ones in Central America) is a negotiated addition to this vocabulary, not
 * a value a content entry may improvise.
 */
export const COMMUNITY_TYPES = [
  "forum",
  "subreddit",
  "facebook-group",
  "discord",
  "club",
  "youtube-channel",
  "vendor",
  "shop",
] as const;

export type CommunityType = (typeof COMMUNITY_TYPES)[number];

/* -------------------------------------------------------------------------
 * Activity level — COM-01's "activity level"
 * ---------------------------------------------------------------------- */

/**
 * Ordered **most active first** (index 0 = busiest), the same
 * index-order-is-the-contract convention `CONFIDENCE_TIERS` uses: a rendering
 * or sorting rule ("anything from `dormant` down gets a caveat") compares
 * positions in this array instead of re-listing the chain.
 *
 * `archived` is distinct from `dormant` on purpose. A dormant forum might wake
 * up; an archived one is explicitly read-only and will not, but its threads
 * are often the best surviving record of a repair — worth linking, never worth
 * telling a reader to go ask there.
 */
export const ACTIVITY_LEVELS = [
  "very-active",
  "active",
  "quiet",
  "dormant",
  "archived",
] as const;

export type ActivityLevel = (typeof ACTIVITY_LEVELS)[number];

/* -------------------------------------------------------------------------
 * Regions — COM-01's "region"
 * ---------------------------------------------------------------------- */

/** ISO 3166-1 alpha-2 (`CR`) or UN M49 numeric (`013`). */
const REGION_CODE_PATTERN = /^(?:[A-Z]{2}|\d{3})$/;

/** CLDR's "unknown region" sentinel — a placeholder, never a tag. */
const UNKNOWN_REGION_CODE = "ZZ";

/**
 * M49 `001` — "world". The code a community with no geographic centre of
 * gravity carries, so "reaches everyone" is stated rather than left blank.
 * Other codes worth knowing: `013` Central America, `419` Latin America,
 * `003` North America, `150` Europe, `CR`, `MX`, `US`, `ES`, `JP`, `AU`.
 */
export const WORLDWIDE_REGION = "001";

const regionDisplayNames = new Intl.DisplayNames(["en"], {
  type: "region",
  fallback: "code",
});

/**
 * A region code CLDR actually assigns.
 *
 * Three gates, each closing a different hole, in order — a value rejected by
 * an earlier gate never reaches a later one:
 * 1. shape — `CR` or `013`. A country name, a slug (`costa-rica`), alpha-3
 *    (`CRI`) and wrong case (`cr`) all die here, before any `Intl` call;
 * 2. canonicality — `Intl.getCanonicalLocales` maps `UK` to `GB`, so the
 *    non-standard alias is rejected in favour of the one code the rest of the
 *    site will match on. One place, one code, or filtering silently splits;
 * 3. assignment — `Intl.DisplayNames` echoes the input back for unassigned
 *    codes (`XX`, `999`), which is how a typo is caught. `ZZ` resolves to
 *    "Unknown Region" and so survives that gate; it is excluded by name.
 *
 * Gate 3 is the ICU/CLDR-dependent one — it answers "does the running Node's
 * CLDR data assign this code?" and its answer can therefore move with an ICU
 * upgrade. See the module docstring: the pinned tables in `community.test.ts`
 * are the tripwire for that.
 */
export function isRegionCode(value: string): boolean {
  if (!REGION_CODE_PATTERN.test(value)) return false;
  if (value === UNKNOWN_REGION_CODE) return false;

  try {
    if (Intl.getCanonicalLocales(`und-${value}`)[0] !== `und-${value}`) {
      return false;
    }
    return regionDisplayNames.of(value) !== value;
  } catch {
    return false;
  }
}

export const regionCodeSchema = z.string().refine(isRegionCode, {
  message:
    "must be an ISO 3166-1 alpha-2 country code (`CR`) or a UN M49 region " +
    "code (`013` Central America, `001` worldwide)",
});

/* -------------------------------------------------------------------------
 * Languages — COM-01's "language"
 *
 * Deliberately *not* the site's `Locale`. See the module docstring: `Locale`
 * is what this site is published in, this is what a community speaks.
 * ---------------------------------------------------------------------- */

/** BCP-47: language, optional script, optional region — `es`, `es-CR`, `zh-Hans`. */
const LANGUAGE_TAG_PATTERN =
  /^[a-z]{2,3}(?:-[A-Z][a-z]{3})?(?:-(?:[A-Z]{2}|\d{3}))?$/;

const languageDisplayNames = new Intl.DisplayNames(["en"], {
  type: "language",
  fallback: "code",
});

/**
 * A BCP-47 tag naming a language CLDR knows, in canonical casing.
 *
 * The region subtag is allowed but never required: most entries are plain
 * `es` or `en`. Reach for `es-CR` only when the regional variety is the point
 * — a Costa Rican group whose vocabulary is the vocabulary this site's
 * glossary standardises on.
 *
 * The same three gates as `isRegionCode`, and again a value rejected early
 * never reaches `Intl`. `LANGUAGE_TAG_PATTERN` is doing more work here than
 * the region pattern does, and it is worth being precise about which failures
 * are its:
 * 1. shape — `LANGUAGE_TAG_PATTERN` rejects wrong case (`EN`), an underscore
 *    (`es_CR`), a non-canonical region subtag (`es-cr` — the pattern requires
 *    `-[A-Z]{2}`), a language *name* (`spanish`), and anything carrying
 *    extension or private-use subtags (`en-US-u-ca-gregory`). None of these
 *    reach `Intl` at all. This is a tag for a human language, not a locale
 *    for formatting numbers;
 * 2. canonicality — `Intl.getCanonicalLocales` catches what survives the
 *    pattern but is still not the form CLDR would write;
 * 3. assignment — `Intl.DisplayNames` echoes unassigned tags (`zz`) back.
 *
 * As with regions, gate 3 is the ICU/CLDR-dependent one and the pinned tables
 * in `community.test.ts` are its tripwire.
 */
export function isLanguageTag(value: string): boolean {
  if (!LANGUAGE_TAG_PATTERN.test(value)) return false;

  try {
    if (Intl.getCanonicalLocales(value)[0] !== value) return false;
    return languageDisplayNames.of(value) !== value;
  } catch {
    return false;
  }
}

export const languageTagSchema = z.string().refine(isLanguageTag, {
  message:
    "must be a BCP-47 language tag in canonical form (`es`, `en`, `pt`, " +
    "`ja`, or with a variety: `es-CR`)",
});

/* -------------------------------------------------------------------------
 * Links — the task's "links"
 * ---------------------------------------------------------------------- */

/**
 * Where else one community lives. A forum with a companion Discord and a
 * YouTube channel is one entry with three links, not three entries.
 *
 * A link carries a typed `kind` and a URL and **no label**: a label is
 * user-facing text, and user-facing text goes through the typed UI-strings
 * module in both locales (AGENTS.md / I18N-08). Putting a label here would
 * either hard-code English into data or duplicate one URL's name across two
 * prose blocks. The page renders the kind.
 *
 * These are platform identities, so the list is not `COMMUNITY_TYPES`:
 * `whatsapp` and `telegram` are perfectly good *secondary* presences for a
 * club that is primarily something else, whereas whether they can be a
 * community's primary kind is a vocabulary question left open above.
 */
export const LINK_KINDS = [
  "website",
  "forum",
  "subreddit",
  "facebook",
  "instagram",
  "discord",
  "youtube",
  "whatsapp",
  "telegram",
  "map",
] as const;

export type LinkKind = (typeof LINK_KINDS)[number];

export const communityLinkSchema = z
  .object({
    kind: z.enum(LINK_KINDS),
    url: httpUrlSchema(),
  })
  .strict();

export type CommunityLink = z.infer<typeof communityLinkSchema>;

/**
 * The `links` list, with URL uniqueness enforced *within* the array.
 *
 * There are two ways the same destination can appear twice on a card, and
 * both are errors: a link repeating the entry's canonical `url` (checked at
 * entry level, where `url` is in scope) and two links repeating each other
 * (checked here). Comparison is on the URL alone — the realistic way this
 * happens is the same address filed under two `kind`s.
 */
export const communityLinksSchema = z
  .array(communityLinkSchema)
  .min(1)
  .superRefine((links, ctx) => {
    const seen = new Map<string, number>();
    links.forEach((link, index) => {
      const { url } = link;
      const first = seen.get(url);
      if (first === undefined) {
        seen.set(url, index);
        return;
      }
      ctx.addIssue({
        code: "custom",
        path: [index, "url"],
        message:
          `duplicate link url \`${url}\` (already listed at index ${first}): ` +
          `\`links\` holds one entry per destination, so this would render ` +
          `twice (refs specs/001-foundation, COM-01)`,
      });
    });
  });

/* -------------------------------------------------------------------------
 * Tag lists
 * ---------------------------------------------------------------------- */

/**
 * A non-empty list of unique tags.
 *
 * Duplicates are an error rather than something to silently dedupe: a repeated
 * tag means the entry was edited carelessly, and a schema that quietly cleans
 * up after that hides the carelessness from review. The issue path points at
 * the offending index so the message names the element, not the array.
 */
function uniqueTagList(member: z.ZodType<string>, label: string) {
  return z
    .array(member)
    .min(1, { message: `at least one ${label} is required` })
    .superRefine((values, ctx) => {
      const seen = new Map<string, number>();
      values.forEach((value, index) => {
        const first = seen.get(value);
        if (first === undefined) {
          seen.set(value, index);
          return;
        }
        ctx.addIssue({
          code: "custom",
          path: [index],
          message: `duplicate ${label} \`${value}\` (already listed at index ${first})`,
        });
      });
    });
}

/* -------------------------------------------------------------------------
 * The entry shape
 * ---------------------------------------------------------------------- */

/** Locale-independent facts about the community. Nothing here is translated. */
export const communityShared = {
  /** What kind of place this is — COM-01. */
  communityType: z.enum(COMMUNITY_TYPES),

  /**
   * Where this community's people are, or where the shop physically is —
   * COM-01's "region". Vehicle-market scope lives in `fitment.markets`; see
   * the module docstring for why they are two fields.
   */
  regions: uniqueTagList(regionCodeSchema, "region"),

  /** What is spoken there — COM-01's "language". Never the site's `Locale`. */
  languages: uniqueTagList(languageTagSchema, "language"),

  /** COM-01's "activity level". */
  activity: z.enum(ACTIVITY_LEVELS),

  /**
   * The date the activity level was last looked at (`YYYY-MM-DD`).
   *
   * Required, because "active" with no as-of date is unfalsifiable: a forum
   * assessed in 2019 tells a reader nothing in 2026, and without this field
   * nothing downstream can tell a fresh check from a stale one. It is also
   * what lets the gaps report (GAP-01) surface directory entries due for a
   * re-check, the same way it surfaces ageing `anecdotal` entries.
   */
  activityAssessed: isoDateSchema(),

  /** The one canonical way in — the URL a reader would be sent to. */
  url: httpUrlSchema(),

  /** Additional presences for the same community. Optional; never a duplicate. */
  links: communityLinksSchema.optional(),
};

/**
 * Per-locale text.
 *
 * `title` and `summary` restate the base prose shape in `src/content.config.ts`
 * rather than importing it: `content.config.ts` imports *this* module to
 * register the collection, so reaching back the other way would be a cycle.
 * `community.test.ts` asserts both fields stay required, which is the part
 * that would actually break if the base shape moved.
 */
export const communityProse = {
  title: z.string(),
  summary: z.string(),

  /**
   * COM-01's "what it's good for", in both locales — the reason to send
   * someone here rather than somewhere else ("Gen-2 diesel wiring", "used
   * parts in the Central Valley").
   *
   * A list rather than a paragraph so a directory card can render it as
   * bullets without parsing prose. The locales need not have the same number
   * of bullets — that is a translation judgement for the bilingual editor,
   * not a structural rule — but a blank bullet in either locale is a missing
   * translation and `defineEntrySchema` rejects it (I18N-06).
   */
  goodFor: z
    .array(nonBlankString())
    .min(1, { message: "at least one `good for` entry is required" }),
};

/**
 * The registered `community` schema.
 *
 * The final `superRefine` is the half of link de-duplication that cannot live
 * on a single field: a `links` entry repeating the canonical `url` renders the
 * same destination twice on the same card, and only here is `url` in scope.
 * Its sibling — two `links` repeating each other — is enforced inside
 * `communityLinksSchema`, so the pair covers both ways a duplicate arrives.
 * Same-URL-different-kind is the realistic way it happens (a Facebook group
 * whose `url` *is* its Facebook page), so both checks compare URLs and ignore
 * `kind`.
 */
export const communitySchema = defineEntrySchema(
  communityShared,
  communityProse
).superRefine((entry, ctx) => {
  const { url, links } = entry as { url?: unknown; links?: unknown };
  if (typeof url !== "string" || !Array.isArray(links)) return;

  links.forEach((link, index) => {
    if ((link as { url?: unknown })?.url !== url) return;
    ctx.addIssue({
      code: "custom",
      path: ["links", index, "url"],
      message:
        "repeats the entry's canonical `url`: `links` holds the community's " +
        "*other* presences, so this one would render twice " +
        "(refs specs/001-foundation, COM-01)",
    });
  });
});

export type CommunityEntry = z.infer<typeof communitySchema>;
