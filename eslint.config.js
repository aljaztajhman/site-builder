import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: [".claude/**", "**/node_modules/**", "**/dist/**", "eval/**", ".data/**", "**/assets/**", "apps/web/src/ui/examples/**", ".worktrees/**", "coverage/**", "test-results/**", "playwright-report/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Plain browser scripts shipped on every published site (no build step).
    files: ["packages/components/islands/**/*.js"],
    languageOptions: {
      sourceType: "script",
      globals: Object.fromEntries(
        ["window", "document", "location", "localStorage", "fetch", "FormData", "URLSearchParams", "Element", "Node", "HTMLDialogElement", "HTMLElement", "HTMLAnchorElement", "HTMLScriptElement", "URL", "matchMedia", "setTimeout", "clearTimeout", "requestAnimationFrame", "console", "navigator"].map((g) => [g, "readonly"]),
      ),
    },
  },
  {
    // Plain browser scripts the dashboard serves as they are (no bundle), e.g. the landing's js-flag.js.
    files: ["apps/web/src/ui/*.js"],
    languageOptions: { sourceType: "script", globals: { document: "readonly" } },
  },
  {
    // Plain Node scripts that run without a build (the morph example's static server).
    files: ["packages/morph/examples/*.mjs"],
    languageOptions: { globals: { process: "readonly", console: "readonly", URL: "readonly" } },
  },
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/consistent-type-imports": "error",
      "no-console": "off",
    },
  },
);
