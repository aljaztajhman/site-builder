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
        ["window", "document", "location", "localStorage", "fetch", "FormData", "URLSearchParams", "Element", "Node", "HTMLDialogElement", "HTMLElement", "HTMLAnchorElement", "matchMedia", "setTimeout", "clearTimeout", "requestAnimationFrame", "console"].map((g) => [g, "readonly"]),
      ),
    },
  },
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/consistent-type-imports": "error",
      "no-console": "off",
    },
  },
);
