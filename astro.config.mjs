// @ts-check
import { defineConfig } from "astro/config";

// Static output (SCF-01). i18n routing/config lands in T102; this is the
// bare scaffold.
export default defineConfig({
  output: "static",
  site: "https://gitana-montero.example",
});
