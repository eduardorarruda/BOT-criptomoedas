/**
 * Peças comuns dos indicadores. Indicador é análise, não dinheiro: trabalha em
 * `number` (rodam a cada candle de cada robô e em todo candle do backtest).
 * Quantidade, preço de ordem, stop e resultado continuam em decimal exato.
 *
 * `deslocamento` volta N candles (0 = último candle FECHADO), o que permite
 * comparar "agora" com "antes" sem copiar a série. Nenhum indicador vê candle
 * aberto: quem monta o contexto só entrega candles fechados.
 */
export function exigirInteiro(nome: string, valor: number, minimo: number): void {
  if (!Number.isInteger(valor) || valor < minimo) throw new RangeError(`${nome} inválido: ${valor}`);
}

export function exigirPositivo(nome: string, valor: number): void {
  if (!Number.isFinite(valor) || valor <= 0) throw new RangeError(`${nome} inválido: ${valor}`);
}

/** A série como era `deslocamento` candles atrás. */
export function ate<T>(valores: readonly T[], periodo: number, deslocamento: number): readonly T[] {
  exigirInteiro("período", periodo, 1);
  exigirInteiro("deslocamento", deslocamento, 0);
  return deslocamento === 0 ? valores : valores.slice(0, Math.max(0, valores.length - deslocamento));
}

export const media = (v: readonly number[]): number => v.reduce((s, x) => s + x, 0) / v.length;

/** Máxima, mínima e fechamento alinhados (mesmo índice = mesmo candle). */
export interface SerieHLC {
  readonly maximas: readonly number[];
  readonly minimas: readonly number[];
  readonly fechamentos: readonly number[];
}

/** Corta as três séries juntas; recusa séries desalinhadas (seria comparar candles diferentes). */
export function ateHLC(v: SerieHLC, periodo: number, deslocamento: number): SerieHLC {
  const n = v.fechamentos.length;
  if (v.maximas.length !== n || v.minimas.length !== n)
    throw new RangeError("máximas, mínimas e fechamentos precisam ter o mesmo tamanho");
  return {
    maximas: ate(v.maximas, periodo, deslocamento),
    minimas: ate(v.minimas, periodo, deslocamento),
    fechamentos: ate(v.fechamentos, periodo, deslocamento),
  };
}

/** True range de Wilder no candle i (i ≥ 1): a maior das três distâncias. */
export function amplitudeVerdadeira(v: SerieHLC, i: number): number {
  const h = v.maximas[i] as number;
  const l = v.minimas[i] as number;
  const anterior = v.fechamentos[i - 1] as number;
  return Math.max(h - l, Math.abs(h - anterior), Math.abs(l - anterior));
}

/**
 * Média exponencial de toda a série, semeada pela média simples dos primeiros
 * `periodo` valores não nulos (a mesma convenção de `ema`). `null` antes da semente.
 */
export function serieEma(valores: readonly (number | null)[], periodo: number): (number | null)[] {
  const saida: (number | null)[] = valores.map(() => null);
  const primeiro = valores.findIndex((v) => v !== null);
  if (primeiro < 0 || valores.length - primeiro < periodo) return saida;
  const k = 2 / (periodo + 1);
  let e = media(valores.slice(primeiro, primeiro + periodo) as number[]);
  saida[primeiro + periodo - 1] = e;
  for (let i = primeiro + periodo; i < valores.length; i++) {
    e = (valores[i] as number) * k + e * (1 - k);
    saida[i] = e;
  }
  return saida;
}
