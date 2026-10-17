import { MS_POR_INTERVALO, type Intervalo } from "@zentrade/contratos";
import { FUSO_B3, horaLocal, lerFuso } from "./fuso.js";

/**
 * Símbolos da B3 no banco de candles (contrato com o backtest do WIN):
 * - `WIN-IBOV`: o índice Ibovespa, aproximação gratuita do mini índice;
 * - `WIN`: o mini índice de verdade, importado de um CSV (MetaTrader 5 ou genérico).
 * Esses símbolos só vêm do banco; nunca da Binance.
 */
export const SIMBOLOS_B3 = ["WIN", "WIN-IBOV"] as const;
export type SimboloB3 = (typeof SIMBOLOS_B3)[number];

/** Intervalos guardados para a B3, do menor ao maior. */
export const INTERVALOS_B3 = ["5m", "15m", "1h"] as const satisfies readonly Intervalo[];
export type IntervaloB3 = (typeof INTERVALOS_B3)[number];

export const ehSimboloB3 = (simbolo: string): simbolo is SimboloB3 =>
  (SIMBOLOS_B3 as readonly string[]).includes(simbolo);

/** Pregão regular de derivativos da B3, em horário de Brasília: 09:00 às 18:25. */
const ABRE_MIN = 9 * 60;
const FECHA_MIN = 18 * 60 + 25;
const SAO_PAULO = lerFuso(FUSO_B3);

/**
 * O candle que abre neste instante está dentro do pregão regular? Segunda a sexta,
 * abertura das 09:00 até antes das 18:25 de Brasília. Feriados não são conferidos aqui:
 * neles a fonte simplesmente não tem candle.
 */
export function noPregaoB3(abertura: number): boolean {
  const h = horaLocal(abertura, SAO_PAULO);
  if (h.diaSemana === 0 || h.diaSemana === 6) return false;
  const minutos = h.hora * 60 + h.minuto;
  return minutos >= ABRE_MIN && minutos < FECHA_MIN;
}

/** Os intervalos maiores que dá para montar a partir de `intervalo` (15m e 1h a partir de 5m). */
export function intervalosAcima(intervalo: IntervaloB3): IntervaloB3[] {
  const ms = MS_POR_INTERVALO[intervalo];
  return INTERVALOS_B3.filter((i) => MS_POR_INTERVALO[i] > ms && MS_POR_INTERVALO[i] % ms === 0);
}
