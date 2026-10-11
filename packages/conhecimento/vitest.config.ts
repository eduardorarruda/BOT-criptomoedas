import { defineConfig } from "vitest/config";

// Testes de unidade: rodam sem Docker. O que só faz sentido contra o PostgreSQL de
// verdade (SQL e pgvector) fica em *.integracao.test.ts e no `test:integracao`.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    exclude: ["src/**/*.integracao.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/index.ts", "src/teste/**", "src/postgres/**"],
      thresholds: { lines: 90, functions: 90, branches: 85, statements: 90 },
    },
  },
});
