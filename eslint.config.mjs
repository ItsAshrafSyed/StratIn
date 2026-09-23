import js from "@eslint/js";
import { FlatCompat } from "@eslint/eslintrc";
import nextPlugin from "@next/eslint-plugin-next";
import { defineConfig, globalIgnores } from "eslint/config";
import prettier from "eslint-config-prettier/flat";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import tseslint from "typescript-eslint";

const rootDirectory = dirname(fileURLToPath(import.meta.url));
const compatibility = new FlatCompat({
  baseDirectory: rootDirectory,
  recommendedConfig: js.configs.recommended,
});
const nextConfigs = compatibility
  .extends("next/core-web-vitals", "next/typescript")
  .map((config) => ({
    ...config,
    files: ["apps/web/**/*.{js,jsx,ts,tsx}"],
  }));

export default defineConfig([
  globalIgnores([
    "**/node_modules/**",
    "**/.next/**",
    "**/dist/**",
    "**/coverage/**",
    "**/*.tsbuildinfo",
    ".anchor/**",
    "target/**",
    "packages/db/drizzle/**",
    "apps/web/next-env.d.ts",
  ]),
  {
    ...js.configs.recommended,
    files: ["**/*.{js,mjs,cjs}"],
  },
  ...tseslint.configs.recommended.map((config) => ({
    ...config,
    files: ["**/*.{ts,tsx,mts,cts}"],
  })),
  {
    files: ["**/*.{js,mjs,cjs,ts,tsx,mts,cts}"],
    rules: {
      curly: ["error", "all"],
      eqeqeq: ["error", "always", { null: "ignore" }],
      "no-duplicate-imports": "error",
      "no-else-return": "error",
      "no-unneeded-ternary": "error",
      "object-shorthand": "error",
      "prefer-const": "error",
    },
  },
  ...nextConfigs,
  {
    files: ["apps/web/**/*.{js,jsx,ts,tsx}"],
    plugins: {
      "@next/next": nextPlugin,
    },
    rules: nextPlugin.configs["core-web-vitals"].rules,
  },
  {
    files: ["**/*.{ts,tsx,mts,cts}"],
    rules: {
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { fixStyle: "inline-type-imports" },
      ],
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],
    },
  },
  {
    files: ["apps/web/**/*.{js,jsx,ts,tsx}"],
    rules: {
      // This project uses only the App Router, so there is no pages directory
      // for this legacy rule to inspect.
      "@next/next/no-html-link-for-pages": "off",
      // Token icons are dynamic URLs from the reviewed asset allowlist. Using
      // next/image would require rebuilding remote host configuration whenever
      // a reviewed issuer is added.
      "@next/next/no-img-element": "off",
    },
  },
  prettier,
]);
