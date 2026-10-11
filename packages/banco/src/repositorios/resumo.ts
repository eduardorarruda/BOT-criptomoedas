import { paraTexto } from "@zentrade/dominio";
import { count, eq, sql } from "drizzle-orm";
import { inicioDoDiaUtc, resumirCarteira } from "../calculos.js";
import { comoUsuario, type Db } from "../cliente.js";
import { curvaDiaria, DIA_MS, taxasDesde } from "../curva-diaria.js";
import { decimalTexto, iso } from "../conversao.js";
import { configuracaoGlobal, decisoes, robos } from "../esquema/index.js";
import { execucoesPorRobo } from "./execucoes.js";

export interface Resumo {
  readonly resultadoHoje: string;
  readonly exposicao: string;
  readonly maiorQueda30d: string;
  readonly robosAtivos: number;
  readonly custoIaHoje: string;
  readonly taxasHoje: string;
  readonly paradaTotal: boolean;
}

export interface PontoPatrimonio {
  readonly em: number;
  readonly valor: string;
}

const TRINTA_DIAS_MS = 30 * 86_400_000;

/** O painel inicial. "Hoje" é o dia UTC, como os instantes do contrato. */
export function repositorioResumo(db: Db) {
  return {
    resumo: (usuarioId: string, agora: number): Promise<Resumo> =>
      comoUsuario(db, usuarioId, async (tx) => {
        const inicioDia = inicioDoDiaUtc(agora);
        const porRobo = await execucoesPorRobo(tx);
        const carteira = resumirCarteira(porRobo, {
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
          taxasHoje: paraTexto(taxasDesde(porRobo, inicioDia)),
          paradaTotal: config?.ligada ?? false,
        };
      }),

    /** Resultado realizado acumulado por dia, nos últimos `dias` (das execuções confirmadas). */
    patrimonio: (usuarioId: string, agora: number, dias: number): Promise<PontoPatrimonio[]> =>
      comoUsuario(db, usuarioId, async (tx) =>
        curvaDiaria(await execucoesPorRobo(tx), { inicio: agora - (dias - 1) * DIA_MS, fim: agora }).map(
          (p) => ({ em: p.em, valor: paraTexto(p.valor) }),
        ),
      ),
  };
}

export type RepositorioResumo = ReturnType<typeof repositorioResumo>;
