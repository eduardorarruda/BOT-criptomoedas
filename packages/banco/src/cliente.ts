import { sql } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { z } from "zod";
import * as esquema from "./esquema/index.js";

export type Db = PostgresJsDatabase<typeof esquema>;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
/** Banco ou transação: os repositórios aceitam os dois. */
export type Executor = Db | Tx;

export interface Conexao {
  readonly db: Db;
  readonly sql: postgres.Sql;
  fechar(): Promise<void>;
}

export interface OpcoesConexao {
  readonly maximo?: number;
  /** Avisos do PostgreSQL (NOTICE). Por padrão são descartados: o postgres.js os jogaria no console. */
  readonly aoAviso?: (mensagem: string) => void;
}

export function conectar(url: string, opcoes: OpcoesConexao = {}): Conexao {
  const cliente = postgres(url, {
    max: opcoes.maximo ?? 10,
    onnotice: (aviso) => opcoes.aoAviso?.(String(aviso.message)),
  });
  const db = drizzle(cliente, { schema: esquema });
  return { db, sql: cliente, fechar: () => cliente.end({ timeout: 5 }) };
}

const UsuarioId = z.uuid("o id da pessoa precisa ser um UUID");

/**
 * Roda `fn` em uma transação como a pessoa: troca para o papel zentrade_app (sem
 * BYPASSRLS) e grava app.usuario_id, então as policies de RLS filtram tudo. Mesmo um
 * bug que esqueça o `where usuario_id = ...` não vaza dado de outra pessoa.
 */
export async function comoUsuario<T>(db: Db, usuarioId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  const id = UsuarioId.parse(usuarioId);
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.usuario_id', ${id}, true)`);
    await tx.execute(sql`set local role zentrade_app`);
    return fn(tx);
  });
}
