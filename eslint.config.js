import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
// Fork mantido (es-tooling) do eslint-plugin-jsx-a11y, que ainda não aceita ESLint 10.
import jsxA11y from "eslint-plugin-jsx-a11y-x";

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/coverage/**",
      "**/node_modules/**",
      "infra/n8n/**",
      "index.js",
      "docs/pesquisa/**/scripts/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "no-console": ["error", { allow: ["warn", "error"] }],
      eqeqeq: ["error", "always"],
    },
  },
  {
    files: ["apps/web/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // A raiz do pacote leva node:crypto (assinatura dos webhooks); a tela usa o subcaminho.
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@zentrade/contratos",
              message: "Na tela, importe de @zentrade/contratos/esquemas (sem código de servidor).",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["apps/web/**/*.tsx"],
    ...jsxA11y.configs.strict,
    rules: {
      ...jsxA11y.configs.strict.rules,
      // role="list" em ul/ol sem marcador é de propósito: o Safari tira a semântica de lista.
      "jsx-a11y-x/no-redundant-roles": ["error", { ul: ["list"], ol: ["list"] }],
    },
  },
  {
    files: ["**/*.test.ts", "**/*.test.tsx"],
    rules: { "@typescript-eslint/no-non-null-assertion": "off" },
  },
);
