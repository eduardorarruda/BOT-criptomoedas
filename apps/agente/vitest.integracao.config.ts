import { defineConfig } from "vitest/config";

// Precisa de PostgreSQL em ZT_TESTE_DATABASE_URL (padrão: porta 55441).
export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: [
        "src/**/*.test.ts",
        "src/index.ts",
        "src/teste/**",
        "src/principal.ts",
        "src/cli/bin.ts",
        "src/mcp/bin.ts",
        "src/ponte/bin.ts",
      ],
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
  },
});
