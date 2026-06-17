import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import prettier from "eslint-config-prettier";
import globals from "globals";

export default tseslint.config(
  // Ignore build output, deps, and generated/vendored UI primitives.
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      "client/src/components/ui/**", // shadcn/ui generated primitives
      "client/src/hooks/use-toast.ts", // shadcn/ui generated hook
      "*.config.js",
      "*.config.ts",
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  // Browser (client) source
  {
    files: ["client/**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
    },
  },

  // Node (server / shared / scripts) source
  {
    files: ["server/**/*.ts", "shared/**/*.ts", "script/**/*.ts"],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.node,
    },
  },

  // Project-wide rule tuning. The codebase intentionally uses `any` at the
  // DB-row boundary (node:sqlite returns untyped rows), so downgrade that to a
  // warning rather than failing CI on it.
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },

  // Disable formatting-related lint rules; Prettier owns formatting.
  prettier,
);
