/**
 * Typed UI-strings module (I18N-08).
 *
 * Every user-facing string in site chrome — nav, footer, labels, buttons,
 * error pages — lives here in both locales. Components never hard-code text;
 * the `no-hardcoded-ui-text` ESLint rule fails the build when they do.
 *
 * `UiStrings` is the contract: adding a key without translating it is a type
 * error, so `astro check` catches a missing locale before review does. ES is
 * Costa Rican Spanish in the `usted` register (AGENTS.md).
 *
 * This module holds *only* prose. Locale-independent values — URLs, the site
 * name, native language names, and every figure — belong in `src/site.ts` or
 * `src/i18n/routing.ts` and are interpolated in, so a fact is never stored
 * twice.
 */

import { LOCALES, type Locale } from "./routing";
import { SITE_NAME, TRUCK_NAME, TRUCK_YEAR } from "../site";
import type { GlossarySystem } from "../schemas/glossary";
import type {
  ActivityLevel,
  CommunityType,
  LinkKind,
} from "../schemas/community";
import type { ConfidenceTier } from "../schemas/entry";
import type { DriveType, GenerationId } from "../schemas/vehicles";
import type { OptionalSelectionFacet } from "../lib/fitment";
import {
  COMMUNITY_TYPE_BRAND_NAMES,
  LINK_KIND_BRAND_NAMES,
  TRANSLATABLE_COMMUNITY_TYPES,
  TRANSLATABLE_LINK_KINDS,
  type TranslatableCommunityType,
  type TranslatableLinkKind,
} from "./community-brand-names";

/**
 * One flat key per glossary system (GLO-04's filter pills), derived from
 * `GLOSSARY_SYSTEMS` rather than hand-listed: adding a system without naming
 * it in both locales is a type error, not an untranslated pill.
 *
 * Flat and not a nested `Record<GlossarySystem, string>` on purpose —
 * `UiStrings` is a flat map of strings, and everything that sweeps it
 * (`ui.test.ts`'s completeness, placeholder and register checks, and
 * `scripts/check-es-register.mjs`) relies on that being true at one level.
 */
export type GlossarySystemStrings = {
  readonly [System in GlossarySystem as `glossarySystem.${System}`]: string;
};

/**
 * One flat key per *translatable* community type (T703a's type chip), same
 * rationale as {@link GlossarySystemStrings}: derived from
 * `TRANSLATABLE_COMMUNITY_TYPES` so a new translatable type with no
 * translation is a type error, not a chip that silently shows nothing.
 * `subreddit` is excluded — see `COMMUNITY_TYPE_BRAND_NAMES` in
 * `src/i18n/community-brand-names.ts` (bilingual review B4).
 */
export type CommunityTypeStrings = {
  readonly [
    Type in TranslatableCommunityType as `communityType.${Type}`
  ]: string;
};

/** One flat key per `ACTIVITY_LEVELS` value (T703a's activity badge). */
export type CommunityActivityStrings = {
  readonly [Level in ActivityLevel as `communityActivity.${Level}`]: string;
};

/**
 * One flat key per `TRANSLATABLE_LINK_KINDS` value — the `LINK_KINDS` values
 * that pair with an ordinary translated word. The rest are bare platform
 * names; see `src/i18n/community-brand-names.ts` for why those live outside
 * this typed-and-both-locales contract.
 */
export type CommunityLinkKindStrings = {
  readonly [
    Kind in TranslatableLinkKind as `communityLinkKind.${Kind}`
  ]: string;
};

/**
 * One flat key per `GENERATION_IDS` value.
 *
 * Renamed off T703a's `communityGeneration.` prefix by T204: the vehicle
 * selector's generation button row needs exactly these five words, and a
 * second `selectorGeneration.` copy of "Gen 3" / "Generación 3" would be the
 * same string translated twice. Same reasoning as
 * {@link ConfidenceTierStrings}, which was left unprefixed for this reason
 * from the start.
 */
export type GenerationStrings = {
  readonly [Gen in GenerationId as `generation.${Gen}`]: string;
};

/**
 * One flat key per `DRIVE_TYPES` value — the selector's optional drive
 * control (owner ruling 2026-08-30). Derived from the constant, so widening
 * the vocabulary is a type error rather than an untranslated option.
 */
export type DriveStrings = {
  readonly [Drive in DriveType as `drive.${Drive}`]: string;
};

/**
 * One flat key per facet a visitor may leave unanswered — the four
 * `OPTIONAL_SELECTION_FACETS` the fitment engine reports when a match leaned
 * on silence (T203 decision (a)). Derived, so a facet added to the match table
 * cannot reach the provisional notice untranslated.
 */
export type FitmentFacetStrings = {
  readonly [Facet in OptionalSelectionFacet as `fitmentFacet.${Facet}`]: string;
};

/**
 * One flat key per `CONFIDENCE_TIERS` value — not community-specific, so a
 * future page (T401's problem pages, PRB-04) reuses these rather than
 * re-translating the same five words under a different prefix.
 */
export type ConfidenceTierStrings = {
  readonly [Tier in ConfidenceTier as `confidenceTier.${Tier}`]: string;
};

export interface UiStrings
  extends
    GlossarySystemStrings,
    CommunityTypeStrings,
    CommunityActivityStrings,
    CommunityLinkKindStrings,
    GenerationStrings,
    DriveStrings,
    FitmentFacetStrings,
    ConfidenceTierStrings {
  readonly siteTagline: string;
  readonly skipToContent: string;
  readonly navHome: string;
  readonly navGlossary: string;
  readonly navLabel: string;
  readonly languageLabel: string;
  readonly languageSwitcherLabel: string;
  readonly languageCurrent: string;
  readonly homeHeading: string;
  readonly homeIntro: string;
  readonly homeStatus: string;
  readonly footerSourceLabel: string;
  readonly footerIssuesLabel: string;
  readonly footerDisclaimer: string;
  /**
   * MIG-05 — the standing "independent enthusiast site, not affiliated with
   * Mitsubishi Motors" notice. Ships in the footer of every page from the
   * rename onward, in both locales.
   */
  readonly footerNotAffiliated: string;
  readonly notFoundTitle: string;
  readonly notFoundMessage: string;
  readonly notFoundHomeLink: string;
  readonly rootRedirectTitle: string;
  readonly rootRedirectMessage: string;
  readonly rootRedirectManual: string;
  /* Glossary page — GLO-04 */
  readonly glossaryHeading: string;
  readonly glossaryIntro: string;
  readonly glossarySearchLabel: string;
  readonly glossarySearchPlaceholder: string;
  readonly glossaryFilterLabel: string;
  readonly glossaryFilterAll: string;
  readonly glossaryAliasesLabel: string;
  readonly glossaryFalseFriendLabel: string;
  readonly glossaryRelatedLabel: string;
  readonly glossaryNoResults: string;
  readonly glossaryEmpty: string;
  /**
   * Result counter. `{shown}` and `{total}` are replaced with figures at
   * render time and again in the browser as the filter narrows the list —
   * the numbers are computed, never written into a locale (AGENTS.md).
   */
  readonly glossaryCountTemplate: string;
  /* Community directory page — T703a, COM-01, COM-02 */
  readonly navCommunity: string;
  readonly communityHeading: string;
  readonly communityIntro: string;
  readonly communityFilterRegionLabel: string;
  readonly communityFilterRegionAll: string;
  /**
   * The `WORLDWIDE_REGION` (`001`) pill's label. Typed here rather than read
   * from `Intl.DisplayNames` like every other region: EN's CLDR data gives
   * `"world"` (lowercase) for `001` while ES gives `"Mundo"` (capitalized),
   * so the EN pill would sit uncapitalized next to sibling pills like
   * "Costa Rica" (code review F2). ES already agrees with `Intl` here, so
   * this simply pins the one code where EN and the rest of this page's title
   * casing would otherwise disagree.
   */
  readonly communityRegionWorldwide: string;
  readonly communityFilterLanguageLabel: string;
  readonly communityFilterLanguageAll: string;
  readonly communityFilterGenerationLabel: string;
  readonly communityFilterGenerationAll: string;
  readonly communityFilterActivityLabel: string;
  readonly communityFilterActivityAll: string;
  readonly communityNoResults: string;
  readonly communityEmpty: string;
  readonly communityGoodForLabel: string;
  readonly communityVisitLabel: string;
  readonly communityAlsoOnLabel: string;
  /** `{shown}` / `{total}`, computed and interpolated — see `glossaryCountTemplate`. */
  readonly communityCountTemplate: string;
  /** `{date}` is `activityAssessed`, shared data interpolated in, never retyped. */
  readonly communityActivityAssessedTemplate: string;
  /**
   * `{tier}` is filled with `confidenceTier.<tier>` at render time — the
   * caveat AGENTS.md requires below `tsb` (`src/lib/confidence.ts`).
   */
  readonly communityConfidenceCaveatTemplate: string;
  /* Sign-in / account page — 002 T2-202, ACC-01, ACC-02 */
  readonly navSignIn: string;
  readonly signInHeading: string;
  readonly signInIntro: string;
  /**
   * ACC-01's deny half, said out loud to the reader. This is not decoration:
   * a visitor who is never asked for a password should be told that is on
   * purpose, or the missing field reads as a broken form.
   */
  readonly signInNoPasswordNote: string;
  /** SHR-01, said before the account exists rather than after. */
  readonly signInPrivacyNote: string;
  readonly signInEmailLabel: string;
  readonly signInEmailPlaceholder: string;
  readonly signInEmailSubmit: string;
  readonly signInEmailSubmitBusy: string;
  readonly signInAlternativeLabel: string;
  readonly signInGoogleLabel: string;
  /** `{email}` is the address the reader just typed — interpolated, never stored. */
  readonly signInLinkSentTemplate: string;
  readonly signInEmailInvalid: string;
  readonly signInError: string;
  /** `{email}` is the signed-in account's own address. */
  readonly signInSignedInTemplate: string;
  readonly signInSignOut: string;
  /**
   * Shown when `PUBLIC_SUPABASE_URL` / `PUBLIC_SUPABASE_ANON_KEY` are absent —
   * every build until the owner provisions the project. A page that renders a
   * dead form would be worse than one that says why it is dead.
   */
  readonly signInUnavailable: string;
  readonly signInScriptRequired: string;
  /* Garage — 002 T2-301, GAR-01′, ACC-02, SHR-01 */
  readonly navGarage: string;
  readonly garageHeading: string;
  readonly garageIntro: string;
  /** Shown when this build has no Supabase project — the sign-in page's rule. */
  readonly garageUnavailable: string;
  readonly garageScriptRequired: string;
  readonly garageSignedOutHeading: string;
  readonly garageSignedOutBody: string;
  readonly garageSignInLink: string;
  readonly garageLoading: string;
  readonly garageError: string;
  readonly garageVehiclesHeading: string;
  readonly garageEmptyHeading: string;
  readonly garageEmptyBody: string;
  readonly garageAddVehicle: string;
  readonly garageOpenVehicle: string;
  readonly garageEditVehicle: string;
  readonly garageFormNewHeading: string;
  readonly garageFormEditHeading: string;
  readonly garageNameLabel: string;
  readonly garageNameHint: string;
  readonly garageIdentityLegend: string;
  readonly garageIdentityHint: string;
  /** The "leave this facet unanswered" option on market / year / engine. */
  readonly garageFacetUnknown: string;
  readonly garageOdometerLabel: string;
  readonly garageOdometerHint: string;
  readonly garageOdometerUnitLabel: string;
  readonly garageUnitKilometres: string;
  readonly garageUnitMiles: string;
  readonly garageSave: string;
  readonly garageSaving: string;
  readonly garageSaved: string;
  readonly garageCancel: string;
  readonly garageDelete: string;
  readonly garageDeleting: string;
  /** `{name}` is the vehicle's own display name, never stored per locale. */
  readonly garageDeleteConfirmTemplate: string;
  readonly garageIssueNameRequired: string;
  /** `{max}` is `MAX_DISPLAY_NAME_LENGTH`, interpolated — never typed here. */
  readonly garageIssueNameTooLongTemplate: string;
  readonly garageIssueGenerationRequired: string;
  readonly garageIssueIdentityUnknown: string;
  readonly garageIssueYearRange: string;
  readonly garageIssueOdometerNumber: string;
  readonly garageIssueOdometerLarge: string;
  readonly garageBackToVehicles: string;
  readonly garageStatEntries: string;
  readonly garageStatPlanned: string;
  /** The stat row's value when a figure has not been given (GAR-01′). */
  readonly garageStatUnrecorded: string;
  readonly garageTabsLabel: string;
  readonly garageTabTimeline: string;
  readonly garageTabCurrent: string;
  readonly garageTabPlanned: string;
  readonly garageTimelineEmpty: string;
  readonly garageCurrentEmpty: string;
  readonly garagePlannedEmpty: string;
  readonly garagePhotosHeading: string;
  readonly garagePhotosEmpty: string;
  readonly garagePhotosAdd: string;
  readonly garagePhotosUploading: string;
  /** `{name}` is the vehicle's display name — the alt text of every photo. */
  readonly garagePhotoAltTemplate: string;
  readonly garagePhotoRemove: string;
  readonly garagePhotoTypeRejected: string;
  /** `{size}` is `MAX_PHOTO_BYTES`, formatted by `Intl` at render time. */
  readonly garagePhotoSizeRejectedTemplate: string;
  readonly garagePhotosPrivateNote: string;
  readonly garageUseForBrowsing: string;
  readonly garageUsedForBrowsing: string;
  readonly garageIdentityIncomplete: string;
  /* Vehicle selector — T204, FIT-03 */
  readonly vehicleSelectorLabel: string;
  readonly vehicleSelectorIdle: string;
  readonly vehicleSelectorOpen: string;
  readonly vehicleSelectorChange: string;
  readonly vehicleSelectorPanelLabel: string;
  readonly vehicleSelectorClear: string;
  readonly vehicleSelectorReset: string;
  readonly vehicleSelectorApply: string;
  readonly vehicleSelectorGenerationLabel: string;
  readonly vehicleSelectorMarketLabel: string;
  readonly vehicleSelectorYearLabel: string;
  readonly vehicleSelectorEngineLabel: string;
  readonly vehicleSelectorDriveLabel: string;
  /** The drive control's "I have not said" option — see `OPTIONAL_SELECTION_FACETS`. */
  readonly vehicleSelectorDriveAny: string;
  readonly vehicleSelectorFilterNote: string;
  /** `<optgroup>` for powertrains a `combination` entry lists (VEH-03 rule 1/2). */
  readonly vehicleSelectorEnginesRecorded: string;
  /** `<optgroup>` for powertrains no combination entry mentions — *unknown*, not impossible. */
  readonly vehicleSelectorEnginesUnrecorded: string;
  readonly vehicleSelectorNoEngines: string;
  /* Vehicle-filtered listings — T204, FIT-03 */
  /** `{shown}` / `{total}`, computed and interpolated — see `glossaryCountTemplate`. */
  readonly vehicleFitCountTemplate: string;
  readonly vehicleFilteredTag: string;
  readonly vehicleDoesNotFitLabel: string;
  readonly vehicleProvisionalLabel: string;
  /**
   * The standing warning that a filtered listing was matched on FIT-03's
   * quadruple alone (T203 review, F8). Shown whenever any visible row's match
   * leaned on a facet the visitor has not named; narrowing the selection is
   * what removes it.
   */
  readonly vehicleProvisionalNote: string;
  /** `{facets}` is an `Intl.ListFormat` list of `fitmentFacet.*` labels. */
  readonly vehicleProvisionalDetailTemplate: string;
}

const en: UiStrings = {
  siteTagline:
    "Montero, Pajero and Shogun — your garage and the reference behind it",
  skipToContent: "Skip to content",
  navHome: "Home",
  navGlossary: "Glossary",
  navLabel: "Main navigation",
  languageLabel: "Language",
  languageSwitcherLabel: "Choose a language",
  languageCurrent: "Current language",
  homeHeading: "Keep your Montero's whole life in one place",
  homeIntro: `${SITE_NAME} is where a Montero, Pajero or Shogun owner keeps their truck's whole life: every job, every receipt, every part. Behind it sits a reference covering every generation and market. It starts with ${TRUCK_NAME}, a ${TRUCK_YEAR} Mitsubishi Montero, in English and Costa Rican Spanish.`,
  homeStatus:
    "Under construction: the bilingual platform is in place; the garage and the reference content land next.",
  footerSourceLabel: "Source code on GitHub",
  footerIssuesLabel: "Report a problem or correct a fact",
  footerDisclaimer:
    "Reference material only. For safety-critical work, consult a qualified mechanic.",
  footerNotAffiliated:
    "An independent enthusiast site. Not affiliated with Mitsubishi Motors.",
  notFoundTitle: "Page not found",
  notFoundMessage: "That page does not exist, or it has moved.",
  notFoundHomeLink: "Go to the home page",
  rootRedirectTitle: "Choose a language",
  rootRedirectMessage: "Sending you to your language…",
  rootRedirectManual: "If nothing happens, choose a language:",
  glossaryHeading: "Glossary",
  glossaryIntro:
    "The Costa Rican terms this site uses, with their English equivalents. Regional variants are recorded as searchable aliases and never used in the Spanish text.",
  glossarySearchLabel: "Search for terms and regional variants",
  glossarySearchPlaceholder: "Search any variant — rin, goma, balatas…",
  glossaryFilterLabel: "Filter by system",
  glossaryFilterAll: "All systems",
  glossaryAliasesLabel: "Also called",
  glossaryFalseFriendLabel: "means something else in Costa Rica",
  glossaryRelatedLabel: "See also",
  glossaryNoResults: "No terms match that search or filter.",
  glossaryEmpty: "The glossary has no terms yet.",
  glossaryCountTemplate: "{shown} of {total} terms",
  "glossarySystem.engine": "Engine",
  "glossarySystem.fuel": "Fuel system",
  "glossarySystem.cooling": "Cooling",
  "glossarySystem.exhaust": "Exhaust",
  "glossarySystem.transmission": "Transmission",
  "glossarySystem.transfer-case": "Transfer case",
  "glossarySystem.drivetrain": "Drivetrain",
  "glossarySystem.brakes": "Brakes",
  "glossarySystem.suspension": "Suspension",
  "glossarySystem.steering": "Steering",
  "glossarySystem.wheels-tires": "Wheels and tires",
  "glossarySystem.electrical": "Electrical system",
  "glossarySystem.hvac": "Heating and air conditioning",
  "glossarySystem.body": "Body",
  "glossarySystem.interior": "Interior and trim",
  "glossarySystem.tools": "Tools",
  "glossarySystem.fluids": "Fluids",
  "glossarySystem.general": "General terms",
  navCommunity: "Community",
  communityHeading: "Community directory",
  communityIntro:
    "Forums, groups, shops and channels for Montero, Pajero and Shogun owners. Costa Rican and Spanish-language communities are listed as first-class entries, not an appendix.",
  communityFilterRegionLabel: "Filter by region",
  communityFilterRegionAll: "All regions",
  communityRegionWorldwide: "World",
  communityFilterLanguageLabel: "Filter by language",
  communityFilterLanguageAll: "All languages",
  communityFilterGenerationLabel: "Filter by generation",
  communityFilterGenerationAll: "All generations",
  communityFilterActivityLabel: "Filter by activity",
  communityFilterActivityAll: "All activity levels",
  communityNoResults: "No communities match these filters.",
  communityEmpty: "The community directory has no entries yet.",
  communityGoodForLabel: "Good for",
  communityVisitLabel: "Visit",
  communityAlsoOnLabel: "Also on",
  communityCountTemplate: "{shown} of {total} communities",
  communityActivityAssessedTemplate: "Checked {date}",
  communityConfidenceCaveatTemplate:
    "Confidence: {tier}. This entry has not been checked against a factory manual or technical bulletin — treat it as a starting point, not a verified fact.",
  "communityType.forum": "Forum",
  "communityType.facebook-group": "Facebook group",
  "communityType.whatsapp-group": "WhatsApp group",
  "communityType.telegram-group": "Telegram group",
  "communityType.discord": "Discord server",
  "communityType.club": "Owners' club",
  "communityType.youtube-channel": "YouTube channel",
  "communityType.vendor": "Vendor",
  "communityType.shop": "Parts shop",
  "communityActivity.very-active": "Very active",
  "communityActivity.active": "Active",
  "communityActivity.quiet": "Quiet",
  "communityActivity.dormant": "Dormant",
  "communityActivity.archived": "Archived",
  "communityLinkKind.website": "Website",
  "communityLinkKind.forum": "Forum",
  "communityLinkKind.map": "Map",
  "generation.gen1": "Gen 1",
  "generation.gen2": "Gen 2",
  "generation.gen2-5": "Gen 2.5",
  "generation.gen3": "Gen 3",
  "generation.gen4": "Gen 4",
  "confidenceTier.fsm-confirmed":
    "Confirmed in the Factory Service Manual (FSM)",
  "confidenceTier.tsb": "Technical service bulletin (TSB)",
  "confidenceTier.community-consensus": "Community consensus",
  "confidenceTier.first-hand": "First-hand experience",
  "confidenceTier.anecdotal": "Anecdotal",
  navSignIn: "Sign in",
  signInHeading: "Sign in to your garage",
  signInIntro:
    "Your garage holds your vehicles, your work records and your receipts. Sign in to open it, or to start one.",
  signInNoPasswordNote:
    "There is no password to choose or forget. We send a one-time link to your email, or you can continue with Google.",
  signInPrivacyNote:
    "Everything you store is private by default. Nothing is published until you publish it, one vehicle and one record at a time.",
  signInEmailLabel: "Email address",
  signInEmailPlaceholder: "name@example.com",
  signInEmailSubmit: "Email me a sign-in link",
  signInEmailSubmitBusy: "Sending…",
  signInAlternativeLabel: "or",
  signInGoogleLabel: "Continue with Google",
  signInLinkSentTemplate:
    "A sign-in link is on its way to {email}. It works once, and only from this device's browser session.",
  signInEmailInvalid: "Enter an email address you can open right now.",
  signInError:
    "That did not work. Try again in a moment, and if it keeps failing, report it from the footer link.",
  signInSignedInTemplate: "Signed in as {email}.",
  signInSignOut: "Sign out",
  signInUnavailable:
    "Accounts are not switched on yet on this deployment. The reference side of the site works without one.",
  signInScriptRequired:
    "Signing in needs JavaScript. Everything else on this site works without it.",
  navGarage: "Garage",
  garageHeading: "Your garage",
  garageIntro:
    "Every truck you keep here, with its photos and its odometer. Nobody else can see any of it unless you publish it.",
  garageUnavailable:
    "Accounts are not switched on yet on this deployment, so there is no garage to open. The reference side of the site works without one.",
  garageScriptRequired:
    "Your garage needs JavaScript: it is your own data, and your browser fetches it after you sign in. Everything else on this site works without it.",
  garageSignedOutHeading: "Sign in to open your garage",
  garageSignedOutBody:
    "A garage belongs to an account. Signing in takes one link sent to your email — there is no password to choose.",
  garageSignInLink: "Go to the sign-in page",
  garageLoading: "Opening your garage…",
  garageError:
    "That did not go through. Try again in a moment; nothing was changed.",
  garageVehiclesHeading: "Your vehicles",
  garageEmptyHeading: "No vehicles yet",
  garageEmptyBody: `Add your Montero, Pajero or Shogun and give it a name. The truck this site was built around is called ${TRUCK_NAME}.`,
  garageAddVehicle: "Add a vehicle",
  garageOpenVehicle: "Open",
  garageEditVehicle: "Edit",
  garageFormNewHeading: "A new vehicle",
  garageFormEditHeading: "Edit this vehicle",
  garageNameLabel: "What you call it",
  garageNameHint:
    "The name you use for this truck. It is yours; nobody else sees it until you publish something.",
  garageIdentityLegend: "Which truck it is",
  garageIdentityHint:
    "This is what lets parts, procedures and problems be matched to your truck. Only the generation is needed — leave the rest unanswered if you are not sure.",
  garageFacetUnknown: "Not sure yet",
  garageOdometerLabel: "Odometer",
  garageOdometerHint:
    "The reading as it stands today. It is stored once and shown back in whichever unit you pick.",
  garageOdometerUnitLabel: "Odometer unit",
  garageUnitKilometres: "Kilometres",
  garageUnitMiles: "Miles",
  garageSave: "Save vehicle",
  garageSaving: "Saving…",
  garageSaved: "Saved.",
  garageCancel: "Cancel",
  garageDelete: "Delete this vehicle",
  garageDeleting: "Deleting…",
  garageDeleteConfirmTemplate:
    "Delete {name}? Its photos and everything recorded on it go with it, and that cannot be undone.",
  garageIssueNameRequired: "Give the vehicle a name.",
  garageIssueNameTooLongTemplate: "That name is longer than {max} characters.",
  garageIssueGenerationRequired: "Choose the generation.",
  garageIssueIdentityUnknown:
    "That is not a combination the taxonomy knows. Choose again from the lists.",
  garageIssueYearRange: "Choose a year from the list.",
  garageIssueOdometerNumber:
    "Write the odometer in digits, or leave the field empty.",
  garageIssueOdometerLarge:
    "That reading is higher than any odometer this site accepts.",
  garageBackToVehicles: "All vehicles",
  garageStatEntries: "Entries",
  garageStatPlanned: "Planned",
  garageStatUnrecorded: "Not recorded",
  garageTabsLabel: "Garage views",
  garageTabTimeline: "Timeline",
  garageTabCurrent: "Current state",
  garageTabPlanned: "Planned work",
  garageTimelineEmpty: "Nothing has been recorded on this vehicle yet.",
  garageCurrentEmpty:
    "The current-state sheet is worked out from what you record, so it fills in as you go.",
  garagePlannedEmpty: "Nothing is planned on this vehicle yet.",
  garagePhotosHeading: "Photos",
  garagePhotosEmpty: "No photos yet.",
  garagePhotosAdd: "Add a photo",
  garagePhotosUploading: "Uploading…",
  garagePhotoAltTemplate: "Photo of {name}",
  garagePhotoRemove: "Remove this photo",
  garagePhotoTypeRejected:
    "That file is not an image this site stores. JPEG, PNG, WebP, AVIF and HEIC all work.",
  garagePhotoSizeRejectedTemplate: "That photo is larger than {size}.",
  garagePhotosPrivateNote:
    "Photos are held in private storage. Nobody without your session can open one, and the links this page uses expire on their own.",
  garageUseForBrowsing: "Browse the site as this truck",
  garageUsedForBrowsing: "The site is filtered to this truck.",
  garageIdentityIncomplete:
    "Name the market, the year and the engine to filter the site with this truck.",
  vehicleSelectorLabel: "Your vehicle",
  vehicleSelectorIdle: "Browsing all vehicles",
  vehicleSelectorOpen: "Select your vehicle",
  vehicleSelectorChange: "Change vehicle",
  vehicleSelectorPanelLabel: "Which truck do you have?",
  vehicleSelectorClear: "Forget this vehicle",
  vehicleSelectorReset: "Clear",
  vehicleSelectorApply: "Set vehicle",
  vehicleSelectorGenerationLabel: "Generation",
  vehicleSelectorMarketLabel: "Market",
  vehicleSelectorYearLabel: "Year",
  vehicleSelectorEngineLabel: "Engine",
  vehicleSelectorDriveLabel: "Drive",
  vehicleSelectorDriveAny: "I have not said",
  vehicleSelectorFilterNote:
    "Combinations the taxonomy says never existed are filtered out as you pick.",
  vehicleSelectorEnginesRecorded: "Recorded for this combination",
  vehicleSelectorEnginesUnrecorded: "Not recorded — may still have existed",
  vehicleSelectorNoEngines: "No engine is listed for that combination yet.",
  vehicleFitCountTemplate: "{shown} of {total} fit your truck",
  vehicleFilteredTag: "filtered",
  vehicleDoesNotFitLabel: "Does not fit the vehicle you selected",
  vehicleProvisionalLabel: "Provisional match",
  vehicleProvisionalNote:
    "Matched on generation, market, year and engine only. Entries marked provisional also depend on something you have not told us, so some of them will not fit your truck. Narrowing your selection removes the mark.",
  vehicleProvisionalDetailTemplate:
    "This entry also depends on details you have not given: {facets}.",
  "drive.2wd": "Two-wheel drive",
  "drive.4wd": "Four-wheel drive",
  "fitmentFacet.transmission": "transmission",
  "fitmentFacet.transferCase": "transfer case",
  "fitmentFacet.trim": "trim",
  "fitmentFacet.drive": "drive",
};

const es: UiStrings = {
  siteTagline:
    "Montero, Pajero y Shogun — su taller y la referencia que lo respalda",
  skipToContent: "Saltar al contenido",
  navHome: "Inicio",
  navGlossary: "Glosario",
  navLabel: "Navegación principal",
  languageLabel: "Idioma",
  languageSwitcherLabel: "Elija un idioma",
  languageCurrent: "Idioma actual",
  homeHeading: "Guarde la vida entera de su Montero en un solo lugar",
  homeIntro: `${SITE_NAME} es donde el dueño de un Montero, Pajero o Shogun guarda la vida entera de su carro: cada trabajo, cada factura, cada repuesto. Lo respalda una referencia para todas las generaciones y todos los mercados. Todo empieza con ${TRUCK_NAME}, un Mitsubishi Montero ${TRUCK_YEAR}, en inglés y en español de Costa Rica.`,
  homeStatus:
    "En construcción: la plataforma bilingüe está lista; el taller y el contenido de referencia vienen a continuación.",
  footerSourceLabel: "Código fuente en GitHub",
  footerIssuesLabel: "Reporte un problema o corrija un dato",
  footerDisclaimer:
    "Material de referencia únicamente. En trabajos críticos para la seguridad, consulte a un mecánico calificado.",
  footerNotAffiliated:
    "Un sitio independiente, hecho por aficionados. Sin afiliación a Mitsubishi Motors.",
  notFoundTitle: "Página no encontrada",
  notFoundMessage: "Esa página no existe o cambió de dirección.",
  notFoundHomeLink: "Ir a la página de inicio",
  rootRedirectTitle: "Elija un idioma",
  rootRedirectMessage: "Redirigiendo a la versión en su idioma…",
  rootRedirectManual: "Si no pasa nada, elija un idioma:",
  glossaryHeading: "Glosario",
  glossaryIntro:
    "Los términos costarricenses que usa este sitio, con su equivalente en inglés. Las variantes regionales quedan registradas como alias que se pueden buscar y nunca se usan en el texto en español.",
  glossarySearchLabel: "Busque términos y variantes regionales",
  glossarySearchPlaceholder: "Busque cualquier variante — rin, goma, balatas…",
  glossaryFilterLabel: "Filtre por sistema",
  glossaryFilterAll: "Todos los sistemas",
  glossaryAliasesLabel: "También se le dice",
  glossaryFalseFriendLabel: "en Costa Rica significa otra cosa",
  glossaryRelatedLabel: "Vea también",
  glossaryNoResults: "Ningún término coincide con esa búsqueda o ese filtro.",
  glossaryEmpty: "El glosario todavía no tiene términos.",
  glossaryCountTemplate: "{shown} de {total} términos",
  "glossarySystem.engine": "Motor",
  "glossarySystem.fuel": "Sistema de combustible",
  "glossarySystem.cooling": "Refrigeración",
  "glossarySystem.exhaust": "Escape",
  "glossarySystem.transmission": "Transmisión",
  "glossarySystem.transfer-case": "Caja de transferencia",
  "glossarySystem.drivetrain": "Tren motriz",
  "glossarySystem.brakes": "Frenos",
  "glossarySystem.suspension": "Suspensión",
  "glossarySystem.steering": "Dirección",
  "glossarySystem.wheels-tires": "Aros y llantas",
  "glossarySystem.electrical": "Sistema eléctrico",
  "glossarySystem.hvac": "Calefacción y aire acondicionado",
  "glossarySystem.body": "Carrocería",
  "glossarySystem.interior": "Interior y acabados",
  "glossarySystem.tools": "Herramientas",
  "glossarySystem.fluids": "Líquidos",
  "glossarySystem.general": "Términos generales",
  navCommunity: "Comunidad",
  communityHeading: "Directorio de comunidades",
  communityIntro:
    "Foros, grupos, tiendas y canales para dueños de Montero, Pajero y Shogun. Las comunidades costarricenses y de habla hispana aparecen en igualdad de condiciones, no en un apéndice.",
  communityFilterRegionLabel: "Filtre por región",
  communityFilterRegionAll: "Todas las regiones",
  communityRegionWorldwide: "Mundo",
  communityFilterLanguageLabel: "Filtre por idioma",
  communityFilterLanguageAll: "Todos los idiomas",
  communityFilterGenerationLabel: "Filtre por generación",
  communityFilterGenerationAll: "Todas las generaciones",
  communityFilterActivityLabel: "Filtre por actividad",
  communityFilterActivityAll: "Todos los niveles de actividad",
  communityNoResults: "Ninguna comunidad coincide con estos filtros.",
  communityEmpty: "El directorio de comunidades todavía no tiene fichas.",
  communityGoodForLabel: "Bueno para",
  communityVisitLabel: "Visitar",
  communityAlsoOnLabel: "También en",
  communityCountTemplate: "{shown} de {total} comunidades",
  communityActivityAssessedTemplate: "Revisado el {date}",
  communityConfidenceCaveatTemplate:
    "Nivel de confianza: {tier}. Esta ficha no se ha contrastado con un manual de fábrica ni con un boletín técnico — tómela como punto de partida, no como un dato verificado.",
  "communityType.forum": "Foro",
  "communityType.facebook-group": "Grupo de Facebook",
  "communityType.whatsapp-group": "Grupo de WhatsApp",
  "communityType.telegram-group": "Grupo de Telegram",
  "communityType.discord": "Servidor de Discord",
  "communityType.club": "Club de dueños",
  "communityType.youtube-channel": "Canal de YouTube",
  "communityType.vendor": "Proveedor",
  "communityType.shop": "Tienda de repuestos",
  /*
   * B3 (bilingual review, ruled) — feminine forms, agreeing with "comunidad"
   * (the noun this badge is describing), which is also what four other
   * strings on this page already name explicitly (`communityHeading`,
   * `communityEmpty`, `communityCountTemplate`, `communityNoResults`).
   * "Foro · Archivada" is expected and accepted: the badge agrees with the
   * community, not with the type chip next to it.
   */
  "communityActivity.very-active": "Muy activa",
  "communityActivity.active": "Activa",
  "communityActivity.quiet": "Poco activa",
  "communityActivity.dormant": "Inactiva",
  "communityActivity.archived": "Archivada",
  "communityLinkKind.website": "Sitio web",
  "communityLinkKind.forum": "Foro",
  "communityLinkKind.map": "Mapa",
  "generation.gen1": "Generación 1",
  "generation.gen2": "Generación 2",
  "generation.gen2-5": "Generación 2.5",
  "generation.gen3": "Generación 3",
  "generation.gen4": "Generación 4",
  "confidenceTier.fsm-confirmed": "Confirmado en el manual de fábrica (FSM)",
  "confidenceTier.tsb": "Boletín técnico de servicio (TSB)",
  "confidenceTier.community-consensus": "Consenso de la comunidad",
  "confidenceTier.first-hand": "Experiencia de primera mano",
  "confidenceTier.anecdotal": "Anecdótico",
  navSignIn: "Ingresar",
  signInHeading: "Ingrese a su taller",
  signInIntro:
    "En su taller quedan sus carros, sus trabajos y sus facturas. Ingrese para abrirlo, o para empezar uno.",
  signInNoPasswordNote:
    "No hay contraseña que escoger ni que olvidar. Le enviamos un enlace de un solo uso a su correo, o puede continuar con Google.",
  signInPrivacyNote:
    "Todo lo que guarde queda privado desde el inicio. Nada se publica hasta que usted lo publique, carro por carro y ficha por ficha.",
  signInEmailLabel: "Correo electrónico",
  signInEmailPlaceholder: "nombre@ejemplo.com",
  signInEmailSubmit: "Envíeme un enlace de acceso",
  signInEmailSubmitBusy: "Enviando…",
  signInAlternativeLabel: "o",
  signInGoogleLabel: "Continúe con Google",
  signInLinkSentTemplate:
    "Va en camino un enlace de acceso a {email}. Sirve una sola vez, y solo desde el navegador de este dispositivo.",
  signInEmailInvalid: "Escriba un correo que pueda abrir en este momento.",
  signInError:
    "No se pudo completar. Inténtelo de nuevo en un momento y, si sigue fallando, repórtelo con el enlace del pie de página.",
  signInSignedInTemplate: "Sesión iniciada como {email}.",
  signInSignOut: "Cerrar sesión",
  signInUnavailable:
    "Las cuentas todavía no están activas en este despliegue. La parte de referencia del sitio funciona sin cuenta.",
  signInScriptRequired:
    "Para ingresar se necesita JavaScript. Todo lo demás en este sitio funciona sin él.",
  navGarage: "Taller",
  garageHeading: "Su taller",
  garageIntro:
    "Cada carro que guarde aquí, con sus fotos y su kilometraje. Nadie más lo ve, salvo que usted lo publique.",
  garageUnavailable:
    "Las cuentas todavía no están activas en este despliegue, así que no hay taller que abrir. La parte de referencia del sitio funciona sin cuenta.",
  garageScriptRequired:
    "Su taller necesita JavaScript: son datos suyos y el navegador los trae después de que usted ingrese. Todo lo demás en este sitio funciona sin él.",
  garageSignedOutHeading: "Ingrese para abrir su taller",
  garageSignedOutBody:
    "El taller pertenece a una cuenta. Para ingresar basta con un enlace enviado a su correo: no hay contraseña que escoger.",
  garageSignInLink: "Ir a la página de ingreso",
  garageLoading: "Abriendo su taller…",
  garageError:
    "No se pudo completar. Inténtelo de nuevo en un momento; no se cambió nada.",
  garageVehiclesHeading: "Sus carros",
  garageEmptyHeading: "Todavía no hay carros",
  garageEmptyBody: `Agregue su Montero, Pajero o Shogun y póngale nombre. Al carro alrededor del cual se armó este sitio se le dice ${TRUCK_NAME}.`,
  garageAddVehicle: "Agregar un carro",
  garageOpenVehicle: "Abrir",
  garageEditVehicle: "Editar",
  garageFormNewHeading: "Un carro nuevo",
  garageFormEditHeading: "Edite este carro",
  garageNameLabel: "Cómo le dice usted",
  garageNameHint:
    "El nombre con el que usted llama a este carro. Es suyo: nadie más lo ve hasta que usted publique algo.",
  garageIdentityLegend: "Cuál carro es",
  garageIdentityHint:
    "Es lo que permite que los repuestos, los procedimientos y las fallas se ajusten a su carro. Solo hace falta la generación; si no está seguro, deje lo demás sin responder.",
  garageFacetUnknown: "Todavía no lo sé",
  garageOdometerLabel: "Kilometraje",
  garageOdometerHint:
    "La lectura tal como está hoy. Se guarda una sola vez y se muestra en la unidad que usted escoja.",
  garageOdometerUnitLabel: "Unidad del kilometraje",
  garageUnitKilometres: "Kilómetros",
  garageUnitMiles: "Millas",
  garageSave: "Guardar el carro",
  garageSaving: "Guardando…",
  garageSaved: "Guardado.",
  garageCancel: "Cancelar",
  garageDelete: "Eliminar este carro",
  garageDeleting: "Eliminando…",
  garageDeleteConfirmTemplate:
    "¿Eliminar {name}? Se van con él sus fotos y todo lo que tenga anotado, y eso no se puede deshacer.",
  garageIssueNameRequired: "Póngale un nombre al carro.",
  garageIssueNameTooLongTemplate: "Ese nombre pasa de {max} caracteres.",
  garageIssueGenerationRequired: "Escoja la generación.",
  garageIssueIdentityUnknown:
    "Esa no es una combinación que la taxonomía conozca. Escoja de nuevo en las listas.",
  garageIssueYearRange: "Escoja un año de la lista.",
  garageIssueOdometerNumber:
    "Escriba el kilometraje en dígitos, o deje el campo vacío.",
  garageIssueOdometerLarge:
    "Esa lectura pasa de cualquier kilometraje que el sitio acepte.",
  garageBackToVehicles: "Todos los carros",
  garageStatEntries: "Fichas",
  garageStatPlanned: "Pendiente",
  garageStatUnrecorded: "Sin registrar",
  garageTabsLabel: "Vistas del taller",
  garageTabTimeline: "Bitácora",
  garageTabCurrent: "Estado actual",
  garageTabPlanned: "Trabajo pendiente",
  garageTimelineEmpty: "Todavía no hay nada anotado en este carro.",
  garageCurrentEmpty:
    "La hoja de estado actual se calcula con lo que usted anote, así que se va llenando sola.",
  garagePlannedEmpty: "Todavía no hay nada pendiente en este carro.",
  garagePhotosHeading: "Fotos",
  garagePhotosEmpty: "Todavía no hay fotos.",
  garagePhotosAdd: "Agregar una foto",
  garagePhotosUploading: "Subiendo…",
  garagePhotoAltTemplate: "Foto de {name}",
  garagePhotoRemove: "Quite esta foto",
  garagePhotoTypeRejected:
    "Ese archivo no es una imagen de las que el sitio guarda. Sirven JPEG, PNG, WebP, AVIF y HEIC.",
  garagePhotoSizeRejectedTemplate: "Esa foto pasa de {size}.",
  garagePhotosPrivateNote:
    "Las fotos quedan en almacenamiento privado. Nadie sin su sesión puede abrir una, y los enlaces que usa esta página se vencen solos.",
  garageUseForBrowsing: "Ver el sitio como este carro",
  garageUsedForBrowsing: "El sitio está filtrado para este carro.",
  garageIdentityIncomplete:
    "Indique el mercado, el año y el motor para filtrar el sitio con este carro.",
  vehicleSelectorLabel: "Su vehículo",
  vehicleSelectorIdle: "Está viendo todos los vehículos",
  vehicleSelectorOpen: "Elija su vehículo",
  vehicleSelectorChange: "Cambie de vehículo",
  vehicleSelectorPanelLabel: "¿Cuál carro tiene usted?",
  vehicleSelectorClear: "Olvide este vehículo",
  vehicleSelectorReset: "Limpiar",
  vehicleSelectorApply: "Guardar el vehículo",
  vehicleSelectorGenerationLabel: "Generación",
  vehicleSelectorMarketLabel: "Mercado",
  vehicleSelectorYearLabel: "Año",
  vehicleSelectorEngineLabel: "Motor",
  vehicleSelectorDriveLabel: "Tracción",
  vehicleSelectorDriveAny: "No lo he indicado",
  vehicleSelectorFilterNote:
    "Conforme usted elige, se descartan las combinaciones que la taxonomía da por inexistentes.",
  vehicleSelectorEnginesRecorded: "Registrados para esta combinación",
  vehicleSelectorEnginesUnrecorded: "Sin registrar — pudieron haber existido",
  vehicleSelectorNoEngines:
    "Todavía no hay ningún motor registrado para esa combinación.",
  vehicleFitCountTemplate: "{shown} de {total} le sirven a su carro",
  vehicleFilteredTag: "descartada",
  vehicleDoesNotFitLabel: "No le sirve al vehículo que usted eligió",
  vehicleProvisionalLabel: "Coincidencia provisional",
  vehicleProvisionalNote:
    "La coincidencia se hizo solo con generación, mercado, año y motor. Las fichas marcadas como provisionales dependen además de algún dato que usted no nos ha dado, así que algunas no le van a servir a su carro. Si afina su selección, la marca desaparece.",
  vehicleProvisionalDetailTemplate:
    "Esta ficha depende además de datos que usted no ha indicado: {facets}.",
  "drive.2wd": "Tracción sencilla",
  "drive.4wd": "Doble tracción",
  "fitmentFacet.transmission": "la transmisión",
  "fitmentFacet.transferCase": "la caja de transferencia",
  "fitmentFacet.trim": "el nivel de equipamiento",
  "fitmentFacet.drive": "la tracción",
};

export const ui: Record<Locale, UiStrings> = { en, es };

/** UI strings for `locale`. The only supported way for a component to get text. */
export function t(locale: Locale): UiStrings {
  return ui[locale];
}

/**
 * The label for a glossary system id. The only supported way to read one —
 * so the `glossarySystem.` key prefix exists in exactly one place.
 */
export function glossarySystemLabel(
  strings: UiStrings,
  system: GlossarySystem
): string {
  return strings[`glossarySystem.${system}`];
}

/** The label for a community type id — the only supported way to read one. */
function isTranslatableCommunityType(
  type: CommunityType
): type is TranslatableCommunityType {
  return (TRANSLATABLE_COMMUNITY_TYPES as readonly CommunityType[]).includes(
    type
  );
}

export function communityTypeLabel(
  strings: UiStrings,
  type: CommunityType
): string {
  return isTranslatableCommunityType(type)
    ? strings[`communityType.${type}`]
    : COMMUNITY_TYPE_BRAND_NAMES[type];
}

/** The label for an activity level id. */
export function communityActivityLabel(
  strings: UiStrings,
  level: ActivityLevel
): string {
  return strings[`communityActivity.${level}`];
}

/** The label for a generation id, in the short "Gen N" / "Generación N" form. */
export function generationLabel(strings: UiStrings, gen: GenerationId): string {
  return strings[`generation.${gen}`];
}

/** The label for a `DRIVE_TYPES` value — the selector's drive control. */
export function driveLabel(strings: UiStrings, drive: DriveType): string {
  return strings[`drive.${drive}`];
}

/**
 * The label for one facet the visitor may have left unanswered, as named by
 * `provisionalMatchFacets` in `src/lib/fitment/`.
 */
export function fitmentFacetLabel(
  strings: UiStrings,
  facet: OptionalSelectionFacet
): string {
  return strings[`fitmentFacet.${facet}`];
}

/** The label for a confidence tier id. */
export function confidenceTierLabel(
  strings: UiStrings,
  tier: ConfidenceTier
): string {
  return strings[`confidenceTier.${tier}`];
}

/**
 * The label for a `links[]` entry's kind: a bare platform proper noun
 * (`Facebook`, `Discord`) for the kinds `LINK_KIND_BRAND_NAMES` names, and
 * translated prose for the rest (`website`, `forum`, `map`) — see
 * `src/i18n/community-brand-names.ts` for why the two are split.
 */
function isTranslatableLinkKind(kind: LinkKind): kind is TranslatableLinkKind {
  return (TRANSLATABLE_LINK_KINDS as readonly LinkKind[]).includes(kind);
}

export function communityLinkKindLabel(
  strings: UiStrings,
  kind: LinkKind
): string {
  return isTranslatableLinkKind(kind)
    ? strings[`communityLinkKind.${kind}`]
    : LINK_KIND_BRAND_NAMES[kind];
}

/** Every locale's strings, for pages that are not scoped to one locale (404, root). */
export const allUi: readonly { locale: Locale; strings: UiStrings }[] =
  LOCALES.map((locale) => ({ locale, strings: ui[locale] }));
