import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    exclude: ["src/**/*.integracao.test.ts", "**/node_modules/**"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      // Rotas e o servidor são medidos em test:integracao (precisam de PostgreSQL e Redis).
      exclude: [
        "src/**/*.test.ts",
        "src/index.ts",
        "src/servidor.ts",
        "src/app.ts",
        "src/rotas/**",
        "src/autenticacao/**",
        "src/comandos/**",
        "src/integracao/**",
        "src/integracoes/redis.ts",
        "src/integracoes/fila.ts",
      ],
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
  },
});
