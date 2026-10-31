import js from "@eslint/js";
import globals from "globals";

export default [
  {
    ignores: ["dist/**", "node_modules/**", "backups/**", "tmp/**", "uploads/**", "logs/**", "design-reference/**"],
  },
  {
    files: ["**/*.js", "**/*.cjs"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      ...js.configs.recommended.rules,
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
  {
    files: ["src/main.js"],
    rules: {
      // The current translation dictionary intentionally reapplies some labels; migrate it to keyed catalogs separately.
      "no-dupe-keys": "off",
    },
  },
  {
    files: ["server/index.js"],
    rules: {
      // These expressions reject control characters in untrusted PDF/device input.
      "no-control-regex": "off",
    },
  },
];
