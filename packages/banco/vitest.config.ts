import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    exclude: ["src/**/*.integracao.test.ts", "**/node_modules/**"],
    coverage: {
      provider: "v8",
      // Unidade cobre o código puro; repositórios e portas são medidos em test:integracao.
      include: [
        "src/cifra.ts",
        "src/calculos.ts",
        "src/curva-diaria.ts",
        "src/config.ts",
        "src/conversao.ts",
        "src/erros.ts",
      ],
      thresholds: { lines: 80, functions: 80, branches: 80, statements: 80 },
    },
  },
});
