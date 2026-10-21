import { intervaloWilson, type Intervalo } from "@zentrade/dominio";
import { aleatorio } from "./aleatorio.js";

/** Um sinal já analisado pelo Claude e com o desfecho da regra pura (resolvido). */
export interface SinalAvaliado {
  readonly simbolo: string;
  readonly ate: number;
  readonly aprovou: boolean;
  /** Resultado líquido em US$ com o mesmo tamanho por operação. */
  readonly resultadoUsd: number;
  /** Resultado ÷ valor da entrada (0,02 = +2%). */
  readonly retorno: number;
}

export interface MetricasDoConjunto {
  readonly n: number;
  readonly acertos: number;
  readonly acerto: number | null;
  /** Média dos retornos positivos, em %. */
  readonly ganhoMedioPct: number | null;
  /** Média dos retornos não positivos, em % (negativa). */
  readonly perdaMediaPct: number | null;
  /** Soma dos retornos de cada operação, em pontos percentuais. */
  readonly somaPct: number;
  readonly mediaPct: number | null;
  readonly somaUsd: number;
}

export interface Proporcao {
  readonly acertos: number;
  readonly total: number;
  readonly taxa: number | null;
  readonly intervalo: Intervalo;
}

export interface Aleatorio {
  readonly rodadas: number;
  /** Quantas entradas cada rodada sorteou: as mesmas que o Claude aprovou. */
  readonly sorteadas: number;
  readonly mediaUsd: number;
  /** Média das rodadas: soma dos retornos (pontos percentuais) e fração de entradas que lucraram. */
  readonly mediaSomaPct: number;
  readonly acertoMedio: number | null;
  readonly p5Usd: number;
  readonly p95Usd: number;
  /** Fração das rodadas em que o acaso fez ao menos o que o Claude fez. */
  readonly acasoIgualouOuMelhorou: number;
}

export type Veredito = "agrega" | "tira" | "indistinguivel" | "sem_filtro";

export interface ComparacaoReplay {
  readonly puro: MetricasDoConjunto;
  readonly comClaude: MetricasDoConjunto;
  readonly vetados: MetricasDoConjunto;
  readonly aprovacoes: Proporcao;
  readonly vetos: Proporcao;
  readonly taxaDeAprovacao: number | null;
  readonly aleatorio: Aleatorio | null;
  readonly diferencaParaPuroUsd: number;
  readonly veredito: Veredito;
}

const soma = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);
const media = (xs: readonly number[]) => (xs.length === 0 ? null : soma(xs) / xs.length);

export function metricasDe(lista: readonly SinalAvaliado[]): MetricasDoConjunto {
  const ganhos = lista.filter((s) => s.resultadoUsd > 0).map((s) => s.retorno * 100);
  const perdas = lista.filter((s) => s.resultadoUsd <= 0).map((s) => s.retorno * 100);
  const todos = lista.map((s) => s.retorno * 100);
  return {
    n: lista.length,
    acertos: ganhos.length,
    acerto: lista.length === 0 ? null : ganhos.length / lista.length,
    ganhoMedioPct: media(ganhos),
    perdaMediaPct: media(perdas),
    somaPct: soma(todos),
    mediaPct: media(todos),
    somaUsd: soma(lista.map((s) => s.resultadoUsd)),
  };
}

const proporcao = (acertos: number, total: number): Proporcao => ({
  acertos,
  total,
  taxa: total === 0 ? null : acertos / total,
  intervalo: intervaloWilson(acertos, total),
});

/** Percentil por interpolação linear numa lista já ordenada. */
function percentil(ordenada: readonly number[], p: number): number {
  const posicao = (ordenada.length - 1) * p;
  const baixo = Math.floor(posicao);
  const alto = Math.ceil(posicao);
  const a = ordenada[baixo] ?? 0;
  const b = ordenada[alto] ?? 0;
  return a + (b - a) * (posicao - baixo);
}

/** `k` índices sorteados sem repetição de 0..n-1 (Fisher-Yates parcial). */
function sortear(n: number, k: number, sorteio: () => number): number[] {
  const indices = Array.from({ length: n }, (_, i) => i);
  for (let i = 0; i < k; i++) {
    const j = i + Math.floor(sorteio() * (n - i));
    [indices[i], indices[j]] = [indices[j] as number, indices[i] as number];
  }
  return indices.slice(0, k);
}

/**
 * O filtro aleatório com a MESMA taxa de aprovação do Claude: em cada rodada sorteia, sem
 * repetição, tantos sinais quantos o Claude aprovou e soma o resultado deles. A semente é
 * fixa: o mesmo relatório sai igual.
 */
export function filtroAleatorio(
  lista: readonly SinalAvaliado[],
  aprovados: number,
  rodadas: number,
  semente: number,
  resultadoDoClaudeUsd: number,
): Aleatorio {
  const sorteio = aleatorio(semente);
  const rodadasFeitas = Array.from({ length: rodadas }, () => {
    const escolhidas = sortear(lista.length, aprovados, sorteio).map((i) => lista[i] as SinalAvaliado);
    return metricasDe(escolhidas);
  });
  const somas = rodadasFeitas.map((m) => m.somaUsd).sort((a, b) => a - b);
  const acertos = rodadasFeitas.flatMap((m) => (m.acerto === null ? [] : [m.acerto]));
  return {
    rodadas,
    sorteadas: aprovados,
    mediaUsd: soma(somas) / rodadas,
    mediaSomaPct: soma(rodadasFeitas.map((m) => m.somaPct)) / rodadas,
    acertoMedio: media(acertos),
    p5Usd: percentil(somas, 0.05),
    p95Usd: percentil(somas, 0.95),
    acasoIgualouOuMelhorou: somas.filter((x) => x >= resultadoDoClaudeUsd - 1e-9).length / rodadas,
  };
}

/**
 * Regra do veredito, fixada ANTES de ver os resultados: o resultado líquido em US$ das
 * entradas que o Claude aprovou é comparado com o do filtro aleatório de mesma taxa de
 * aprovação. Acima do p95 do acaso: o Claude agrega. Abaixo do p5: tira. Entre os dois:
 * indistinguível do acaso. Se aprovou tudo ou nada, não houve filtro para avaliar.
 */
export function compararReplay(
  lista: readonly SinalAvaliado[],
  opcoes: { readonly rodadas: number; readonly semente: number },
): ComparacaoReplay {
  const aprovados = lista.filter((s) => s.aprovou);
  const vetados = lista.filter((s) => !s.aprovou);
  const puro = metricasDe(lista);
  const comClaude = metricasDe(aprovados);
  const filtrou = aprovados.length > 0 && vetados.length > 0;
  const aleatorioAmostra = filtrou
    ? filtroAleatorio(lista, aprovados.length, opcoes.rodadas, opcoes.semente, comClaude.somaUsd)
    : null;
  const veredito: Veredito = !aleatorioAmostra
    ? "sem_filtro"
    : comClaude.somaUsd > aleatorioAmostra.p95Usd
      ? "agrega"
      : comClaude.somaUsd < aleatorioAmostra.p5Usd
        ? "tira"
        : "indistinguivel";
  return {
    puro,
    comClaude,
    vetados: metricasDe(vetados),
    aprovacoes: proporcao(aprovados.filter((s) => s.resultadoUsd > 0).length, aprovados.length),
    vetos: proporcao(vetados.filter((s) => s.resultadoUsd <= 0).length, vetados.length),
    taxaDeAprovacao: lista.length === 0 ? null : aprovados.length / lista.length,
    aleatorio: aleatorioAmostra,
    diferencaParaPuroUsd: comClaude.somaUsd - puro.somaUsd,
    veredito,
  };
}
