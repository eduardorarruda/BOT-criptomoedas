import type { PontoCurvaBacktest } from "../../api/esquemas";

/** Pontos de um gráfico SVG: bastam ~150 para a forma da curva (a tabela some com mais). */
export const PONTOS_GRAFICO = 150;

export function reduzir<T>(itens: readonly T[], maximo = PONTOS_GRAFICO): T[] {
  if (itens.length <= maximo) return [...itens];
  const passo = (itens.length - 1) / (maximo - 1);
  return Array.from({ length: maximo }, (_, i) => itens[Math.round(i * passo)] as T);
}

export interface SerieComparada {
  readonly em: readonly number[];
  /** Retorno acumulado (fração) sobre o capital inicial. */
  readonly estrategia: readonly number[];
  /** `null` em backtests antigos (sem buy and hold gravado). */
  readonly buyHold: readonly number[] | null;
}

/** Retorno acumulado da estratégia e do buy and hold, ponto a ponto. */
export function retornosAcumulados(curva: readonly PontoCurvaBacktest[], capital: number): SerieComparada {
  const pontos = reduzir(curva);
  const temBuyHold = pontos.length > 0 && pontos.every((p) => p.buyHold !== undefined);
  const fracao = (v: string) => (capital > 0 ? Number(v) / capital - 1 : 0);
  return {
    em: pontos.map((p) => p.em),
    estrategia: pontos.map((p) => fracao(p.patrimonio)),
    buyHold: temBuyHold ? pontos.map((p) => fracao(p.buyHold ?? "0")) : null,
  };
}

/** Queda a partir do pico (fração ≤ 0) em cada ponto: o "subaquático" da curva. */
export function quedas(valores: readonly number[]): number[] {
  let pico = Number.NEGATIVE_INFINITY;
  return valores.map((v) => {
    pico = Math.max(pico, v);
    return pico > 0 ? v / pico - 1 : 0;
  });
}

/** Reduz pegando o MENOR valor de cada faixa: a pior queda nunca some do gráfico. */
function menorPorFaixa(valores: readonly number[], maximo: number): number[] {
  if (valores.length <= maximo) return [...valores];
  return Array.from({ length: maximo }, (_, b) => {
    const de = Math.floor((b * valores.length) / maximo);
    const ate = Math.max(de + 1, Math.floor(((b + 1) * valores.length) / maximo));
    return Math.min(...valores.slice(de, ate));
  });
}

/** Quedas da estratégia e do buy and hold, calculadas na curva inteira e só depois reduzidas. */
export function quedasComparadas(
  curva: readonly PontoCurvaBacktest[],
  maximo = PONTOS_GRAFICO,
): SerieComparada {
  const temBuyHold = curva.length > 0 && curva.every((p) => p.buyHold !== undefined);
  const em = curva.map((p) => p.em);
  const faixas = Math.min(maximo, curva.length);
  return {
    em: Array.from({ length: faixas }, (_, b) => em[Math.floor((b * curva.length) / faixas)] ?? 0),
    estrategia: menorPorFaixa(quedas(curva.map((p) => Number(p.patrimonio))), maximo),
    buyHold: temBuyHold ? menorPorFaixa(quedas(curva.map((p) => Number(p.buyHold))), maximo) : null,
  };
}
