/**
 * @vitest-environment jsdom
 *
 * I18N-03's named behaviour — "WHEN a visitor uses the locale switcher, THE
 * site SHALL persist the choice" — through a real DOM: a real anchor carrying
 * `data-locale-choice`, a real click, the delegated listener, real storage.
 * The pure-logic tests live in `locale-preference.test.ts`; this one exists to
 * catch the wiring between them breaking.
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  LOCALE_COOKIE_NAME,
  LOCALE_STORAGE_KEY,
  rememberLocaleFromClick,
} from "./locale-preference";

function clearCookies(): void {
  for (const part of document.cookie.split(";")) {
    const name = part.split("=")[0]?.trim();
    if (name) document.cookie = `${name}=; path=/; max-age=0`;
  }
}

function click(element: Element): void {
  element.dispatchEvent(
    new window.MouseEvent("click", { bubbles: true, cancelable: true })
  );
}

beforeEach(() => {
  window.localStorage.clear();
  clearCookies();
  document.body.innerHTML = "";
});

// The links are real anchors with real hrefs, which is the point — but jsdom
// cannot navigate, so swallow the default action and keep the output clean.
// Registered once, in the bubble phase after the module's own listener.
document.addEventListener("click", (event) => event.preventDefault());

describe("rememberLocaleFromClick (I18N-03)", () => {
  it("persists the locale when a switcher link is clicked", () => {
    document.body.innerHTML = `
      <a href="/en/" data-locale-choice="en">English</a>
      <a href="/es/" data-locale-choice="es">Español</a>
    `;
    rememberLocaleFromClick(document);

    click(document.querySelector('[data-locale-choice="es"]')!);

    expect(window.localStorage.getItem(LOCALE_STORAGE_KEY)).toBe("es");
    expect(document.cookie).toContain(`${LOCALE_COOKIE_NAME}=es`);
  });

  it("works when the click lands on a child of the link, not the link itself", () => {
    document.body.innerHTML = `<a href="/es/" data-locale-choice="es"><span id="inner">Español</span></a>`;
    rememberLocaleFromClick(document);

    click(document.querySelector("#inner")!);

    expect(window.localStorage.getItem(LOCALE_STORAGE_KEY)).toBe("es");
  });

  it("records the most recent choice when the visitor switches twice", () => {
    document.body.innerHTML = `
      <a href="/en/" data-locale-choice="en">English</a>
      <a href="/es/" data-locale-choice="es">Español</a>
    `;
    rememberLocaleFromClick(document);

    click(document.querySelector('[data-locale-choice="es"]')!);
    click(document.querySelector('[data-locale-choice="en"]')!);

    expect(window.localStorage.getItem(LOCALE_STORAGE_KEY)).toBe("en");
    expect(document.cookie).toContain(`${LOCALE_COOKIE_NAME}=en`);
  });

  it("ignores ordinary links, so normal navigation never rewrites the choice", () => {
    document.body.innerHTML = `<a href="/en/garage/" id="plain">Garage</a>`;
    rememberLocaleFromClick(document);

    click(document.querySelector("#plain")!);

    expect(window.localStorage.getItem(LOCALE_STORAGE_KEY)).toBeNull();
    expect(document.cookie).not.toContain(LOCALE_COOKIE_NAME);
  });

  it("ignores an unsupported locale value rather than storing it", () => {
    document.body.innerHTML = `<a href="/fr/" data-locale-choice="fr">Français</a>`;
    rememberLocaleFromClick(document);

    click(document.querySelector("[data-locale-choice]")!);

    expect(window.localStorage.getItem(LOCALE_STORAGE_KEY)).toBeNull();
  });

  it("is delegated, so it covers links added after the listener was attached", () => {
    rememberLocaleFromClick(document);
    document.body.innerHTML = `<a href="/es/" data-locale-choice="es">Español</a>`;

    click(document.querySelector("[data-locale-choice]")!);

    expect(window.localStorage.getItem(LOCALE_STORAGE_KEY)).toBe("es");
  });
});
