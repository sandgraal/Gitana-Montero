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
import type { GenerationId } from "../schemas/vehicles";
import {
  LINK_KIND_BRAND_NAMES,
  TRANSLATABLE_LINK_KINDS,
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
 * One flat key per community type (T703a's type chip), same rationale as
 * {@link GlossarySystemStrings}: derived from `COMMUNITY_TYPES` so a new type
 * with no translation is a type error, not a chip that silently shows nothing.
 */
export type CommunityTypeStrings = {
  readonly [Type in CommunityType as `communityType.${Type}`]: string;
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

/** One flat key per `GENERATION_IDS` value (T703a's generation filter pills). */
export type CommunityGenerationStrings = {
  readonly [Gen in GenerationId as `communityGeneration.${Gen}`]: string;
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
    CommunityGenerationStrings,
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
  "communityType.subreddit": "Subreddit",
  "communityType.facebook-group": "Facebook group",
  "communityType.whatsapp-group": "WhatsApp group",
  "communityType.telegram-group": "Telegram group",
  "communityType.discord": "Discord server",
  "communityType.club": "Club",
  "communityType.youtube-channel": "YouTube channel",
  "communityType.vendor": "Vendor",
  "communityType.shop": "Shop",
  "communityActivity.very-active": "Very active",
  "communityActivity.active": "Active",
  "communityActivity.quiet": "Quiet",
  "communityActivity.dormant": "Dormant",
  "communityActivity.archived": "Archived",
  "communityLinkKind.website": "Website",
  "communityLinkKind.forum": "Forum",
  "communityLinkKind.map": "Map",
  "communityGeneration.gen1": "Gen 1",
  "communityGeneration.gen2": "Gen 2",
  "communityGeneration.gen2-5": "Gen 2.5",
  "communityGeneration.gen3": "Gen 3",
  "communityGeneration.gen4": "Gen 4",
  "confidenceTier.fsm-confirmed": "Confirmed in the Factory Service Manual",
  "confidenceTier.tsb": "Technical service bulletin",
  "confidenceTier.community-consensus": "Community consensus",
  "confidenceTier.first-hand": "First-hand read",
  "confidenceTier.anecdotal": "Anecdotal",
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
    "Foros, grupos, tiendas y canales para dueños de Montero, Pajero y Shogun. Las comunidades costarricenses y de habla hispana aparecen como fichas de primera clase, no como un apéndice.",
  communityFilterRegionLabel: "Filtre por región",
  communityFilterRegionAll: "Todas las regiones",
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
    "Nivel de confianza: {tier}. Esta ficha no se comparó con un manual de fábrica ni un boletín técnico — tómela como punto de partida, no como un dato verificado.",
  "communityType.forum": "Foro",
  "communityType.subreddit": "Comunidad en Reddit",
  "communityType.facebook-group": "Grupo de Facebook",
  "communityType.whatsapp-group": "Grupo de WhatsApp",
  "communityType.telegram-group": "Grupo de Telegram",
  "communityType.discord": "Servidor de Discord",
  "communityType.club": "Club de dueños",
  "communityType.youtube-channel": "Canal de YouTube",
  "communityType.vendor": "Proveedor",
  "communityType.shop": "Tienda",
  "communityActivity.very-active": "Muy activo",
  "communityActivity.active": "Activo",
  "communityActivity.quiet": "Poca actividad",
  "communityActivity.dormant": "Inactivo",
  "communityActivity.archived": "Archivado",
  "communityLinkKind.website": "Sitio web",
  "communityLinkKind.forum": "Foro",
  "communityLinkKind.map": "Mapa",
  "communityGeneration.gen1": "Generación 1",
  "communityGeneration.gen2": "Generación 2",
  "communityGeneration.gen2-5": "Generación 2.5",
  "communityGeneration.gen3": "Generación 3",
  "communityGeneration.gen4": "Generación 4",
  "confidenceTier.fsm-confirmed": "Confirmado en el manual de fábrica (FSM)",
  "confidenceTier.tsb": "Boletín técnico de servicio (TSB)",
  "confidenceTier.community-consensus": "Consenso de la comunidad",
  "confidenceTier.first-hand": "Lectura de primera mano",
  "confidenceTier.anecdotal": "Anecdótico",
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
export function communityTypeLabel(
  strings: UiStrings,
  type: CommunityType
): string {
  return strings[`communityType.${type}`];
}

/** The label for an activity level id. */
export function communityActivityLabel(
  strings: UiStrings,
  level: ActivityLevel
): string {
  return strings[`communityActivity.${level}`];
}

/** The label for a generation id, in T703a's short "Gen N" / "Generación N" form. */
export function communityGenerationLabel(
  strings: UiStrings,
  gen: GenerationId
): string {
  return strings[`communityGeneration.${gen}`];
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
