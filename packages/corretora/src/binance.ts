import type {
  Corretora,
  EstadoConexao,
  Intervalo,
  PedidoOrdemMercado,
  ResultadoOrdem,
} from "@zentrade/contratos";
import {
  dec,
  paraTexto,
  type Candle,
  type FiltrosAtivo,
  type NivelLivro,
  type Valor,
} from "@zentrade/dominio";
import { ClienteBinance } from "./cliente.js";
import { candleDeKline, filtrosDoSimbolo, type AtivosDoPar } from "./conversao.js";
import { ErroConfiguracao, ErroCorretora } from "./erros.js";
import { RespostaConta, RespostaExchangeInfo, RespostaKlines, RespostaLivro } from "./esquemas.js";
import { OrdensBinance } from "./binance-ordens.js";
import { URLS_BINANCE, type RedeBinance } from "./urls.js";
import { assinarKlines, type OpcoesAssinatura } from "./websocket.js";
import type { Disjuntor } from "./disjuntor.js";

export interface OpcoesBinance {
  /** Bloqueio por IP compartilhado no processo (disjuntorDaRede). */
  readonly disjuntor?: Disjuntor;
  readonly rede: RedeBinance;
  readonly apiKey?: string | undefined;
  readonly apiSecret?: string | undefined;
  /** Taxa usada para estimar comissões pagas em terceiro ativo (BNB). Padrão 0,1%. */
  readonly taxaEstimada?: number;
  readonly fetch?: typeof fetch;
  readonly agora?: () => number;
  readonly dormir?: (ms: number) => Promise<void>;
  readonly timeoutMs?: number;
  /** Substitui o endereço do WebSocket (testes com servidor local). */
  readonly urlWebSocket?: string;
  readonly aoErroWebSocket?: (erro: Error) => void;
  readonly websocket?: Partial<
    Pick<OpcoesAssinatura, "esperaInicialMs" | "esperaMaximaMs" | "silencioMaximoMs">
  >;
}

interface InfoSimbolo {
  readonly filtros: FiltrosAtivo;
  readonly ativos: AtivosDoPar;
}

const LIMITE_KLINES = 1000;

/** Corretora Binance spot, real ou testnet — nunca as duas no mesmo objeto. */
export class BinanceCorretora implements Corretora {
  readonly rede: RedeBinance;
  private readonly cliente: ClienteBinance;
  private readonly ordens: OrdensBinance;
  private readonly infos = new Map<string, Promise<InfoSimbolo>>();

  constructor(private readonly opcoes: OpcoesBinance) {
    if (!(opcoes.rede in URLS_BINANCE))
      throw new ErroConfiguracao(
        `Rede "${String(opcoes.rede)}" inválida para a Binance: use "testnet" ou "real".`,
      );
    this.rede = opcoes.rede;
    this.cliente = new ClienteBinance({
      urlBase: URLS_BINANCE[opcoes.rede].rest,
      apiKey: opcoes.apiKey,
      apiSecret: opcoes.apiSecret,
      ...(opcoes.fetch ? { fetch: opcoes.fetch } : {}),
      ...(opcoes.agora ? { agora: opcoes.agora } : {}),
      ...(opcoes.timeoutMs ? { timeoutMs: opcoes.timeoutMs } : {}),
      ...(opcoes.disjuntor ? { disjuntor: opcoes.disjuntor } : {}),
    });
    this.ordens = new OrdensBinance(
      this.cliente,
      (s) => this.ativos(s),
      opcoes.taxaEstimada ?? 0.001,
      opcoes.dormir ?? ((ms) => new Promise((r) => setTimeout(r, ms))),
    );
  }

  async filtros(simbolo: string): Promise<FiltrosAtivo> {
    return (await this.info(simbolo)).filtros;
  }

  async ativos(simbolo: string): Promise<AtivosDoPar> {
    return (await this.info(simbolo)).ativos;
  }

  async candles(simbolo: string, intervalo: Intervalo, limite: number, fim?: number): Promise<Candle[]> {
    if (!Number.isInteger(limite) || limite < 1 || limite > LIMITE_KLINES)
      throw new RangeError(`O limite de candles precisa estar entre 1 e ${LIMITE_KLINES} (veio ${limite}).`);
    const linhas = await this.cliente.publico(
      "/api/v3/klines",
      {
        symbol: simbolo,
        interval: intervalo,
        limit: limite,
        endTime: fim === undefined ? undefined : fim - 1,
      },
      RespostaKlines,
    );
    const agora = this.cliente.agoraServidor();
    // O último candle da Binance pode estar em andamento: decidir sobre ele é decidir sobre um preço que ainda muda.
    return linhas.map(candleDeKline).filter((c) => c.fechamento < agora);
  }

  async livro(
    simbolo: string,
    profundidade: number,
  ): Promise<{ compras: NivelLivro[]; vendas: NivelLivro[] }> {
    const r = await this.cliente.publico(
      "/api/v3/depth",
      { symbol: simbolo, limit: profundidade },
      RespostaLivro,
    );
    const nivel = ([preco, quantidade]: readonly [string, string]): NivelLivro => ({
      preco: dec(preco),
      quantidade: dec(quantidade),
    });
    return { compras: r.bids.map(nivel), vendas: r.asks.map(nivel) };
  }

  async saldoLivre(ativo: string): Promise<Valor> {
    const conta = await this.cliente.assinado(
      "GET",
      "/api/v3/account",
      { omitZeroBalances: true },
      RespostaConta,
    );
    const saldo = conta.balances.find((b) => b.asset === ativo);
    return saldo ? dec(saldo.free) : dec(0);
  }

  enviarOrdemMercado(pedido: PedidoOrdemMercado): Promise<ResultadoOrdem> {
    return this.ordens.enviarMercado(pedido, paraTexto(pedido.quantidade));
  }

  consultarOrdem(simbolo: string, idCliente: string): Promise<ResultadoOrdem | null> {
    return this.ordens.consultar(simbolo, idCliente);
  }

  assinarCandles(
    simbolo: string,
    intervalo: Intervalo,
    aoFechar: (candle: Candle) => void,
    aoEstado?: (estado: EstadoConexao) => void,
  ): () => void {
    const base = this.opcoes.urlWebSocket ?? URLS_BINANCE[this.rede].websocket;
    return assinarKlines({
      ...this.opcoes.websocket,
      url: `${base}/ws/${simbolo.toLowerCase()}@kline_${intervalo}`,
      aoFechar,
      aoEstado,
      aoErro: this.opcoes.aoErroWebSocket,
    });
  }

  private info(simbolo: string): Promise<InfoSimbolo> {
    const emCache = this.infos.get(simbolo);
    if (emCache) return emCache;
    const buscando = this.buscarInfo(simbolo);
    this.infos.set(simbolo, buscando);
    // Falha não fica em cache: a próxima chamada tenta de novo.
    buscando.catch(() => this.infos.delete(simbolo));
    return buscando;
  }

  private async buscarInfo(simbolo: string): Promise<InfoSimbolo> {
    const r = await this.cliente.publico("/api/v3/exchangeInfo", { symbol: simbolo }, RespostaExchangeInfo);
    const s = r.symbols.find((x) => x.symbol === simbolo);
    if (!s)
      throw new ErroCorretora(
        `A Binance (${this.rede}) não lista o símbolo ${simbolo}. Confira o nome do par (ex.: BTCUSDT).`,
      );
    return { filtros: filtrosDoSimbolo(s.filters), ativos: { base: s.baseAsset, cotacao: s.quoteAsset } };
  }
}
