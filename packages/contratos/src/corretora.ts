import type { Candle, Execucao, FiltrosAtivo, Lado, NivelLivro, Valor } from "@zentrade/dominio";
import type { Intervalo, Rede } from "./comum.js";
import type { EstadoOrdem } from "./dados.js";

export interface ResultadoOrdem {
  readonly idCliente: string;
  readonly idCorretora: string | null;
  readonly estado: EstadoOrdem;
  readonly execucoes: readonly Execucao[];
  readonly motivo?: string;
}

export interface PedidoOrdemMercado {
  readonly simbolo: string;
  readonly lado: Lado;
  readonly quantidade: Valor;
  /** Idempotência: reenviar com o mesmo id não cria segunda ordem. */
  readonly idCliente: string;
}

export type EstadoConexao = "conectado" | "reconectando" | "desconectado";

/**
 * Tudo o que o motor precisa de uma corretora. Implementações: Binance (real e
 * testnet) e corretora de papel (simulada). Uma fonte só de preço por robô — o bot
 * antigo misturava a Binance real com a testnet e comparava mercados diferentes.
 */
export interface Corretora {
  readonly rede: Rede;
  filtros(simbolo: string): Promise<FiltrosAtivo>;
  /** Candles FECHADOS, do mais antigo ao mais recente. `fim` exclusivo, em ms. */
  candles(simbolo: string, intervalo: Intervalo, limite: number, fim?: number): Promise<Candle[]>;
  livro(simbolo: string, profundidade: number): Promise<{ compras: NivelLivro[]; vendas: NivelLivro[] }>;
  saldoLivre(ativo: string): Promise<Valor>;
  enviarOrdemMercado(pedido: PedidoOrdemMercado): Promise<ResultadoOrdem>;
  consultarOrdem(simbolo: string, idCliente: string): Promise<ResultadoOrdem | null>;
  /**
   * Chama `aoFechar` a cada candle fechado e `aoEstado` quando a conexão muda.
   * Reconecta sozinha com espera crescente. Devolve a função que encerra a assinatura.
   */
  assinarCandles(
    simbolo: string,
    intervalo: Intervalo,
    aoFechar: (candle: Candle) => void,
    aoEstado?: (estado: EstadoConexao) => void,
  ): () => void;
}
