import { defineConfig } from "drizzle-kit";

// Só gera SQL a partir do esquema; não conecta no banco.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/esquema/index.ts",
  out: "./drizzle",
});
