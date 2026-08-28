// @ts-check
import { defineConfig } from "astro/config";

// Static output (SCF-01). i18n routing/config lands in T102; this is the
// bare scaffold. `site` is left unset until T106 knows the real domain —
// T102's hreflang generation should not build on a placeholder.
export default defineConfig({
  output: "static",
});
