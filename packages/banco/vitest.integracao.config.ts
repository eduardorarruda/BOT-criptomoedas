import { defineConfig } from "vitest/config";

// Testes contra PostgreSQL real (timescaledb-ha). Suba antes com infra/teste/subir.sh.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 120_000,
    env: {
      ZT_TESTE_BANCO_URL:
        process.env.ZT_TESTE_BANCO_URL ?? "postgres://postgres:teste-local@127.0.0.1:55440/postgres",
    },
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/index.ts", "src/**/index.ts", "src/comandos/**"],
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
  },
});
