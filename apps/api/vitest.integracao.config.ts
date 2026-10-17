import { defineConfig } from "vitest/config";

// Testes das rotas contra PostgreSQL (timescaledb-ha) e Redis reais. Suba antes com infra/teste/subir.sh.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 120_000,
    env: {
      ZT_TESTE_BANCO_URL:
        process.env.ZT_TESTE_BANCO_URL ?? "postgres://postgres:teste-local@127.0.0.1:55440/postgres",
      ZT_TESTE_REDIS_URL: process.env.ZT_TESTE_REDIS_URL ?? "redis://127.0.0.1:56390",
    },
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: [
        "src/**/*.test.ts",
        "src/index.ts",
        "src/servidor.ts",
        // Os pontos de entrada só ligam banco e ambiente; a lógica está em comandos/*.ts ao lado.
        "src/comandos/criar-usuario.ts",
        "src/comandos/importar-conhecimento.ts",
        "src/comandos/reindexar-conhecimento.ts",
        "src/integracao/**",
      ],
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
  },
});
