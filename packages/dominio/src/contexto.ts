import type { SerieHLC } from "./serie.js";
import type { Candle } from "./tipos.js";

/**
 * O mercado como a regra vê: só candles FECHADOS, do mais antigo ao mais recente,
 * em séries alinhadas (mesmo índice = mesmo candle).
 *
 * Só `fechamentos` é obrigatório: é o que existia antes e o que chamadores antigos
 * (e estratégias gravadas só com SMA/EMA/RSI) continuam mandando. Sem máxima e
 * mínima, ATR, Donchian, estocástico e ADX dão "dados insuficientes" — nunca um
 * valor inventado a partir do fechamento.
 */
export interface ContextoMercado {
  readonly fechamentos: readonly number[];
  readonly aberturas?: readonly number[];
  readonly maximas?: readonly number[];
  readonly minimas?: readonly number[];
  readonly volumes?: readonly number[];
  /**
   * Abertura de cada candle (ms UTC), alinhada aos fechamentos. Só os indicadores
   * do pregão (VWAP do dia, faixa de abertura) usam: eles precisam saber onde o dia
   * começa. Sem ela, esses indicadores dão "dados insuficientes".
   */
  readonly instantes?: readonly number[];
  /** Duração de um candle em ms (sem ela, sai da menor distância entre instantes). */
  readonly intervaloMs?: number;
  /**
   * Fuso do mercado (nome IANA) em que a regra de horário lê a hora do candle. Sem ele,
   * vale America/Sao_Paulo: o fuso do pregão da B3 e o padrão da instância (ZENTRADE_FUSO).
   */
  readonly fuso?: string;
}

export type SerieCandle = "aberturas" | "maximas" | "minimas" | "volumes" | "instantes";

/** A série pedida, se veio e está alinhada com os fechamentos. */
export function serieDe(ctx: ContextoMercado, nome: SerieCandle): readonly number[] | null {
  const s = ctx[nome];
  return s && s.length === ctx.fechamentos.length ? s : null;
}

/** Máxima, mínima e fechamento juntos, ou `null` se faltar alguma. */
export function hlcDe(ctx: ContextoMercado): SerieHLC | null {
  const maximas = serieDe(ctx, "maximas");
  const minimas = serieDe(ctx, "minimas");
  return maximas && minimas ? { maximas, minimas, fechamentos: ctx.fechamentos } : null;
}

/** Duração de um candle (o fechamento gravado é o último ms dele). */
export const duracaoDoCandle = (c: Pick<Candle, "abertura" | "fechamento">): number =>
  c.fechamento - c.abertura + 1;

/** Contexto completo (OHLCV e instantes) a partir de candles fechados. Decimal vira número: é análise. */
export function contextoDeCandles(candles: readonly Candle[], fuso?: string): ContextoMercado {
  const primeiro = candles[0];
  return {
    fechamentos: candles.map((c) => c.fecha.toNumber()),
    aberturas: candles.map((c) => c.abre.toNumber()),
    maximas: candles.map((c) => c.maxima.toNumber()),
    minimas: candles.map((c) => c.minima.toNumber()),
    volumes: candles.map((c) => c.volume.toNumber()),
    instantes: candles.map((c) => c.abertura),
    ...(primeiro ? { intervaloMs: duracaoDoCandle(primeiro) } : {}),
    ...(fuso ? { fuso } : {}),
  };
}

/** O contexto como era no candle `fim` (inclusive): para repassar candles um a um, sem olhar adiante. */
export function contextoAte(ctx: ContextoMercado, fim: number): ContextoMercado {
  const n = fim + 1;
  return {
    fechamentos: ctx.fechamentos.slice(0, n),
    ...(ctx.aberturas ? { aberturas: ctx.aberturas.slice(0, n) } : {}),
    ...(ctx.maximas ? { maximas: ctx.maximas.slice(0, n) } : {}),
    ...(ctx.minimas ? { minimas: ctx.minimas.slice(0, n) } : {}),
    ...(ctx.volumes ? { volumes: ctx.volumes.slice(0, n) } : {}),
    ...(ctx.instantes ? { instantes: ctx.instantes.slice(0, n) } : {}),
    ...(ctx.intervaloMs !== undefined ? { intervaloMs: ctx.intervaloMs } : {}),
    ...(ctx.fuso ? { fuso: ctx.fuso } : {}),
  };
}
