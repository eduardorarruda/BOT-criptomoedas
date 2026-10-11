import { dec, type Valor } from "./dinheiro.js";
import type { Execucao } from "./tipos.js";

/**
 * A posição não é gravada: é derivada das execuções confirmadas pela corretora.
 * Preço médio ponderado; resultado realizado já líquido de taxas.
 */
export interface Posicao {
  readonly quantidade: Valor;
  readonly precoMedio: Valor;
  readonly resultadoRealizado: Valor;
  readonly taxasPagas: Valor;
}

export class ErroPosicao extends Error {
  override name = "ErroPosicao";
}

export const POSICAO_ZERADA: Posicao = Object.freeze({
  quantidade: dec(0),
  precoMedio: dec(0),
  resultadoRealizado: dec(0),
  taxasPagas: dec(0),
});

export function aplicarExecucao(p: Posicao, ex: Execucao): Posicao {
  if (ex.quantidade.lte(0)) throw new ErroPosicao("a quantidade da execução precisa ser positiva");
  const taxasPagas = p.taxasPagas.plus(ex.taxaCotacao);

  if (ex.lado === "COMPRA") {
    const quantidade = p.quantidade.plus(ex.quantidade);
    const custo = p.quantidade.times(p.precoMedio).plus(ex.quantidade.times(ex.preco));
    return {
      quantidade,
      precoMedio: custo.div(quantidade),
      resultadoRealizado: p.resultadoRealizado.minus(ex.taxaCotacao),
      taxasPagas,
    };
  }

  if (ex.quantidade.gt(p.quantidade)) {
    throw new ErroPosicao(
      `venda de ${ex.quantidade.toFixed()} é mais do que a posição de ${p.quantidade.toFixed()}`,
    );
  }
  const quantidade = p.quantidade.minus(ex.quantidade);
  return {
    quantidade,
    precoMedio: quantidade.isZero() ? dec(0) : p.precoMedio,
    resultadoRealizado: p.resultadoRealizado
      .plus(ex.preco.minus(p.precoMedio).times(ex.quantidade))
      .minus(ex.taxaCotacao),
    taxasPagas,
  };
}

export const posicaoDe = (execucoes: readonly Execucao[]): Posicao =>
  execucoes.reduce(aplicarExecucao, POSICAO_ZERADA);
