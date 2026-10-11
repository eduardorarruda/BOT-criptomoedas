import type { OrigemNegociacao } from "@zentrade/contratos";
import type { Lado, Valor } from "@zentrade/dominio";

/** A moeda de referência da carteira. */
export const USDT = "USDT";

/**
 * Uma negociação da conta (um fill do /api/v3/myTrades), já com as conversões para
 * USDT do instante em que aconteceu. `cotacaoUsdt` = quanto 1 unidade da moeda de
 * cotação valia em USDT; `taxaUsdt` = a taxa paga, em USDT. Null = sem preço para converter.
 */
export interface Negociacao {
  readonly id: string;
  readonly simbolo: string;
  readonly base: string;
  readonly cotacao: string;
  readonly lado: Lado;
  readonly preco: Valor;
  readonly quantidade: Valor;
  readonly valorCotacao: Valor;
  readonly taxa: Valor;
  readonly ativoTaxa: string;
  readonly cotacaoUsdt: Valor | null;
  readonly taxaUsdt: Valor | null;
  readonly origem: OrigemNegociacao;
  readonly idOrdem: string;
  readonly em: number;
}

/**
 * O efeito de uma negociação sobre UMA moeda. Uma negociação BTCUSDT mexe só no BTC
 * (USDT é a referência); ETHBTC compra ETH e vende BTC; taxa em BNB consome BNB.
 */
export interface Movimento {
  readonly ativo: string;
  /** "taxa": a moeda foi gasta pagando taxa de outra negociação (sai pelo custo médio, sem resultado). */
  readonly tipo: "compra" | "venda" | "taxa";
  readonly quantidade: Valor;
  /** Preço de 1 unidade em USDT no instante; null = sem conversão (fica fora do cálculo). */
  readonly precoUsdt: Valor | null;
  /** Taxa atribuída a este movimento, em USDT; null = taxa sem conversão. */
  readonly taxaUsdt: Valor | null;
  readonly origem: OrigemNegociacao;
  readonly em: number;
  readonly negociacaoId: string;
}

export interface SaldoConta {
  readonly livre: Valor;
  readonly bloqueado: Valor;
}
