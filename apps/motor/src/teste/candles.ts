import { dec, type Candle } from "@zentrade/dominio";

/** Candle de teste com o mesmo preço em tudo (ou mínima/máxima informadas). */
export function candle(
  abertura: number,
  fecha: number | string,
  duracaoMs = 60_000,
  extremos?: { minima?: string; maxima?: string },
): Candle {
  return {
    abertura,
    fechamento: abertura + duracaoMs - 1,
    abre: dec(fecha),
    maxima: dec(extremos?.maxima ?? fecha),
    minima: dec(extremos?.minima ?? fecha),
    fecha: dec(fecha),
    volume: dec(1),
  };
}

/** Série de candles consecutivos a partir de `inicio`. */
export const serie = (inicio: number, precos: readonly (number | string)[], duracaoMs = 60_000): Candle[] =>
  precos.map((p, i) => candle(inicio + i * duracaoMs, p, duracaoMs));
