import type { PortaRobos, RoboConfig } from "@zentrade/contratos";
import { and, eq, sql } from "drizzle-orm";
import type { Db } from "../cliente.js";
import { roboConfigDeLinha } from "../conversao.js";
import { configuracaoGlobal, estrategiaVersoes, robos } from "../esquema/index.js";

/** Visão do motor sobre os robôs: acesso de sistema (roda para todas as pessoas). */
export function portaRobos(db: Db): PortaRobos {
  return {
    async ativos(): Promise<RoboConfig[]> {
      const linhas = await db
        .select({ r: robos, v: estrategiaVersoes })
        .from(robos)
        .innerJoin(
          estrategiaVersoes,
          and(
            eq(estrategiaVersoes.estrategiaId, robos.estrategiaId),
            eq(estrategiaVersoes.versao, robos.estrategiaVersao),
          ),
        )
        .where(eq(robos.pausado, false));
      return linhas.map((l) => roboConfigDeLinha(l.r, l.v));
    },

    /** Lido do banco a cada decisão, sem cache. Robô que não existe conta como pausado. */
    async pausado(roboId: string): Promise<boolean> {
      const [r] = await db
        .select({
          pausado: sql<boolean>`${robos.pausado} or coalesce(${configuracaoGlobal.paradaTotal}, false)`,
        })
        .from(robos)
        .leftJoin(configuracaoGlobal, eq(configuracaoGlobal.usuarioId, robos.usuarioId))
        .where(eq(robos.id, roboId));
      return r?.pausado ?? true;
    },
  };
}
