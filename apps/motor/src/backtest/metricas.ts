import { dec, posicaoDe, type Execucao, type Valor } from "@zentrade/dominio";
import { operacoesFechadas } from "../historico.js";

export interface PontoCurva {
  readonly em: number;
  readonly patrimonio: Valor;
}

/** Maior queda (drawdown): maior distância de um pico da curva até um vale posterior. */
export function maiorQueda(curva: readonly PontoCurva[]): { valor: Valor; percentual: number } {
  let pico: Valor | null = null;
  let pior = { valor: dec(0), percentual: 0 };
  for (const { patrimonio } of curva) {
    if (!pico || patrimonio.gt(pico)) pico = patrimonio;
    const queda = pico.minus(patrimonio);
    if (queda.gt(pior.valor))
      pior = { valor: queda, percentual: pico.isZero() ? 0 : queda.div(pico).toNumber() };
  }
  return pior;
}

export interface MetricasOperacoes {
  readonly operacoes: number;
  readonly acertos: number;
  readonly taxaAcerto: number;
  readonly taxasPagas: Valor;
  readonly ordens: number;
}

/** Operações = idas e voltas fechadas; acerto = resultado líquido de taxas positivo. */
export function metricasDasExecucoes(execucoes: readonly Execucao[], ordens: number): MetricasOperacoes {
  const ops = operacoesFechadas(execucoes);
  const acertos = ops.filter((o) => o.resultado.gt(0)).length;
  return {
    operacoes: ops.length,
    acertos,
    taxaAcerto: ops.length === 0 ? 0 : acertos / ops.length,
    taxasPagas: posicaoDe(execucoes).taxasPagas,
    ordens,
  };
}
