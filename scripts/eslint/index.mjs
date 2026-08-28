/**
 * Local ESLint plugin for repo-specific constitution rules.
 * Kept in-repo (not published) so a rule and the code it governs move together.
 */
import noHardcodedUiText from "./no-hardcoded-ui-text.mjs";

/** @type {import("eslint").ESLint.Plugin} */
const plugin = {
  meta: { name: "gitana", version: "1.0.0" },
  rules: {
    "no-hardcoded-ui-text": noHardcodedUiText,
  },
};

export default plugin;
