import { amplitudeVerdadeira, ate, ateHLC, exigirInteiro, serieEma, type SerieHLC } from "./serie.js";

/** Indicadores de tendência e momento: MACD, estocástico, ROC, momento e ADX. */

export interface Macd {
  readonly macd: number;
  readonly sinal: number;
  readonly histograma: number;
}

/**
 * MACD de Gerald Appel: EMA(rápida) − EMA(lenta) dos fechamentos; a linha de
 * sinal é a EMA dessa diferença; o histograma, linha − sinal. As médias são
 * semeadas pela média simples, como `ema`. Precisa de lenta + sinal − 1 candles.
 */
export function macd(
  fechamentos: readonly number[],
  rapida = 12,
  lenta = 26,
  periodoSinal = 9,
  deslocamento = 0,
): Macd | null {
  exigirInteiro("período rápido", rapida, 1);
  exigirInteiro("período do sinal", periodoSinal, 1);
  if (rapida >= lenta) throw new RangeError("a média rápida do MACD precisa ser menor que a lenta");
  const v = ate(fechamentos, lenta, deslocamento);
  if (v.length < lenta + periodoSinal - 1) return null;
  const curta = serieEma(v, rapida);
  const longa = serieEma(v, lenta);
  const linha = longa.map((l, i) => (l === null ? null : (curta[i] as number) - l));
  const sinal = serieEma(linha, periodoSinal).at(-1) as number;
  const atual = linha.at(-1) as number;
  return { macd: atual, sinal, histograma: atual - sinal };
}

export interface Estocastico {
  readonly k: number;
  readonly d: number;
}

/**
 * Estocástico rápido de George Lane: %K = 100 × (fechamento − menor mínima) /
 * (maior máxima − menor mínima) dos últimos N candles (o atual entra: ele já
 * fechou); %D = média simples dos últimos `suavizacao` %K. Faixa parada dá 50.
 */
export function estocastico(v: SerieHLC, periodo = 14, suavizacao = 3, deslocamento = 0): Estocastico | null {
  exigirInteiro("suavização", suavizacao, 1);
  const s = ateHLC(v, periodo, deslocamento);
  const n = s.fechamentos.length;
  if (n < periodo + suavizacao - 1) return null;
  const k = (fim: number): number => {
    const maior = Math.max(...s.maximas.slice(fim - periodo + 1, fim + 1));
    const menor = Math.min(...s.minimas.slice(fim - periodo + 1, fim + 1));
    return maior === menor ? 50 : (100 * ((s.fechamentos[fim] as number) - menor)) / (maior - menor);
  };
  const ks = Array.from({ length: suavizacao }, (_, i) => k(n - suavizacao + i));
  return { k: ks.at(-1) as number, d: ks.reduce((a, b) => a + b, 0) / suavizacao };
}

/** Rate of change: variação percentual contra N candles atrás (100 × (C − Cₙ) / Cₙ). */
export function roc(fechamentos: readonly number[], periodo = 10, deslocamento = 0): number | null {
  const v = ate(fechamentos, periodo, deslocamento);
  if (v.length < periodo + 1) return null;
  const antes = v[v.length - 1 - periodo] as number;
  return antes === 0 ? null : (100 * ((v[v.length - 1] as number) - antes)) / antes;
}

/** Momento: diferença de preço contra N candles atrás (C − Cₙ). */
export function momento(fechamentos: readonly number[], periodo = 10, deslocamento = 0): number | null {
  const v = ate(fechamentos, periodo, deslocamento);
  if (v.length < periodo + 1) return null;
  return (v[v.length - 1] as number) - (v[v.length - 1 - periodo] as number);
}

export interface Direcional {
  readonly adx: number;
  /** +DI: força das altas (0 a 100). */
  readonly maisDI: number;
  /** −DI: força das quedas (0 a 100). */
  readonly menosDI: number;
}

const indice = (positivo: number, negativo: number, amplitude: number) => {
  const maisDI = amplitude === 0 ? 0 : (100 * positivo) / amplitude;
  const menosDI = amplitude === 0 ? 0 : (100 * negativo) / amplitude;
  const soma = maisDI + menosDI;
  return { maisDI, menosDI, dx: soma === 0 ? 0 : (100 * Math.abs(maisDI - menosDI)) / soma };
};

/**
 * ADX de Wilder (1978): mede a FORÇA da tendência, não a direção. ±DM e TR são
 * somados nos N primeiros candles e depois suavizados (S = S − S/N + x); ±DI =
 * 100 × ±DM/TR; DX = 100 × |+DI − −DI| / (+DI + −DI); o primeiro ADX é a média
 * dos N primeiros DX e depois segue a média de Wilder. Precisa de 2N candles.
 */
export function adx(v: SerieHLC, periodo = 14, deslocamento = 0): Direcional | null {
  const s = ateHLC(v, periodo, deslocamento);
  const n = s.fechamentos.length;
  if (n < 2 * periodo) return null;
  let tr = 0;
  let mais = 0;
  let menos = 0;
  let somaDx = 0;
  let valor = 0;
  let atual = { maisDI: 0, menosDI: 0, dx: 0 };
  for (let i = 1; i < n; i++) {
    const subida = (s.maximas[i] as number) - (s.maximas[i - 1] as number);
    const descida = (s.minimas[i - 1] as number) - (s.minimas[i] as number);
    const dmMais = subida > descida && subida > 0 ? subida : 0;
    const dmMenos = descida > subida && descida > 0 ? descida : 0;
    const amplitude = amplitudeVerdadeira(s, i);
    const somando = i <= periodo;
    tr = somando ? tr + amplitude : tr - tr / periodo + amplitude;
    mais = somando ? mais + dmMais : mais - mais / periodo + dmMais;
    menos = somando ? menos + dmMenos : menos - menos / periodo + dmMenos;
    if (i < periodo) continue;
    atual = indice(mais, menos, tr);
    if (i < 2 * periodo - 1) somaDx += atual.dx;
    else if (i === 2 * periodo - 1) valor = (somaDx + atual.dx) / periodo;
    else valor = (valor * (periodo - 1) + atual.dx) / periodo;
  }
  return { adx: valor, maisDI: atual.maisDI, menosDI: atual.menosDI };
}
