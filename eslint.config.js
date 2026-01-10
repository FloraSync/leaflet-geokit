// ESLint v9 flat config
import js from "@eslint/js";
import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import globals from "globals";

export default [
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      "coverage/**",
      "test-results/**",
      "playwright-report/**",
      ".npm-cache/**",
      ".letta/**",
      "test-data/**",
    ],
  },
  js.configs.recommended,
  {
    files: ["**/*.{ts,tsx,js,jsx}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parser: tsParser,
      parserOptions: {
        project: false,
      },
      globals: {
        ...globals.browser,
        ...globals.es2021,
        Console: "readonly",
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
    },
    rules: {
      // Disable base JS rules in favor of TypeScript-specific rules
      "no-undef": "off",
      "no-unused-vars": "off",
      // "no-empty": ["error", { allowEmptyCatch: true }], // Allow empty catch blocks

      // TypeScript-specific rules
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports" },
      ],
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_" },
      ],
      "no-console": "off",
    },
  },
  {
    files: ["**/*.{test,spec}.ts", "**/vitest.config.ts"],
    languageOptions: {
      globals: {
        // Vitest globals
        describe: "readonly",
        it: "readonly",
        expect: "readonly",
        beforeAll: "readonly",
        vi: "readonly",
      },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
  {
    files: [
      "scripts/**/*.{ts,js}",
      "**/*.config.{ts,js,cjs,mjs}",
      "vite.config.ts",
      "vitest.config.ts",
      "eslint.config.js",
    ],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
];
