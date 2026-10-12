/**
 * Estatística para validar um backtest: a normal padrão, momentos de uma série, o
 * Sharpe probabilístico (PSR), o Sharpe deflacionado (DSR), a duração mínima do
 * backtest (MinBTL) e o desconto por múltiplos testes de Harvey & Liu. Funções puras
 * em `number`: são probabilidades e razões, não dinheiro.
 *
 * Convenção: `sharpe` sem sufixo é POR PERÍODO (por barra do backtest); `sharpeAnual`
 * já foi multiplicado por √(barras por ano). A curtose é a "não excedente" (3 na normal),
 * como nas fórmulas de Bailey & López de Prado.
 */

/** Constante de Euler–Mascheroni (γ), da aproximação do máximo esperado de N normais. */
const EULER_MASCHERONI = 0.5772156649015329;

/** erfc com erro relativo < 1,2e-7 (Numerical Recipes, `erfcc`, aproximação de Chebyshev). */
function erfc(x: number): number {
  const z = Math.abs(x);
  const t = 1 / (1 + 0.5 * z);
  const polinomio =
    -z * z -
    1.26551223 +
    t *
      (1.00002368 +
        t *
          (0.37409196 +
            t *
              (0.09678418 +
                t *
                  (-0.18628806 +
                    t *
                      (0.27886807 +
                        t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277))))))));
  const r = t * Math.exp(polinomio);
  return x >= 0 ? r : 2 - r;
}

/** Φ(x): probabilidade de uma normal padrão ficar abaixo de `x`. */
export const normalAcumulada = (x: number): number => 0.5 * erfc(-x / Math.SQRT2);

// Coeficientes do algoritmo de Peter J. Acklam para Φ⁻¹ (erro relativo < 1,15e-9).
const A = [
  -39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716,
  2.506628277459239,
];
const B = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
const C = [
  -0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968,
  2.938163982698783,
];
const D = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
const P_BAIXO = 0.02425;

const horner = (coef: readonly number[], x: number): number => coef.reduce((acc, c) => acc * x + c, 0);

function caudaInferior(p: number): number {
  const q = Math.sqrt(-2 * Math.log(p));
  return horner(C, q) / (horner(D, q) * q + 1);
}

/** Φ⁻¹(p): o ponto da normal padrão com probabilidade `p` abaixo dele. */
export function normalInversa(p: number): number {
  if (!(p > 0 && p < 1)) throw new RangeError("a probabilidade precisa estar entre 0 e 1, sem as pontas");
  if (p < P_BAIXO) return caudaInferior(p);
  if (p > 1 - P_BAIXO) return -caudaInferior(1 - p);
  const q = p - 0.5;
  const r = q * q;
  return (horner(A, r) * q) / (horner(B, r) * r + 1);
}

export interface Momentos {
  readonly n: number;
  readonly media: number;
  /** Desvio padrão amostral (divide por n − 1). */
  readonly desvio: number;
  /** Assimetria (γ₃) com momentos populacionais; 0 numa série sem variação. */
  readonly assimetria: number;
  /** Curtose não excedente (γ₄; 3 na normal); 3 numa série sem variação. */
  readonly curtose: number;
}

export function momentos(valores: readonly number[]): Momentos {
  const n = valores.length;
  if (n === 0) return { n, media: 0, desvio: 0, assimetria: 0, curtose: 3 };
  const media = valores.reduce((s, v) => s + v, 0) / n;
  let m2 = 0;
  let m3 = 0;
  let m4 = 0;
  for (const v of valores) {
    const d = v - media;
    m2 += d * d;
    m3 += d * d * d;
    m4 += d * d * d * d;
  }
  const desvio = n > 1 ? Math.sqrt(m2 / (n - 1)) : 0;
  const pop2 = m2 / n;
  if (pop2 <= 0) return { n, media, desvio: 0, assimetria: 0, curtose: 3 };
  return { n, media, desvio, assimetria: m3 / n / pop2 ** 1.5, curtose: m4 / n / (pop2 * pop2) };
}

/** Percentil `p` (0 a 1) de valores JÁ ORDENADOS, com interpolação linear (tipo 7). */
export function percentil(ordenados: readonly number[], p: number): number {
  if (ordenados.length === 0) return Number.NaN;
  const h = (ordenados.length - 1) * Math.min(1, Math.max(0, p));
  const abaixo = Math.floor(h);
  const v = ordenados[abaixo] ?? Number.NaN;
  const acima = ordenados[Math.min(ordenados.length - 1, abaixo + 1)] ?? v;
  return v + (h - abaixo) * (acima - v);
}

export interface EntradaPsr {
  /** Sharpe observado, por período. */
  readonly sharpe: number;
  /** Sharpe de referência (por período) contra o qual se testa. */
  readonly referencia: number;
  /** Número de retornos (T). */
  readonly observacoes: number;
  readonly assimetria: number;
  readonly curtose: number;
}

/**
 * PSR: probabilidade de o Sharpe verdadeiro passar da referência, dado o observado,
 * o tamanho da amostra e o formato dos retornos (Bailey & López de Prado, 2012, "The
 * Sharpe Ratio Efficient Frontier", Journal of Risk 15(2)):
 *   PSR = Φ( (SR − SR*) · √(T − 1) / √(1 − γ₃·SR + (γ₄ − 1)/4 · SR²) )
 */
export function sharpeProbabilistico(e: EntradaPsr): number {
  const variancia = 1 - e.assimetria * e.sharpe + ((e.curtose - 1) / 4) * e.sharpe * e.sharpe;
  const z =
    ((e.sharpe - e.referencia) * Math.sqrt(e.observacoes - 1)) / Math.sqrt(Math.max(variancia, 1e-12));
  return normalAcumulada(z);
}

/** (1 − γ)·Φ⁻¹(1 − 1/N) + γ·Φ⁻¹(1 − 1/(N·e)): o máximo esperado de N normais padrão. */
function maximoPadraoEsperado(tentativas: number): number {
  return (
    (1 - EULER_MASCHERONI) * normalInversa(1 - 1 / tentativas) +
    EULER_MASCHERONI * normalInversa(1 - 1 / (tentativas * Math.E))
  );
}

/**
 * O maior Sharpe que N tentativas SEM habilidade nenhuma (Sharpe verdadeiro zero)
 * produzem em média, dada a variância dos Sharpes entre as tentativas. Com uma
 * tentativa, zero: não houve escolha.
 */
export function sharpeMaximoEsperado(tentativas: number, variancia: number): number {
  if (tentativas < 2 || !(variancia > 0)) return 0;
  return Math.sqrt(variancia) * maximoPadraoEsperado(tentativas);
}

export interface EntradaDsr {
  readonly sharpe: number;
  readonly observacoes: number;
  readonly assimetria: number;
  readonly curtose: number;
  readonly tentativas: number;
  /** Variância dos Sharpes (por período) entre as tentativas. */
  readonly variancia: number;
}

/**
 * DSR: o PSR contra o Sharpe que o acaso produziria escolhendo o melhor de N tentativas
 * (Bailey & López de Prado, 2014, "The Deflated Sharpe Ratio", Journal of Portfolio
 * Management 40(5)). `referencia` é esse Sharpe do acaso, por período.
 */
export function sharpeDeflacionado(e: EntradaDsr): { probabilidade: number; referencia: number } {
  const referencia = sharpeMaximoEsperado(e.tentativas, e.variancia);
  return { probabilidade: sharpeProbabilistico({ ...e, referencia }), referencia };
}

/**
 * MinBTL, em anos: o tamanho mínimo do backtest para que o melhor Sharpe anual de N
 * tentativas sem habilidade NÃO chegue, em média, ao Sharpe observado (Bailey, Borwein,
 * López de Prado & Zhu, 2014, "Pseudo-Mathematics and Financial Charlatanism", Notices
 * of the AMS 61(5)): MinBTL ≈ (E[max_N] / SR anual)². `null` com uma tentativa ou Sharpe ≤ 0.
 */
export function anosMinimosDeBacktest(tentativas: number, sharpeAnual: number): number | null {
  if (tentativas < 2 || !(sharpeAnual > 0)) return null;
  return (maximoPadraoEsperado(tentativas) / sharpeAnual) ** 2;
}

/**
 * Sharpe com desconto por múltiplos testes (Harvey & Liu, 2015, "Backtesting", Journal
 * of Portfolio Management 42(1)), no ajuste de Bonferroni: o valor-p do Sharpe
 * (t = SR anual × √anos, bicaudal) é multiplicado pelo número de tentativas e volta a
 * virar Sharpe. É o mais conservador dos ajustes do artigo. `null` sem Sharpe positivo.
 */
export function sharpeComDesconto(e: {
  readonly sharpeAnual: number;
  readonly anos: number;
  readonly tentativas: number;
}): number | null {
  if (!(e.sharpeAnual > 0 && e.anos > 0)) return null;
  const raiz = Math.sqrt(e.anos);
  const p = 2 * (1 - normalAcumulada(e.sharpeAnual * raiz));
  const ajustado = Math.min(1, p * Math.max(1, e.tentativas));
  if (ajustado >= 1) return 0;
  if (ajustado <= 0) return e.sharpeAnual;
  return Math.max(0, normalInversa(1 - ajustado / 2) / raiz);
}

/** O que o backtest avaliado precisa informar (gravado nas métricas dele). */
export interface SharpeDoBacktest {
  readonly sharpeAnual: number | null;
  readonly observacoes: number;
  readonly assimetria: number;
  readonly curtose: number;
  readonly barrasPorAno: number;
  readonly anos: number;
}

export interface AvaliacaoTentativas {
  readonly tentativas: number;
  /** PSR contra zero: chance de o Sharpe verdadeiro ser positivo, sem contar as tentativas. */
  readonly probabilidadeSharpe: number | null;
  /** DSR: a mesma chance, descontando o melhor que o acaso faria em N tentativas. */
  readonly sharpeDeflacionado: number | null;
  /** O Sharpe anual que o acaso entregaria escolhendo o melhor de N. */
  readonly sharpeMaximoEsperado: number | null;
  readonly anosMinimos: number | null;
  readonly sharpeComDesconto: number | null;
}

function varianciaAmostral(valores: readonly number[]): number {
  const m = momentos(valores);
  return m.desvio * m.desvio;
}

/**
 * Avalia um backtest contra todas as tentativas da mesma estratégia (ele incluído).
 * `sharpesAnuais` tem um item por tentativa; `null` quando a tentativa não tem Sharpe
 * (conta no N, mas não na variância). Com menos de dois Sharpes para medir a dispersão,
 * usa a variância do próprio estimador do Sharpe, (1 + SR²/2)/(T − 1) (Lo, 2002).
 */
export function avaliarTentativas(
  atual: SharpeDoBacktest,
  sharpesAnuais: readonly (number | null)[],
): AvaliacaoTentativas {
  const tentativas = Math.max(1, sharpesAnuais.length);
  const vazio = {
    tentativas,
    probabilidadeSharpe: null,
    sharpeDeflacionado: null,
    sharpeMaximoEsperado: null,
    anosMinimos: null,
    sharpeComDesconto: null,
  };
  if (atual.sharpeAnual === null || atual.observacoes < 2 || !(atual.barrasPorAno > 0)) return vazio;
  const sharpe = atual.sharpeAnual / Math.sqrt(atual.barrasPorAno);
  const conhecidos = sharpesAnuais.filter((s): s is number => s !== null && Number.isFinite(s));
  const variancia =
    conhecidos.length >= 2
      ? varianciaAmostral(conhecidos) / atual.barrasPorAno
      : (1 + (sharpe * sharpe) / 2) / (atual.observacoes - 1);
  const formato = { observacoes: atual.observacoes, assimetria: atual.assimetria, curtose: atual.curtose };
  const dsr = sharpeDeflacionado({ sharpe, ...formato, tentativas, variancia });
  return {
    tentativas,
    probabilidadeSharpe: sharpeProbabilistico({ sharpe, referencia: 0, ...formato }),
    sharpeDeflacionado: dsr.probabilidade,
    sharpeMaximoEsperado: dsr.referencia * Math.sqrt(atual.barrasPorAno),
    anosMinimos: anosMinimosDeBacktest(tentativas, atual.sharpeAnual),
    sharpeComDesconto: sharpeComDesconto({ sharpeAnual: atual.sharpeAnual, anos: atual.anos, tentativas }),
  };
}
