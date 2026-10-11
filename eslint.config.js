import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";

export default tseslint.config(
  { ignores: ["**/dist/**", "**/coverage/**", "**/node_modules/**", "infra/n8n/**", "index.js"] },
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
    files: ["**/*.test.ts", "**/*.test.tsx"],
    rules: { "@typescript-eslint/no-non-null-assertion": "off" },
  },
);
