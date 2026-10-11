import { defineConfig } from "vitest/config";

// Testes de unidade: sem rede e sem Docker (o cliente da Anthropic recebe um fetch falso).
// O que precisa do PostgreSQL fica em *.integracao.test.ts e roda no `test:integracao`.
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    exclude: ["src/**/*.integracao.test.ts"],
    // Os testes do Claude Code de mentira iniciam processos Node: sob carga passam de 5 s.
    testTimeout: 30_000,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: [
        "src/**/*.test.ts",
        "src/index.ts",
        "src/teste/**",
        "src/postgres/**",
        "src/principal.ts",
        "src/cli/bin.ts",
        "src/mcp/bin.ts",
        "src/ponte/bin.ts",
      ],
      thresholds: { lines: 85, functions: 85, branches: 80, statements: 85 },
    },
  },
});
