import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

/**
 * O @zentrade/contratos reexporta a assinatura dos webhooks, que usa node:crypto.
 * A tela nunca assina nada: o stub troca o módulo por funções que recusam, e o
 * navegador não carrega código de servidor.
 */
const stubCrypto = fileURLToPath(new URL("./src/lib/stub-crypto.ts", import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "node:crypto": stubCrypto } },
  server: {
    port: 5173,
    proxy: {
      "/api": { target: "http://localhost:8080", changeOrigin: false, ws: true },
    },
  },
  build: { target: "es2023", sourcemap: true },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/teste/preparar.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    css: false,
    coverage: {
      provider: "v8",
      include: [
        "src/lib/**/*.ts",
        "src/api/**/*.ts",
        "src/construtor/**/*.ts",
        "src/ganchos/**/*.ts",
        "src/demo/**/*.ts",
        "src/componentes/graficos/velas.ts",
      ],
      exclude: ["src/**/*.test.{ts,tsx}", "src/lib/stub-crypto.ts"],
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
  },
});
