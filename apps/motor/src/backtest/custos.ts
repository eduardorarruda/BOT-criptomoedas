import type { CustosBacktest } from "@zentrade/contratos";
import { dec, type Execucao, type Valor } from "@zentrade/dominio";

/** Sem custo nenhum: só para testes e comparação (o resultado "bruto" de verdade). */
export const SEM_CUSTOS: CustosBacktest = { taxaPorLado: 0, deslizamentoBps: 0, meioSpreadBps: 0 };

/** Pontos-base contra quem opera em cada execução: deslizamento mais meio spread. */
export const bpsContra = (c: CustosBacktest): number => c.deslizamentoBps + c.meioSpreadBps;

/**
 * Quanto o deslizamento (com o meio spread) custou nas execuções. A corretora de papel
 * executa a `referência × (1 ± f)`; daí o custo de cada execução é
 * compra: q × preço × f/(1 + f); venda: q × preço × f/(1 − f).
 */
export function custoDeslizamento(execucoes: readonly Execucao[], bps: number): Valor {
  const f = dec(bps).div(10_000);
  if (f.isZero()) return dec(0);
  return execucoes.reduce((soma, e) => {
    const valor = e.quantidade.times(e.preco);
    const divisor = e.lado === "COMPRA" ? dec(1).plus(f) : dec(1).minus(f);
    return soma.plus(valor.times(f).div(divisor));
  }, dec(0));
}
