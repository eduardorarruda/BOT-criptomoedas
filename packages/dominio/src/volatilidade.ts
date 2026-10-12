import { amplitudeVerdadeira, ate, ateHLC, exigirPositivo, media, type SerieHLC } from "./serie.js";

/**
 * Indicadores de volatilidade: quanto o preço anda (ATR), quão longe da média ele
 * costuma ir (Bollinger) e onde estão os extremos recentes (Donchian).
 */

/**
 * Average True Range de Wilder ("New Concepts in Technical Trading Systems",
 * 1978). Primeiro valor: média simples dos N primeiros TR (convenção do TA-Lib);
 * depois, ATR = (ATR anterior × (N − 1) + TR) / N. Precisa de N + 1 candles.
 */
export function atr(v: SerieHLC, periodo = 14, deslocamento = 0): number | null {
  const s = ateHLC(v, periodo, deslocamento);
  if (s.fechamentos.length < periodo + 1) return null;
  let soma = 0;
  for (let i = 1; i <= periodo; i++) soma += amplitudeVerdadeira(s, i);
  let valor = soma / periodo;
  for (let i = periodo + 1; i < s.fechamentos.length; i++)
    valor = (valor * (periodo - 1) + amplitudeVerdadeira(s, i)) / periodo;
  return valor;
}

export interface Bandas {
  readonly media: number;
  readonly superior: number;
  readonly inferior: number;
  /** Onde o fechamento está entre as bandas: 0 = na inferior, 1 = na superior (pode passar). */
  readonly percentualB: number;
  /** Largura relativa (superior − inferior) / média: 0,04 = bandas 4% abertas. */
  readonly largura: number;
}

/**
 * Bandas de Bollinger (John Bollinger, "Bollinger on Bollinger Bands", 2001):
 * média simples de N ± k desvios-padrão POPULACIONAIS dos mesmos N fechamentos.
 */
export function bollinger(
  fechamentos: readonly number[],
  periodo = 20,
  desvios = 2,
  deslocamento = 0,
): Bandas | null {
  exigirPositivo("número de desvios", desvios);
  const v = ate(fechamentos, periodo, deslocamento);
  if (v.length < periodo) return null;
  const janela = v.slice(v.length - periodo);
  const m = media(janela);
  const desvio = Math.sqrt(media(janela.map((x) => (x - m) ** 2)));
  const superior = m + desvios * desvio;
  const inferior = m - desvios * desvio;
  const atual = v[v.length - 1] as number;
  return {
    media: m,
    superior,
    inferior,
    percentualB: superior === inferior ? 0.5 : (atual - inferior) / (superior - inferior),
    largura: m === 0 ? 0 : (superior - inferior) / m,
  };
}

export interface Canal {
  readonly superior: number;
  readonly inferior: number;
  readonly meio: number;
}

/**
 * Canal de Donchian: maior máxima e menor mínima dos N candles ANTERIORES ao
 * último. Fica de fora o candle atual — senão "fechou acima do topo do canal"
 * nunca seria verdade (o topo incluiria a própria máxima). Precisa de N + 1 candles.
 */
export function donchian(v: SerieHLC, periodo = 20, deslocamento = 0): Canal | null {
  const s = ateHLC(v, periodo, deslocamento);
  const n = s.fechamentos.length;
  if (n < periodo + 1) return null;
  const superior = Math.max(...s.maximas.slice(n - 1 - periodo, n - 1));
  const inferior = Math.min(...s.minimas.slice(n - 1 - periodo, n - 1));
  return { superior, inferior, meio: (superior + inferior) / 2 };
}
