import { dec, type Candle, type Valor } from "@zentrade/dominio";

export interface PrecosLidos {
  readonly abre: Valor;
  readonly maxima: Valor;
  readonly minima: Valor;
  readonly fecha: Valor;
  readonly volume: Valor;
}

export type CandleLido = { readonly candle: Candle } | { readonly motivo: string };

/**
 * Monta o candle de [abertura, abertura + ms) conferindo o que uma fonte de verdade
 * nunca manda: preço zero ou negativo, máxima abaixo da abertura ou do fechamento,
 * mínima acima deles, volume negativo. Candle estranho é recusado com o motivo, nunca
 * "consertado".
 */
export function montarCandle(abertura: number, ms: number, p: PrecosLidos): CandleLido {
  if ([p.abre, p.maxima, p.minima, p.fecha].some((v) => !v.isFinite() || v.lte(0)))
    return { motivo: "preço zero, negativo ou inválido" };
  if (p.maxima.lt(p.minima)) return { motivo: "máxima abaixo da mínima" };
  if (p.maxima.lt(p.abre) || p.maxima.lt(p.fecha))
    return { motivo: "máxima abaixo da abertura ou do fechamento" };
  if (p.minima.gt(p.abre) || p.minima.gt(p.fecha))
    return { motivo: "mínima acima da abertura ou do fechamento" };
  if (!p.volume.isFinite() || p.volume.lt(0)) return { motivo: "volume negativo ou inválido" };
  return { candle: { abertura, fechamento: abertura + ms - 1, ...p } };
}

/** Número de ponto flutuante de uma API JSON para decimal, sem o lixo binário (128300.39999999999). */
export const decimalDeNumero = (n: number, casas: number): Valor => dec(n.toFixed(casas));
