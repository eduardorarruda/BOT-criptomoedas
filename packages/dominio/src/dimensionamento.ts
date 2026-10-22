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
  /**
   * Tamanho pela volatilidade (opcional): distância de preço usada para medir o
   * risco, como k × ATR. Vale a MAIOR entre ela e a distância até o stop — assim o
   * risco por operação é respeitado mesmo se o stop estiver mais longe.
   */
  readonly distanciaRisco?: Valor;
  /**
   * Tamanho por alocação (opcional): compra este valor, em moeda de cotação, e NÃO olha o
   * risco por operação — para estratégias sem stop de verdade, como o cofre de tendência.
   * O saldo livre e a exposição restante (`disponivel`) e os filtros da corretora continuam
   * valendo.
   */
  readonly valorAlvo?: Valor;
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
  const saida = precoDeSaida(e);
  const perdaPorUnidade = e.preco.minus(saida).plus(e.preco.times(taxa)).plus(saida.times(taxa));
  const custoPorUnidade = e.preco.times(dec(1).plus(taxa));

  const orcamento = e.valorAlvo ? menor(e.disponivel, e.valorAlvo) : e.disponivel;
  const cabe = (passos: Valor): boolean => {
    const q = passos.times(passo);
    const noRisco = e.valorAlvo !== undefined || q.times(perdaPorUnidade).lte(e.riscoMaximo);
    return noRisco && q.times(custoPorUnidade).lte(orcamento);
  };

  let baixo = dec(0);
  let alto = orcamento.div(custoPorUnidade).div(passo).floor();
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

/** Preço de saída pessimista: o stop ou, com distância de risco maior, preço − distância (nunca abaixo de zero). */
function precoDeSaida(e: EntradaDimensionamento): Valor {
  if (!e.distanciaRisco) return e.stop;
  const porDistancia = e.preco.minus(e.distanciaRisco);
  return menor(e.stop, porDistancia.lt(0) ? dec(0) : porDistancia);
}
