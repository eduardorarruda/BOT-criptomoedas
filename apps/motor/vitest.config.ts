import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    exclude: ["src/**/*.integracao.test.ts", "**/node_modules/**"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      // main.ts só liga as peças (testadas uma a uma) ao processo; fila.ts é o Worker do
      // BullMQ, medido no test:integracao contra um Redis de verdade.
      exclude: [
        "src/**/*.test.ts",
        "src/main.ts",
        "src/index.ts",
        "src/teste/**",
        "src/integracao/**",
        "src/backtest/fila.ts",
      ],
      thresholds: { lines: 85, functions: 85, branches: 80, statements: 85 },
    },
  },
});
