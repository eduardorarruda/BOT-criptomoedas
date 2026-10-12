import { MS_POR_INTERVALO, type Intervalo } from "@zentrade/contratos";
import { momentos } from "@zentrade/financas";
import type { Valor } from "@zentrade/dominio";
import type { PontoCurva } from "./metricas.js";

/** Cripto negocia 365 dias por ano, 24 horas por dia. */
export const ANO_MS = 365 * 86_400_000;

export const barrasPorAno = (intervalo: Intervalo): number => ANO_MS / MS_POR_INTERVALO[intervalo];

/** Retorno de cada candle: P_t / P_(t−1) − 1, com P_0 = saldo inicial. */
export function retornosDaCurva(inicial: Valor, curva: readonly PontoCurva[]): number[] {
  let anterior = inicial;
  return curva.map(({ patrimonio }) => {
    const r = anterior.isZero() ? 0 : patrimonio.div(anterior).minus(1).toNumber();
    anterior = patrimonio;
    return r;
  });
}

export interface MetricasRetorno {
  readonly observacoes: number;
  readonly volatilidadeAnual: number | null;
  readonly sharpe: number | null;
  readonly sortino: number | null;
  readonly assimetria: number;
  readonly curtose: number;
}

const finito = (x: number): number | null => (Number.isFinite(x) ? x : null);

/**
 * Sobre os retornos por candle, anualizando por √(candles por ano). Sem taxa livre de
 * risco (comparamos com zero, como a Freqtrade). Sharpe = μ/σ·√A, com σ amostral.
 * Sortino = μ/DD·√A, com DD = √(Σ min(r, 0)² / n) (desvio para baixo com alvo zero).
 */
export function metricasDosRetornos(retornos: readonly number[], porAno: number): MetricasRetorno {
  const m = momentos(retornos);
  const raiz = Math.sqrt(porAno);
  const baixo = Math.sqrt(retornos.reduce((s, r) => s + Math.min(r, 0) ** 2, 0) / Math.max(1, m.n));
  const comAmostra = m.n >= 2;
  return {
    observacoes: m.n,
    volatilidadeAnual: comAmostra ? m.desvio * raiz : null,
    sharpe: comAmostra && m.desvio > 0 ? finito((m.media / m.desvio) * raiz) : null,
    sortino: comAmostra && baixo > 0 ? finito((m.media / baixo) * raiz) : null,
    assimetria: m.assimetria,
    curtose: m.curtose,
  };
}

/** Crescimento anual composto: (final/inicial)^(1/anos) − 1. Só com 1 ano ou mais. */
export function cagr(inicial: Valor, final: Valor, anos: number): number | null {
  if (anos < 1 || inicial.lte(0)) return null;
  if (final.lte(0)) return -1;
  return finito(final.div(inicial).toNumber() ** (1 / anos) - 1);
}

export function calmar(crescimento: number | null, maiorQuedaPercentual: number): number | null {
  if (crescimento === null || !(maiorQuedaPercentual > 0)) return null;
  return crescimento / maiorQuedaPercentual;
}
