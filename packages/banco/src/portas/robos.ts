import type { PortaRobos, RoboConfig } from "@zentrade/contratos";
import { and, eq, or, sql } from "drizzle-orm";
import type { Db } from "../cliente.js";
import { roboConfigDeLinha } from "../conversao.js";
import {
  configuracaoGlobal,
  estrategiaVersoes,
  execucoes,
  ordens,
  protecoesCorretora,
  robos,
} from "../esquema/index.js";

/**
 * O robô tem posição aberta (compras menos vendas executadas > 0), ordem de estado
 * incerto (PENDENTE: pode ter executado) ou proteção viva na corretora. Robô pausado
 * assim segue ligado: o stop dele continua vigiado e a partida reconcilia a ordem
 * (ADR 007); a pausa só barra entradas e saídas pela regra, no risco.
 */
const comPosicaoAberta = sql`(exists (
  select 1 from ${ordens} o join ${execucoes} e on e.ordem_id = o.id
  where o.robo_id = ${robos.id}
  having sum(case when o.lado = 'COMPRA' then e.quantidade else -e.quantidade end) > 0)
  or exists (select 1 from ${ordens} o where o.robo_id = ${robos.id} and o.estado = 'PENDENTE')
  or exists (select 1 from ${protecoesCorretora} p where p.robo_id = ${robos.id} and p.estado in ('PENDENTE', 'ATIVA')))`;

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
        .where(or(eq(robos.pausado, false), comPosicaoAberta));
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
