import { paraTexto } from "@zentrade/dominio";
import { count, eq, sql } from "drizzle-orm";
import { inicioDoDiaUtc, resumirCarteira } from "../calculos.js";
import { comoUsuario, type Db } from "../cliente.js";
import { decimalTexto, iso } from "../conversao.js";
import { configuracaoGlobal, decisoes, robos } from "../esquema/index.js";
import { execucoesPorRobo } from "./execucoes.js";

export interface Resumo {
  readonly resultadoHoje: string;
  readonly exposicao: string;
  readonly maiorQueda30d: string;
  readonly robosAtivos: number;
  readonly custoIaHoje: string;
  readonly paradaTotal: boolean;
}

const TRINTA_DIAS_MS = 30 * 86_400_000;

/** O painel inicial. "Hoje" é o dia UTC, como os instantes do contrato. */
export function repositorioResumo(db: Db) {
  return {
    resumo: (usuarioId: string, agora: number): Promise<Resumo> =>
      comoUsuario(db, usuarioId, async (tx) => {
        const inicioDia = inicioDoDiaUtc(agora);
        const carteira = resumirCarteira(await execucoesPorRobo(tx), {
          inicioDia,
          inicioJanela: agora - TRINTA_DIAS_MS,
        });
        const [ativos] = await tx.select({ n: count() }).from(robos).where(eq(robos.pausado, false));
        const [custo] = await tx
          .select({ total: sql<string>`coalesce(sum(${decisoes.custoIaUsd}), 0)::text` })
          .from(decisoes)
          .where(sql`${decisoes.em} >= ${iso(inicioDia)}::timestamptz`);
        const [config] = await tx.select({ ligada: configuracaoGlobal.paradaTotal }).from(configuracaoGlobal);
        return {
          resultadoHoje: paraTexto(carteira.resultadoHoje),
          exposicao: paraTexto(carteira.exposicao),
          maiorQueda30d: paraTexto(carteira.maiorQueda),
          robosAtivos: ativos?.n ?? 0,
          custoIaHoje: decimalTexto(custo?.total ?? "0"),
          paradaTotal: config?.ligada ?? false,
        };
      }),
  };
}

export type RepositorioResumo = ReturnType<typeof repositorioResumo>;
