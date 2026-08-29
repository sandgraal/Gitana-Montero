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
import type { LinkKind } from "../schemas/community";

/**
 * `LINK_KINDS` values whose display name is a bare platform name with no
 * surrounding translated word — every kind except {@link TRANSLATABLE_LINK_KINDS}.
 *
 * `COMMUNITY_TYPES` needs no equivalent table: every one of its values
 * pairs a platform name with a translated word (`facebook-group` → "Grupo de
 * Facebook", `discord` → "Servidor de Discord"), so the whole label already
 * differs by locale and lives in `ui.ts` as ordinary translated prose.
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
