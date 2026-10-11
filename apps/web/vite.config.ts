import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

/**
 * A tela importa só `@zentrade/contratos/esquemas`, que não tem código de servidor
 * (node:crypto fica na assinatura dos webhooks, fora desse subcaminho).
 */
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // ZENTRADE_API_ALVO aponta a tela de desenvolvimento para outra API (ex.: http://127.0.0.1:8095).
      "/api": { target: process.env.ZENTRADE_API_ALVO ?? "http://localhost:8080", changeOrigin: false, ws: true },
    },
  },
  build: { target: "es2023", sourcemap: true },
  test: {
    environment: "jsdom",
    // Testes de interação (teclado, arrastar) passam de 5 s quando o turbo roda todos os pacotes juntos.
    testTimeout: 20_000,
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
      exclude: ["src/**/*.test.{ts,tsx}"],
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
  },
});
