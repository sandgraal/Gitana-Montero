/**
 * ESLint rule: no user-facing string may be hard-coded in a component (I18N-08).
 *
 * Every visible word has to come from the typed UI-strings module
 * (`src/i18n/ui.ts`) or from a content collection, because a string typed
 * directly into a template exists in exactly one language — which is the
 * failure mode "no page ships in one language" is meant to prevent
 * (AGENTS.md). Being a lint error rather than a review note means it is caught
 * on the first commit, not on the day someone tries to translate the site.
 *
 * What it flags in `.astro` templates:
 *   - text nodes containing a letter                 `<p>Hello</p>`
 *   - user-facing attributes with a literal value    `<img alt="A photo">`
 *
 * What it deliberately does not flag:
 *   - expressions, including string-producing ones — `{t(locale).navHome}`
 *   - text with no letters (punctuation, digits, separators, entities)
 *   - `<script>` / `<style>` contents (parsed as raw text, not markup)
 *   - non-user-facing attributes (`class`, `href`, `lang`, `id`, …)
 *
 * Escape hatch: an `eslint-disable-next-line` comment, which is visible in the
 * diff and has to be justified in review.
 */

/**
 * Attributes whose literal value is read aloud or shown to a person.
 *
 * `title` and `description` also cover the component-prop case — a layout
 * invoked as `<BaseLayout title="Home" description="…">` ships those straight
 * into `<title>` and `<meta name="description">`, in one language, with no
 * other rule to catch it.
 */
const USER_FACING_ATTRIBUTES = new Set([
  "alt",
  "aria-description",
  "aria-label",
  "aria-placeholder",
  "aria-roledescription",
  "aria-valuetext",
  "description",
  "placeholder",
  "title",
]);

const HTML_ENTITY = /&(?:#\d+|#x[0-9a-f]+|[a-z][a-z0-9]*);/gi;
const HAS_LETTER = /\p{L}/u;

/** True when `text` contains a word a human would read, ignoring entities. */
function containsHumanText(text) {
  return HAS_LETTER.test(text.replace(HTML_ENTITY, ""));
}

function attributeName(node) {
  const name = node.name;
  if (!name) return "";
  if (typeof name.name === "string") return name.name;
  // Namespaced attributes (`xlink:href`) carry a nested identifier.
  if (name.name && typeof name.name.name === "string") return name.name.name;
  return "";
}

/** @type {import("eslint").Rule.RuleModule} */
const rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow hard-coded user-facing strings in components; use the typed UI-strings module (I18N-08).",
    },
    schema: [],
    messages: {
      hardcodedText:
        'Hard-coded user-facing text "{{text}}". Move it to src/i18n/ui.ts and render it through t(locale) so it exists in both locales (I18N-08).',
      hardcodedAttribute:
        'Hard-coded user-facing text in the "{{attribute}}" attribute: "{{text}}". Move it to src/i18n/ui.ts and render it through t(locale) (I18N-08).',
    },
  },

  create(context) {
    return {
      JSXText(node) {
        const text = String(node.value ?? "").trim();
        if (text === "" || !containsHumanText(text)) return;
        context.report({
          node,
          messageId: "hardcodedText",
          data: { text: text.length > 40 ? `${text.slice(0, 40)}…` : text },
        });
      },

      JSXAttribute(node) {
        const name = attributeName(node);
        if (!USER_FACING_ATTRIBUTES.has(name.toLowerCase())) return;
        const value = node.value;
        if (!value || value.type !== "Literal") return;
        const text = String(value.value ?? "").trim();
        if (text === "" || !containsHumanText(text)) return;
        context.report({
          node: value,
          messageId: "hardcodedAttribute",
          data: {
            attribute: name,
            text: text.length > 40 ? `${text.slice(0, 40)}…` : text,
          },
        });
      },
    };
  },
};

export default rule;

/** Exported for the rule's own tests. */
export { USER_FACING_ATTRIBUTES, containsHumanText };
