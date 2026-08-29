/**
 * Platform proper nouns used by the community directory page (T703a).
 *
 * These are brand/platform names — `Facebook`, `Discord`, `Subreddit` — not
 * translated prose. Spelled the same way regardless of which locale's page is
 * rendering, exactly like `LOCALE_NATIVE_NAME` in `src/i18n/routing.ts` ("shared
 * data, not translated prose, so it exists exactly once"). They live outside
 * `src/i18n/ui.ts` on purpose: `ui.test.ts` asserts every UI string differs
 * between `en` and `es` ("nothing is copied through untranslated"), which is
 * the correct rule for prose and the wrong rule for a proper noun that is
 * spelled identically in both languages.
 *
 * Composite labels that pair a brand name with a translated word — "Facebook
 * group" / "Grupo de Facebook", "YouTube channel" / "Canal de YouTube" — are
 * genuinely different strings per locale (the word order differs) and so stay
 * in `ui.ts` as ordinary translated prose; only the bare, brand-only labels
 * live here.
 *
 * refs specs/001-foundation (COM-01, COM-02, I18N-08)
 */
import type { CommunityType, LinkKind } from "../schemas/community";

/**
 * `LINK_KINDS` values whose display name is a bare platform name with no
 * surrounding translated word — every kind except {@link TRANSLATABLE_LINK_KINDS}.
 *
 * Most of `COMMUNITY_TYPES` needs no equivalent table: `facebook-group` →
 * "Grupo de Facebook", `discord` → "Servidor de Discord" pair a platform name
 * with a translated word, so the whole label already differs by locale and
 * lives in `ui.ts` as ordinary translated prose. `subreddit` is the one
 * exception — see {@link COMMUNITY_TYPE_BRAND_NAMES}.
 */
export const LINK_KIND_BRAND_NAMES: Readonly<Record<BrandLinkKind, string>> = {
  facebook: "Facebook",
  instagram: "Instagram",
  discord: "Discord",
  youtube: "YouTube",
  whatsapp: "WhatsApp",
  telegram: "Telegram",
  subreddit: "Subreddit",
};

/**
 * `LINK_KINDS` values that pair with an ordinary translated word — `ui.ts`
 * carries `communityLinkKind.<kind>` for exactly these three, so `UiStrings`'s
 * mapped type is built from this tuple rather than from all of `LINK_KINDS`
 * (the other seven have no translated form to require).
 */
export const TRANSLATABLE_LINK_KINDS = ["website", "forum", "map"] as const;

export type TranslatableLinkKind = (typeof TRANSLATABLE_LINK_KINDS)[number];

/** The complement of {@link TRANSLATABLE_LINK_KINDS} within `LINK_KINDS`. */
export type BrandLinkKind = Exclude<LinkKind, TranslatableLinkKind>;

/**
 * `COMMUNITY_TYPES` values whose display name is a bare platform name —
 * bilingual review B4 (ruled): a `subreddit`-type entry's type chip reads
 * "Subreddit" on both `/en/community/` and `/es/comunidad/`, the same
 * platform term either way, not "Comunidad en Reddit" (a translation that
 * reads as a *different*, friendlier kind of thing than what "Subreddit"
 * names on the link-kind chips elsewhere on the same card). Routed through
 * this seam — mirroring {@link LINK_KIND_BRAND_NAMES} exactly — rather than
 * `ui.ts`, for the same reason: `ui.test.ts`'s no-identical-pairs rule is
 * correct for prose and wrong for a proper noun.
 */
export const COMMUNITY_TYPE_BRAND_NAMES: Readonly<
  Record<BrandCommunityType, string>
> = {
  subreddit: "Subreddit",
};

/**
 * `COMMUNITY_TYPES` values that pair with an ordinary translated word —
 * `ui.ts` carries `communityType.<type>` for exactly these nine.
 */
export const TRANSLATABLE_COMMUNITY_TYPES = [
  "forum",
  "facebook-group",
  "whatsapp-group",
  "telegram-group",
  "discord",
  "club",
  "youtube-channel",
  "vendor",
  "shop",
] as const;

export type TranslatableCommunityType =
  (typeof TRANSLATABLE_COMMUNITY_TYPES)[number];

/** The complement of {@link TRANSLATABLE_COMMUNITY_TYPES} within `COMMUNITY_TYPES`. */
export type BrandCommunityType = Exclude<
  CommunityType,
  TranslatableCommunityType
>;
