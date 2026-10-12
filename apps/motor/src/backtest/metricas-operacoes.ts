import { dec, type Valor } from "@zentrade/dominio";
import type { OperacaoFechada } from "../historico.js";

export interface EstatisticasOperacoes {
  /** Σ ganhos ÷ |Σ perdas|; `null` sem nenhuma perda (seria infinito). */
  readonly fatorLucro: number | null;
  /** Resultado médio por operação (o que se espera ganhar ou perder a cada uma). */
  readonly expectativa: Valor;
  readonly ganhoMedio: Valor | null;
  /** Negativa. */
  readonly perdaMedia: Valor | null;
  /** Ganho médio ÷ |perda média|. */
  readonly payoff: number | null;
}

const soma = (v: readonly Valor[]): Valor => v.reduce((s, x) => s.plus(x), dec(0));
const media = (v: readonly Valor[]): Valor | null => (v.length === 0 ? null : soma(v).div(v.length));

/** Operação com resultado zero não é ganho nem perda. */
export function estatisticasDasOperacoes(ops: readonly OperacaoFechada[]): EstatisticasOperacoes {
  const ganhos = ops.filter((o) => o.resultado.gt(0)).map((o) => o.resultado);
  const perdas = ops.filter((o) => o.resultado.lt(0)).map((o) => o.resultado);
  const ganhoMedio = media(ganhos);
  const perdaMedia = media(perdas);
  return {
    fatorLucro: perdas.length === 0 ? null : soma(ganhos).div(soma(perdas).abs()).toNumber(),
    expectativa: media(ops.map((o) => o.resultado)) ?? dec(0),
    ganhoMedio,
    perdaMedia,
    payoff: ganhoMedio && perdaMedia ? ganhoMedio.div(perdaMedia.abs()).toNumber() : null,
  };
}
