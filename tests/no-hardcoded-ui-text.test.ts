import { RuleTester, type Linter } from "eslint";
import * as astroParser from "astro-eslint-parser";
import { describe, it } from "vitest";
import rule from "../scripts/eslint/no-hardcoded-ui-text.mjs";

const ruleTester = new RuleTester({
  languageOptions: {
    parser: astroParser as unknown as Linter.Parser,
  },
});

describe("gitana/no-hardcoded-ui-text (I18N-08)", () => {
  it("flags hard-coded chrome text and passes translated markup", () => {
    ruleTester.run("no-hardcoded-ui-text", rule, {
      valid: [
        {
          filename: "src/components/Ok.astro",
          code: `---\nimport { t } from "../i18n/ui";\nconst s = t("en");\n---\n<p>{s.navHome}</p>`,
        },
        {
          // Punctuation, digits and separators are not translatable prose.
          filename: "src/components/Ok.astro",
          code: `---\nconst a = 1;\n---\n<p>{a} · 42 — ( )</p>`,
        },
        {
          // Non-user-facing attributes carry identifiers, not prose.
          filename: "src/components/Ok.astro",
          code: `---\n---\n<a class="brand" href="/en/" id="x" lang="en" data-locale-choice="en"></a>`,
        },
        {
          // Script and style bodies are code, not copy.
          filename: "src/components/Ok.astro",
          code: `---\n---\n<style>.a { color: red }</style>`,
        },
        {
          filename: "src/components/Ok.astro",
          code: `---\nconst label = "x";\n---\n<img alt={label} src="a.png" />`,
        },
      ],
      invalid: [
        {
          filename: "src/components/Bad.astro",
          code: `---\n---\n<p>Skip to content</p>`,
          errors: [{ messageId: "hardcodedText" }],
        },
        {
          filename: "src/components/Bad.astro",
          code: `---\n---\n<title>Gitana — reference</title>`,
          errors: [{ messageId: "hardcodedText" }],
        },
        {
          filename: "src/components/Bad.astro",
          code: `---\n---\n<img alt="A photo of the truck" src="a.png" />`,
          errors: [{ messageId: "hardcodedAttribute" }],
        },
        {
          filename: "src/components/Bad.astro",
          code: `---\n---\n<button aria-label="Close">×</button>`,
          errors: [{ messageId: "hardcodedAttribute" }],
        },
        {
          // The component-prop bypass: BaseLayout renders `description` into
          // <meta name="description">, so a literal here ships EN-only copy.
          filename: "src/pages/Bad.astro",
          code: `---\nimport BaseLayout from "../layouts/BaseLayout.astro";\n---\n<BaseLayout locale="en" description="An English-only summary." />`,
          errors: [{ messageId: "hardcodedAttribute" }],
        },
        {
          filename: "src/pages/Bad.astro",
          code: `---\nimport BaseLayout from "../layouts/BaseLayout.astro";\n---\n<BaseLayout title="Home" />`,
          errors: [{ messageId: "hardcodedAttribute" }],
        },
        {
          filename: "src/components/Bad.astro",
          code: `---\nconst x = 1;\n---\n<p>Total: {x} items</p>`,
          errors: [
            { messageId: "hardcodedText" },
            { messageId: "hardcodedText" },
          ],
        },
      ],
    });
  });
});
