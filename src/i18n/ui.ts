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

export interface UiStrings extends GlossarySystemStrings {
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

/** Every locale's strings, for pages that are not scoped to one locale (404, root). */
export const allUi: readonly { locale: Locale; strings: UiStrings }[] =
  LOCALES.map((locale) => ({ locale, strings: ui[locale] }));
