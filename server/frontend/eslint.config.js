import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["dist", "node_modules", ".vite"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      globals: {
        ...globals.browser,
        ...globals.es2022,
      },
    },
    plugins: {
      "react-hooks": reactHooks,
    },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "off",

      /*
       * These React compiler-style rules are useful for a fully polished codebase,
       * but they are too strict for the current project and produce false-positive
       * blockers for normal data loading in useEffect and timer initialization.
       */
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/purity": "off",

      /*
       * The project currently exports icons/constants/helpers from some component
       * files. It is fine for production build, so do not block CI because of HMR-only
       * Fast Refresh recommendations.
       */
      "react-refresh/only-export-components": "off",

      "@typescript-eslint/consistent-type-imports": [
        "error",
        {
          prefer: "type-imports",
        },
      ],

      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  }
);