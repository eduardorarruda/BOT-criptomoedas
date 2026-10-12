import { ate, media } from "./serie.js";

/** Volume médio: média simples dos últimos N volumes (o último candle fechado entra). */
export function volumeMedio(volumes: readonly number[], periodo = 20, deslocamento = 0): number | null {
  const v = ate(volumes, periodo, deslocamento);
  return v.length < periodo ? null : media(v.slice(v.length - periodo));
}

/**
 * Volume relativo: o volume do último candle dividido pela média dos N ANTERIORES
 * (sem ele, para um pico aparecer inteiro). 1,5 = 50% acima do normal. Média zero
 * (par sem negócio) não tem razão definida: `null`.
 */
export function volumeRelativo(volumes: readonly number[], periodo = 20, deslocamento = 0): number | null {
  const v = ate(volumes, periodo, deslocamento);
  if (v.length < periodo + 1) return null;
  const base = media(v.slice(v.length - 1 - periodo, v.length - 1));
  return base === 0 ? null : (v[v.length - 1] as number) / base;
}
