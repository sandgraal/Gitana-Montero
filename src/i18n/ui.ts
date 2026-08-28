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
 * This module holds *only* prose. Locale-independent values (URLs, native
 * language names, numbers) belong in `src/site.ts` or `src/i18n/routing.ts`
 * so a fact is never stored twice.
 */

import { LOCALES, type Locale } from "./routing";

export interface UiStrings {
  readonly siteName: string;
  readonly siteTagline: string;
  readonly skipToContent: string;
  readonly navHome: string;
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
  readonly notFoundTitle: string;
  readonly notFoundMessage: string;
  readonly notFoundHomeLink: string;
  readonly rootRedirectTitle: string;
  readonly rootRedirectMessage: string;
  readonly rootRedirectManual: string;
}

const en: UiStrings = {
  siteName: "Gitana",
  siteTagline: "Montero, Pajero and Shogun reference and build log",
  skipToContent: "Skip to content",
  navHome: "Home",
  navLabel: "Main",
  languageLabel: "Language",
  languageSwitcherLabel: "Choose a language",
  languageCurrent: "Current language",
  homeHeading: "Montero, Pajero and Shogun — reference and build log",
  homeIntro:
    "This site is the complete build log of one 2002 Mitsubishi Montero and a reference for every generation, in English and Costa Rican Spanish.",
  homeStatus:
    "Under construction: the bilingual platform is in place, the reference content lands next.",
  footerSourceLabel: "Source code on GitHub",
  footerIssuesLabel: "Report a problem or correct a fact",
  footerDisclaimer:
    "Reference material only. For safety-critical work, consult a qualified mechanic.",
  notFoundTitle: "Page not found",
  notFoundMessage: "That page does not exist, or it has moved.",
  notFoundHomeLink: "Go to the home page",
  rootRedirectTitle: "Choose a language",
  rootRedirectMessage: "Sending you to your language…",
  rootRedirectManual: "If nothing happens, choose a language:",
};

const es: UiStrings = {
  siteName: "Gitana",
  siteTagline: "Referencia y bitácora del Montero, Pajero y Shogun",
  skipToContent: "Saltar al contenido",
  navHome: "Inicio",
  navLabel: "Principal",
  languageLabel: "Idioma",
  languageSwitcherLabel: "Elija un idioma",
  languageCurrent: "Idioma actual",
  homeHeading: "Montero, Pajero y Shogun — referencia y bitácora",
  homeIntro:
    "Este sitio es la bitácora completa de un Mitsubishi Montero 2002 y una referencia para todas las generaciones, en inglés y en español de Costa Rica.",
  homeStatus:
    "En construcción: la plataforma bilingüe ya está lista y el contenido de referencia viene después.",
  footerSourceLabel: "Código fuente en GitHub",
  footerIssuesLabel: "Reporte un problema o corrija un dato",
  footerDisclaimer:
    "Material de referencia únicamente. Para trabajos críticos de seguridad, consulte a un mecánico calificado.",
  notFoundTitle: "Página no encontrada",
  notFoundMessage: "Esa página no existe o fue movida.",
  notFoundHomeLink: "Ir a la página de inicio",
  rootRedirectTitle: "Elija un idioma",
  rootRedirectMessage: "Le estamos llevando a su idioma…",
  rootRedirectManual: "Si no pasa nada, elija un idioma:",
};

export const ui: Record<Locale, UiStrings> = { en, es };

/** UI strings for `locale`. The only supported way for a component to get text. */
export function t(locale: Locale): UiStrings {
  return ui[locale];
}

/** Every locale's strings, for pages that are not scoped to one locale (404, root). */
export const allUi: readonly { locale: Locale; strings: UiStrings }[] =
  LOCALES.map((locale) => ({ locale, strings: ui[locale] }));
