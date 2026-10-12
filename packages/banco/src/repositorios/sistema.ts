import { eq, sql } from "drizzle-orm";
import type { Db } from "../cliente.js";
import { decisoes, ordens, robos } from "../esquema/index.js";

/**
 * Consultas de sistema (sem RLS) que a API usa para decidir quem pode ver um
 * evento ao vivo: o evento do Redis não diz de quem é, então a API pergunta aqui.
 */
export function repositorioSistema(db: Db) {
  return {
    async donoDoRobo(roboId: string): Promise<string | null> {
      const [r] = await db.select({ u: robos.usuarioId }).from(robos).where(eq(robos.id, roboId));
      return r?.u ?? null;
    },

    async donoDaDecisao(decisaoId: string): Promise<string | null> {
      const [d] = await db.select({ u: decisoes.usuarioId }).from(decisoes).where(eq(decisoes.id, decisaoId));
      return d?.u ?? null;
    },

    async donoDaOrdem(ordemId: string): Promise<string | null> {
      const [o] = await db.select({ u: ordens.usuarioId }).from(ordens).where(eq(ordens.id, ordemId));
      return o?.u ?? null;
    },

    /** Nome, par e dona do robô: para o título dos alertas. */
    async descreverRobo(
      roboId: string,
    ): Promise<{ nome: string; simbolo: string; usuarioId: string } | null> {
      const [r] = await db
        .select({ nome: robos.nome, simbolo: robos.simbolo, usuarioId: robos.usuarioId })
        .from(robos)
        .where(eq(robos.id, roboId));
      return r ?? null;
    },

    /** Motivo gravado no sinal de venda ("stop", "alvo", "regra de saída", "ajuste"). */
    async motivoDaDecisao(decisaoId: string): Promise<string | null> {
      const [d] = await db
        .select({ motivo: sql<string | null>`${decisoes.sinal}->>'motivo'` })
        .from(decisoes)
        .where(eq(decisoes.id, decisaoId));
      return d?.motivo ?? null;
    },

    /** Lança se o banco não responder; quem chama decide como registrar. */
    async ping(): Promise<void> {
      await db.execute(sql`select 1`);
    },
  };
}

export type RepositorioSistema = ReturnType<typeof repositorioSistema>;
