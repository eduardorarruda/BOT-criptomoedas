import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      // main.ts só liga as peças (testadas uma a uma) ao processo.
      exclude: ["src/**/*.test.ts", "src/main.ts", "src/index.ts", "src/teste/**"],
      thresholds: { lines: 85, functions: 85, branches: 80, statements: 85 },
    },
  },
});
