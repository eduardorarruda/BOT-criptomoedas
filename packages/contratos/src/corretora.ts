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
 * Ids da proteção na corretora, gerados por quem a coloca (idempotência). `lista`
 * identifica o conjunto (listClientOrderId do OCO; no stop sozinho, igual ao `stop`);
 * cada perna tem o seu (newClientOrderId). Até 36 caracteres em [a-zA-Z0-9-_].
 */
export interface IdsProtecao {
  readonly lista: string;
  readonly stop: string;
  readonly alvo?: string;
}

/**
 * Venda de proteção que fica no livro da corretora, viva mesmo com o motor fora do ar:
 * stop-limit (STOP_LOSS_LIMIT) ou, com alvo, OCO — alvo LIMIT_MAKER + stop-limit; a
 * perna que executar cancela a outra.
 */
export interface PedidoProtecao {
  readonly simbolo: string;
  readonly quantidade: Valor;
  /** Preço que dispara a venda (stopPrice). Precisa estar abaixo do preço de agora. */
  readonly stop: Valor;
  /** Preço limite da venda disparada: um pouco abaixo do stop, para executar num mercado rápido. */
  readonly limite: Valor;
  /** Com alvo, OCO. Precisa estar acima do preço de agora. */
  readonly alvo?: Valor;
  readonly ids: IdsProtecao;
}

/**
 * ATIVA: alguma perna ainda está no livro (pode já ter executado em parte).
 * EXECUTADA: nada no livro e uma perna executou por inteiro.
 * CANCELADA: nada no livro e nenhuma perna executou por inteiro (pode ter execução parcial).
 * REJEITADA: a corretora recusou ao colocar; nada entrou no livro.
 */
export type EstadoProtecao = "ATIVA" | "EXECUTADA" | "CANCELADA" | "REJEITADA";

export interface PernaProtecao {
  readonly perna: "stop" | "alvo";
  /** O que a perna fez: o idCliente dela, o estado e as execuções confirmadas (venda). */
  readonly ordem: ResultadoOrdem;
}

export interface ResultadoProtecao {
  readonly estado: EstadoProtecao;
  /** orderListId do OCO ou orderId do stop sozinho. */
  readonly idCorretora: string | null;
  readonly pernas: readonly PernaProtecao[];
  readonly motivo?: string;
}

/** Todas as execuções da proteção (de qualquer perna), na ordem das pernas. */
export const execucoesDaProtecao = (r: ResultadoProtecao) => r.pernas.flatMap((p) => p.ordem.execucoes);

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
   * Coloca a proteção (stop-limit ou OCO). Recusa definitiva volta REJEITADA, sem lançar.
   * Falha sem resposta: confere pelos ids antes de desistir; sem conseguir saber, lança
   * ErroOrdemIncerta — quem chama não coloca outra até conferir.
   */
  colocarProtecao(pedido: PedidoProtecao): Promise<ResultadoProtecao>;
  /** O estado de agora, com as execuções de cada perna. `null` se a corretora não conhece os ids. */
  consultarProtecao(simbolo: string, ids: IdsProtecao): Promise<ResultadoProtecao | null>;
  /**
   * Cancela o que ainda estiver no livro e devolve o estado final, que pode ser
   * EXECUTADA (executou antes do cancelamento chegar). `null` se não conhece os ids.
   */
  cancelarProtecao(simbolo: string, ids: IdsProtecao): Promise<ResultadoProtecao | null>;
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
