import { serieDe, type ContextoMercado } from "./contexto.js";
import { chaveDiaB3 } from "./mercados/sessao-b3.js";
import { exigirInteiro } from "./serie.js";

/**
 * Indicadores do pregão: começam de novo a cada dia (de Brasília, o do pregão da B3).
 * Precisam dos instantes dos candles no contexto; sem eles, ou se o começo do dia
 * ficou fora do histórico, dão `null` ("dados insuficientes") — nunca um valor
 * calculado com parte do dia.
 *
 * Como os outros, só veem candles FECHADOS: o valor no candle i usa os candles de
 * 0 a i, e não muda quando chegam candles depois.
 */

const MINUTO_MS = 60_000;

/** O índice do candle `deslocamento` atrás do último, ou `null` se não existe. */
function indice(ctx: ContextoMercado, deslocamento: number): number | null {
  exigirInteiro("deslocamento", deslocamento, 0);
  const i = ctx.fechamentos.length - 1 - deslocamento;
  return i >= 0 ? i : null;
}

/**
 * O primeiro candle do dia do candle i. `null` se o dia começa no candle 0: aí não
 * dá para saber se o histórico pegou o começo do dia.
 */
function inicioDoDia(instantes: readonly number[], i: number): number | null {
  const dia = chaveDiaB3(instantes[i] as number);
  let j = i;
  while (j > 0 && chaveDiaB3(instantes[j - 1] as number) === dia) j--;
  return j === 0 ? null : j;
}

/**
 * VWAP do dia: Σ preço típico × volume ÷ Σ volume, do primeiro candle do dia até o
 * candle i. Preço típico = (máxima + mínima + fechamento) ÷ 3, ou o fechamento se
 * faltar máxima e mínima. Sem volume (o índice à vista não tem), `null`.
 */
export function vwapDoDia(ctx: ContextoMercado, deslocamento = 0): number | null {
  const instantes = serieDe(ctx, "instantes");
  const volumes = serieDe(ctx, "volumes");
  const i = indice(ctx, deslocamento);
  if (!instantes || !volumes || i === null) return null;
  const j = inicioDoDia(instantes, i);
  if (j === null) return null;
  const maximas = serieDe(ctx, "maximas");
  const minimas = serieDe(ctx, "minimas");
  let soma = 0;
  let volume = 0;
  for (let k = j; k <= i; k++) {
    const c = ctx.fechamentos[k] as number;
    const tipico = maximas && minimas ? ((maximas[k] as number) + (minimas[k] as number) + c) / 3 : c;
    const v = volumes[k] as number;
    soma += tipico * v;
    volume += v;
  }
  return volume > 0 ? soma / volume : null;
}

export interface FaixaDeAbertura {
  readonly superior: number;
  readonly inferior: number;
  readonly meio: number;
}

/** A duração de um candle: a informada ou a menor distância entre instantes seguidos. */
function duracao(ctx: ContextoMercado, instantes: readonly number[]): number | null {
  if (ctx.intervaloMs !== undefined) return ctx.intervaloMs;
  let menor = Number.POSITIVE_INFINITY;
  for (let k = 1; k < instantes.length; k++)
    menor = Math.min(menor, (instantes[k] as number) - (instantes[k - 1] as number));
  return Number.isFinite(menor) && menor > 0 ? menor : null;
}

/**
 * Faixa de abertura: a maior máxima e a menor mínima dos candles que começam nos
 * primeiros `minutos` do dia. Só existe depois que essa janela fechou (no candle
 * que termina nela ou depois); antes, `null`. Com candles maiores que a janela, a
 * faixa é a do primeiro candle inteiro.
 */
export function faixaDeAbertura(
  ctx: ContextoMercado,
  minutos: number,
  deslocamento = 0,
): FaixaDeAbertura | null {
  exigirInteiro("minutos", minutos, 1);
  const instantes = serieDe(ctx, "instantes");
  const maximas = serieDe(ctx, "maximas");
  const minimas = serieDe(ctx, "minimas");
  const i = indice(ctx, deslocamento);
  if (!instantes || !maximas || !minimas || i === null) return null;
  const j = inicioDoDia(instantes, i);
  const d = duracao(ctx, instantes);
  if (j === null || d === null) return null;
  const fim = (instantes[j] as number) + minutos * MINUTO_MS;
  if ((instantes[i] as number) + d < fim) return null;
  let superior = Number.NEGATIVE_INFINITY;
  let inferior = Number.POSITIVE_INFINITY;
  for (let k = j; k <= i && (instantes[k] as number) < fim; k++) {
    superior = Math.max(superior, maximas[k] as number);
    inferior = Math.min(inferior, minimas[k] as number);
  }
  return { superior, inferior, meio: (superior + inferior) / 2 };
}
