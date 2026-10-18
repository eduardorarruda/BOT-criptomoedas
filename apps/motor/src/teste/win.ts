import { dec, type Candle } from "@zentrade/dominio";

/**
 * Candles de teste do mini índice: pregões em candles de 5 minutos, em pontos, com
 * instantes UTC de horários de Brasília. Como os do contrato de dados (`candles`,
 * simbolo "WIN-IBOV" ou "WIN"): só o horário de negociação, nada de madrugada.
 */
export const CINCO_MIN = 5 * 60_000;

/** Instante UTC de um horário de Brasília (UTC−3 desde 2019). */
export const brasilia = (dia: string, hhmm: string): number => Date.parse(`${dia}T${hhmm}:00-03:00`);

export interface Vela {
  readonly o: number;
  readonly h: number;
  readonly l: number;
  readonly c: number;
}

export function velaWin(abertura: number, v: Vela, duracaoMs = CINCO_MIN): Candle {
  return {
    abertura,
    fechamento: abertura + duracaoMs - 1,
    abre: dec(v.o),
    maxima: dec(v.h),
    minima: dec(v.l),
    fecha: dec(v.c),
    volume: dec(0),
  };
}

/** Candles de 5 minutos de um pregão, começando em `das` (Brasília). */
export const pregao = (dia: string, das: string, velas: readonly Vela[]): Candle[] =>
  velas.map((v, i) => velaWin(brasilia(dia, das) + i * CINCO_MIN, v));

/** Vela "parada": abre, máxima, mínima e fechamento iguais. */
export const parada = (p: number): Vela => ({ o: p, h: p, l: p, c: p });

/** Os próximos `n` dias úteis (segunda a sexta) a partir de `inicio` ("AAAA-MM-DD"), inclusive. */
export function diasUteis(inicio: string, n: number): string[] {
  const dias: string[] = [];
  for (let t = Date.parse(`${inicio}T12:00:00Z`); dias.length < n; t += 86_400_000) {
    const d = new Date(t);
    if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) dias.push(d.toISOString().slice(0, 10));
  }
  return dias;
}

/** mulberry32: reproduzível pela semente. */
function gerador(semente: number): () => number {
  let a = semente >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/**
 * Série determinística parecida com o Ibovespa à vista em 5 minutos (10:00–17:55,
 * 96 candles por pregão): passeio aleatório com tendência que muda de sinal a cada
 * poucos dias, em pontos com duas casas (o índice não anda de 5 em 5).
 */
export function serieWinIbov(
  semente: number,
  dias: readonly string[],
  inicial = 130_000,
  casas = 2,
): Candle[] {
  const sorteio = gerador(semente);
  let preco = inicial;
  return dias.flatMap((dia, d) => {
    const tendencia = Math.sin(d / 3) * 12;
    return Array.from({ length: 96 }, (_, i) => {
      const o = preco;
      const c = o + tendencia + (sorteio() - 0.5) * 160;
      const h = Math.max(o, c) + sorteio() * 60;
      const l = Math.min(o, c) - sorteio() * 60;
      preco = c;
      const r = (x: number) => Math.round(x * 10 ** casas) / 10 ** casas;
      return velaWin(brasilia(dia, "10:00") + i * CINCO_MIN, { o: r(o), h: r(h), l: r(l), c: r(c) });
    });
  });
}
