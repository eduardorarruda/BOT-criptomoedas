import type { ContextoMercado } from "../contexto.js";
import { dec, type Valor } from "../dinheiro.js";
import { maiorQuantidade } from "../dimensionamento.js";
import type { Estrategia } from "../estrategia.js";
import { distanciaDeRisco, stopDeEntrada } from "../saidas.js";
import type { FiltrosAtivo } from "../tipos.js";

/**
 * O tamanho de uma entrada que não foi dimensionada (o Claude vetou antes do plano):
 * o mesmo dimensionamento do robô — perder no stop no máximo o risco por operação,
 * sem passar da exposição máxima —, sem os filtros da corretora nem o saldo do
 * momento. Serve para pôr em dinheiro o "e se tivesse aprovado tudo".
 */
export interface PedidoTamanhoCripto {
  readonly estrategia: Estrategia;
  readonly preco: Valor;
  /** O mercado até o candle da decisão (para o stop por ATR e o tamanho pela volatilidade). */
  readonly contexto: ContextoMercado;
  readonly riscoPorOperacao: Valor;
  readonly exposicaoMaxima: Valor;
}

/** Sem lote mínimo nem valor mínimo: a conta pura do risco. */
const FILTROS_LIVRES: FiltrosAtivo = {
  passoQuantidade: dec("0.00000001"),
  quantidadeMinima: dec(0),
  valorMinimo: dec(0),
  passoPreco: dec("0.00000001"),
};

export function tamanhoDeReferenciaCripto(p: PedidoTamanhoCripto): Valor | null {
  if (!p.riscoPorOperacao.gt(0) || !p.exposicaoMaxima.gt(0)) return null;
  const { stop } = stopDeEntrada(p.estrategia, p.preco, p.contexto);
  const distancia = distanciaDeRisco(p.estrategia, p.contexto);
  return maiorQuantidade({
    preco: p.preco,
    stop,
    riscoMaximo: p.riscoPorOperacao,
    disponivel: p.exposicaoMaxima,
    filtros: FILTROS_LIVRES,
    taxa: p.estrategia.taxa,
    ...(distancia ? { distanciaRisco: distancia } : {}),
  });
}
