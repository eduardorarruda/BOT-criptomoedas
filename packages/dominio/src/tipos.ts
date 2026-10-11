import type { Valor } from "./dinheiro.js";

export type Lado = "COMPRA" | "VENDA";

/** Uma vela fechada. Horários em milissegundos UTC. */
export interface Candle {
  readonly abertura: number;
  readonly fechamento: number;
  readonly abre: Valor;
  readonly maxima: Valor;
  readonly minima: Valor;
  readonly fecha: Valor;
  readonly volume: Valor;
}

/**
 * Execução confirmada pela corretora. `quantidade` é a quantidade líquida recebida
 * (quando a taxa sai no próprio ativo, o adaptador já desconta) e `taxaCotacao` é a
 * taxa convertida para a moeda de cotação (USDT).
 */
export interface Execucao {
  readonly lado: Lado;
  readonly preco: Valor;
  readonly quantidade: Valor;
  readonly taxaCotacao: Valor;
  readonly em: number;
}

/** Regras do ativo na corretora (filtros LOT_SIZE, MIN_NOTIONAL e PRICE_FILTER da Binance). */
export interface FiltrosAtivo {
  readonly passoQuantidade: Valor;
  readonly quantidadeMinima: Valor;
  readonly quantidadeMaxima?: Valor;
  readonly valorMinimo: Valor;
  readonly passoPreco: Valor;
}
