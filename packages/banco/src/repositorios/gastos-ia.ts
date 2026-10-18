import { dec, inicioDoDiaNoFuso, inicioDoMesNoFuso, paraTexto, type Valor } from "@zentrade/dominio";
import { gte, sum } from "drizzle-orm";
import { comoUsuario, type Db, type Executor } from "../cliente.js";
import { gastosIa } from "../esquema/index.js";
import { lerLimites } from "./limites-conta.js";

export type OrigemGastoIa = "analise" | "assistente";

/** Gasto e tetos de IA da pessoa agora (US$). Teto `null` = sem limite. */
export interface UsoOrcamentoIa {
  readonly gastoMes: Valor;
  readonly gastoDia: Valor;
  readonly limiteMensal: Valor | null;
  readonly limiteDiario: Valor | null;
}

async function somaDesde(tx: Executor, desde: number): Promise<Valor> {
  const [r] = await tx
    .select({ total: sum(gastosIa.custoUsd) })
    .from(gastosIa)
    .where(gte(gastosIa.em, new Date(desde)));
  return dec(r?.total ?? 0);
}

/**
 * Lê o uso na transação de quem chama (já sob RLS). O mês e o dia são os do fuso da
 * instância: o orçamento diário não vira às 21h de Brasília.
 */
export async function lerUsoOrcamento(
  tx: Executor,
  usuarioId: string,
  agora: number,
  fuso: string,
): Promise<UsoOrcamentoIa> {
  const [{ limites }, gastoMes, gastoDia] = await Promise.all([
    lerLimites(tx, usuarioId),
    somaDesde(tx, inicioDoMesNoFuso(agora, fuso)),
    somaDesde(tx, inicioDoDiaNoFuso(agora, fuso)),
  ]);
  return {
    gastoMes,
    gastoDia,
    limiteMensal: limites.orcamentoIaMensalUsd ? dec(limites.orcamentoIaMensalUsd) : null,
    limiteDiario: limites.orcamentoIaDiarioUsd ? dec(limites.orcamentoIaDiarioUsd) : null,
  };
}

/** O livro do gasto com IA: o agente grava cada chamada; o orçamento soma daqui. */
export function repositorioGastosIa(db: Db, fuso: string) {
  return {
    registrar: (usuarioId: string, origem: OrigemGastoIa, custo: Valor, em: number): Promise<void> =>
      comoUsuario(db, usuarioId, async (tx) => {
        await tx.insert(gastosIa).values({ usuarioId, origem, custoUsd: paraTexto(custo), em: new Date(em) });
      }),

    uso: (usuarioId: string, agora: number): Promise<UsoOrcamentoIa> =>
      comoUsuario(db, usuarioId, (tx) => lerUsoOrcamento(tx, usuarioId, agora, fuso)),
  };
}

export type RepositorioGastosIa = ReturnType<typeof repositorioGastosIa>;
