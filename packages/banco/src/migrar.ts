import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

/** Migrações versionadas em packages/banco/drizzle (geradas pelo drizzle-kit + SQL manual). */
export const PASTA_MIGRACOES = fileURLToPath(new URL("../drizzle", import.meta.url));

/** Aplica as migrações pendentes, todas numa transação só: ou entram todas, ou nenhuma. */
export async function migrar(url: string): Promise<void> {
  const cliente = postgres(url, { max: 1, onnotice: () => undefined });
  try {
    await migrate(drizzle(cliente), { migrationsFolder: PASTA_MIGRACOES });
  } finally {
    await cliente.end({ timeout: 5 });
  }
}
