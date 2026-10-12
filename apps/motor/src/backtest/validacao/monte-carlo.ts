import type { MonteCarlo, ValidacaoPedido } from "@zentrade/contratos";
import { percentil } from "@zentrade/financas";
import { limiteInferior, type Valor } from "@zentrade/dominio";
import type { OperacaoFechada } from "../../historico.js";
import type { PontoCurva } from "../metricas.js";

/** Com menos operações que isto, reamostrar não diz nada. */
export const MINIMO_OPERACOES_MONTE_CARLO = 5;
const BARRAS_HISTOGRAMA = 20;
const PONTOS_LEQUE = 50;

/** Gerador pseudoaleatório mulberry32: rápido, 32 bits e reproduzível pela semente. */
export function geradorComSemente(semente: number): () => number {
  let a = semente >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/** Retorno de cada operação sobre o patrimônio de antes da compra (fração). */
export function retornosDasOperacoes(
  ops: readonly OperacaoFechada[],
  curva: readonly PontoCurva[],
  inicial: Valor,
): number[] {
  return ops.map((o) => {
    const antes = curva[limiteInferior(curva, o.abertaEm, (p) => p.em) - 1]?.patrimonio ?? inicial;
    return antes.isZero() ? 0 : o.resultado.div(antes).toNumber();
  });
}

const faixa = (ordenados: Float64Array | number[]) => {
  const v = Array.from(ordenados).sort((a, b) => a - b);
  return { p5: percentil(v, 0.05), p50: percentil(v, 0.5), p95: percentil(v, 0.95) };
};

function histograma(valores: readonly number[]): MonteCarlo["histograma"] {
  const min = Math.min(...valores);
  const max = Math.max(...valores);
  if (!(max > min)) return [{ de: min, ate: max, quantidade: valores.length }];
  const largura = (max - min) / BARRAS_HISTOGRAMA;
  const contagem = Array<number>(BARRAS_HISTOGRAMA).fill(0);
  for (const v of valores) {
    const i = Math.min(BARRAS_HISTOGRAMA - 1, Math.floor((v - min) / largura));
    contagem[i] = (contagem[i] ?? 0) + 1;
  }
  return contagem.map((quantidade, i) => ({
    de: min + i * largura,
    ate: min + (i + 1) * largura,
    quantidade,
  }));
}

/** Até PONTOS_LEQUE índices de operação, igualmente espaçados, com o 0 e o último. */
function indicesDoLeque(n: number): number[] {
  if (n + 1 <= PONTOS_LEQUE) return Array.from({ length: n + 1 }, (_, i) => i);
  const passo = n / (PONTOS_LEQUE - 1);
  return Array.from({ length: PONTOS_LEQUE }, (_, i) => Math.round(i * passo));
}

/**
 * Monte Carlo da sequência de operações: cada simulação sorteia, COM reposição, tantas
 * operações quanto o backtest teve e compõe os retornos. Supõe que as operações são
 * independentes entre si (sem sequências de perdas que vêm juntas por causa do
 * mercado) — se elas vêm em rajadas, o risco real é maior que o mostrado.
 * Ruína = em algum momento o patrimônio cair `limiteRuina` do inicial.
 */
export function simularMonteCarlo(
  retornos: readonly number[],
  o: Pick<ValidacaoPedido, "simulacoes" | "semente" | "limiteRuina">,
): MonteCarlo | null {
  const n = retornos.length;
  if (n < MINIMO_OPERACOES_MONTE_CARLO) return null;
  const sortear = geradorComSemente(o.semente);
  const indices = indicesDoLeque(n);
  // Patrimônio de cada simulação em cada ponto do leque: [ponto k][simulação s] achatado.
  const caminhos = new Float64Array(indices.length * o.simulacoes);
  const finais = new Float64Array(o.simulacoes);
  const quedas = new Float64Array(o.simulacoes);
  let ruinas = 0;
  for (let s = 0; s < o.simulacoes; s++) {
    let patrimonio = 1;
    let pico = 1;
    let pior = 0;
    let arruinou = false;
    let k = 0;
    for (let j = 0; j <= n; j++) {
      if (j > 0) {
        patrimonio *= 1 + (retornos[Math.floor(sortear() * n)] ?? 0);
        pico = Math.max(pico, patrimonio);
        pior = Math.max(pior, 1 - patrimonio / pico);
        if (patrimonio <= 1 - o.limiteRuina) arruinou = true;
      }
      if (indices[k] === j) caminhos[k++ * o.simulacoes + s] = patrimonio;
    }
    finais[s] = patrimonio - 1;
    quedas[s] = pior;
    if (arruinou) ruinas++;
  }
  return {
    simulacoes: o.simulacoes,
    semente: o.semente,
    limiteRuina: o.limiteRuina,
    operacoes: n,
    retornoFinal: faixa(finais),
    maiorQueda: faixa(quedas),
    probabilidadeRuina: ruinas / o.simulacoes,
    histograma: histograma(Array.from(finais)),
    leque: indices.map((operacao, k) => ({
      operacao,
      ...faixa(caminhos.subarray(k * o.simulacoes, (k + 1) * o.simulacoes)),
    })),
  };
}
