import { ate, media } from "./serie.js";

/**
 * Médias e RSI sobre fechamentos. São análise, não dinheiro: trabalham em
 * `number` (veja serie.ts). Os indicadores que usam máxima, mínima e volume
 * ficam em volatilidade.ts, momento.ts e volume.ts.
 */

/** Média móvel simples dos últimos `periodo` fechamentos. */
export function sma(valores: readonly number[], periodo: number, deslocamento = 0): number | null {
  const v = ate(valores, periodo, deslocamento);
  return v.length < periodo ? null : media(v.slice(v.length - periodo));
}

/** Média móvel exponencial, semeada pela média simples do primeiro período. */
export function ema(valores: readonly number[], periodo: number, deslocamento = 0): number | null {
  const v = ate(valores, periodo, deslocamento);
  if (v.length < periodo) return null;
  const k = 2 / (periodo + 1);
  return v.slice(periodo).reduce((e, x) => x * k + e * (1 - k), media(v.slice(0, periodo)));
}

/** Índice de força relativa com a suavização de Wilder (0 a 100). */
export function rsi(valores: readonly number[], periodo = 14, deslocamento = 0): number | null {
  const v = ate(valores, periodo, deslocamento);
  if (v.length < periodo + 1) return null;
  const variacoes = v.slice(1).map((x, i) => x - (v[i] as number));
  let ganho = 0;
  let perda = 0;
  variacoes.forEach((d, i) => {
    if (i < periodo) {
      ganho += Math.max(d, 0) / periodo;
      perda += Math.max(-d, 0) / periodo;
      return;
    }
    ganho = (ganho * (periodo - 1) + Math.max(d, 0)) / periodo;
    perda = (perda * (periodo - 1) + Math.max(-d, 0)) / periodo;
  });
  if (perda === 0) return ganho === 0 ? 50 : 100;
  return 100 - 100 / (1 + ganho / perda);
}
