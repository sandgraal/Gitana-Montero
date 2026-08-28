/**
 * `site` guard.
 *
 * `hreflang`, `x-default` and `canonical` are only useful to search engines as
 * absolute URLs, which means they depend on `site` in `astro.config.mjs`. If
 * that is ever unset the site still builds, but the links degrade to
 * root-relative — so the build says so loudly, once, instead of shipping
 * silently-degraded SEO metadata.
 */

let warned = false;

export function warnIfSiteUnset(
  site: URL | undefined,
  pathname: string
): boolean {
  if (site) return false;
  if (!warned) {
    warned = true;
    console.warn(
      `[i18n] astro.config.mjs has no \`site\`. hreflang/canonical links fall ` +
        `back to root-relative URLs (first seen at ${pathname}). Search engines ` +
        `require absolute hreflang URLs — set \`site\` before deploying.`
    );
  }
  return true;
}

/** Test seam: reset the once-only warning latch. */
export function resetSiteWarning(): void {
  warned = false;
}
