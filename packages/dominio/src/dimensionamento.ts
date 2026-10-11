import { dec, type Valor } from "./dinheiro.js";
import type { FiltrosAtivo } from "./tipos.js";

export interface EntradaDimensionamento {
  readonly preco: Valor;
  readonly stop: Valor;
  /** Quanto se aceita perder, em moeda de cotação, se o stop for atingido. */
  readonly riscoMaximo: Valor;
  /** O que pode ser gasto agora: o menor entre saldo livre e exposição restante. */
  readonly disponivel: Valor;
  readonly filtros: FiltrosAtivo;
  readonly taxa: number;
}

/**
 * Maior quantidade, em múltiplos do passo do lote, que respeita o risco, o saldo e
 * os limites da corretora — ou `null` se nem o mínimo cabe.
 *
 * "Cabe" é monotônico (se k passos cabem, k − 1 também), então a resposta sai por
 * busca binária em O(log n) sobre o número de passos. Hoje a perda é linear e daria
 * para dividir direto; a busca continua correta quando a viabilidade ganhar termos
 * não lineares, como o deslizamento estimado no livro de ofertas.
 */
export function maiorQuantidade(e: EntradaDimensionamento): Valor | null {
  if (e.stop.gte(e.preco)) throw new RangeError("o stop precisa ficar abaixo do preço de entrada");
  const { passoQuantidade: passo, quantidadeMinima, quantidadeMaxima, valorMinimo } = e.filtros;
  const taxa = dec(e.taxa);
  const perdaPorUnidade = e.preco.minus(e.stop).plus(e.preco.times(taxa)).plus(e.stop.times(taxa));
  const custoPorUnidade = e.preco.times(dec(1).plus(taxa));

  const cabe = (passos: Valor): boolean => {
    const q = passos.times(passo);
    return q.times(perdaPorUnidade).lte(e.riscoMaximo) && q.times(custoPorUnidade).lte(e.disponivel);
  };

  let baixo = dec(0);
  let alto = e.disponivel.div(custoPorUnidade).div(passo).floor();
  if (quantidadeMaxima) alto = menor(alto, quantidadeMaxima.div(passo).floor());
  while (baixo.lt(alto)) {
    const meio = baixo.plus(alto).plus(1).div(2).floor();
    if (cabe(meio)) baixo = meio;
    else alto = meio.minus(1);
  }

  const q = baixo.times(passo);
  if (q.isZero() || q.lt(quantidadeMinima) || q.times(e.preco).lt(valorMinimo)) return null;
  return q;
}

const menor = (a: Valor, b: Valor): Valor => (a.lt(b) ? a : b);
