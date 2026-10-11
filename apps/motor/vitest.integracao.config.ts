import { defineConfig } from "vitest/config";

// Motor contra PostgreSQL (timescaledb-ha) e Redis reais. Suba antes com infra/teste/subir.sh.
export default defineConfig({
  test: {
    include: ["src/**/*.integracao.test.ts"],
    testTimeout: 60_000,
    hookTimeout: 120_000,
    fileParallelism: false,
    env: {
      ZT_TESTE_BANCO_URL:
        process.env.ZT_TESTE_BANCO_URL ?? "postgres://postgres:teste-local@127.0.0.1:55440/postgres",
      ZT_TESTE_REDIS_URL: process.env.ZT_TESTE_REDIS_URL ?? "redis://127.0.0.1:56390",
    },
    coverage: {
      provider: "v8",
      // O que só a integração exercita de verdade: portas do banco/Redis e a fila.
      include: ["src/backtest/fila.ts"],
      thresholds: { lines: 80, functions: 80, branches: 70, statements: 80 },
    },
  },
});
