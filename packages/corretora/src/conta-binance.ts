import { dec, type Valor } from "@zentrade/dominio";
import { ClienteBinance, type Parametros } from "./cliente.js";
import type { AtivosDoPar } from "./conversao.js";
import { ErroConfiguracao } from "./erros.js";
import {
  RespostaContaCompleta,
  RespostaKlines,
  RespostaMinhasNegociacoes,
  RespostaPares,
  RespostaPrecos,
  RespostaRestricoes,
  RespostaTodasOrdens,
} from "./esquemas.js";
import { URLS_BINANCE, type RedeBinance } from "./urls.js";
import type { z } from "zod";
import type { Disjuntor } from "./disjuntor.js";

/**
 * Leitura da conta da pessoa na Binance, para a carteira: saldos, negociações, ordens
 * (para saber quais o robô enviou), preços atuais e históricos e as permissões da chave.
 * Nada aqui envia ordem: uma chave só de leitura basta.
 *
 * Peso: a Binance soma o peso das requisições por IP e por minuto (limite de 6000) e
 * informa o total no cabeçalho X-MBX-USED-WEIGHT-1M. Antes de cada chamada, se o
 * peso usado mais o da chamada passar do limite seguro, espera o minuto virar. Se ainda
 * assim vier 429, o erro (ErroLimiteRequisicoes) sobe para quem chamou.
 */
export interface OpcoesConta {
  /** Bloqueio por IP compartilhado no processo (disjuntorDaRede). */
  readonly disjuntor?: Disjuntor;
  readonly rede: RedeBinance;
  readonly apiKey: string;
  readonly apiSecret: string;
  readonly fetch?: typeof fetch;
  readonly agora?: () => number;
  readonly dormir?: (ms: number) => Promise<void>;
  readonly timeoutMs?: number;
  /** Peso por minuto que a conta se permite usar (padrão 4800, 80% do limite de 6000). */
  readonly limitePeso?: number;
}

export interface SaldoBinance {
  readonly ativo: string;
  readonly livre: Valor;
  readonly bloqueado: Valor;
}

export interface NegociacaoBruta {
  readonly simbolo: string;
  readonly id: number;
  readonly orderId: number;
  readonly preco: Valor;
  readonly quantidade: Valor;
  readonly valorCotacao: Valor;
  readonly taxa: Valor;
  readonly ativoTaxa: string;
  readonly em: number;
  readonly isBuyer: boolean;
}

export interface RestricoesChave {
  readonly podeLer: boolean;
  readonly podeSacar: boolean;
  readonly podeNegociar: boolean;
  readonly ipRestrito: boolean;
}

const PESO = {
  conta: 20,
  negociacoes: 20,
  ordens: 20,
  precos: 4,
  pares: 20,
  velas: 2,
  restricoes: 1,
} as const;
const PAGINA = 1000;
const MINUTO = 60_000;
const VALIDADE_PARES_MS = 60 * MINUTO;
const USDT = "USDT";

export class ContaBinance {
  readonly rede: RedeBinance;
  private readonly cliente: ClienteBinance;
  private readonly dormir: (ms: number) => Promise<void>;
  private readonly agora: () => number;
  private readonly limitePeso: number;
  private paresEmCache: { em: number; pares: Promise<Map<string, AtivosDoPar>> } | null = null;
  private readonly velas = new Map<string, Valor | null>();

  constructor(opcoes: OpcoesConta) {
    if (!(opcoes.rede in URLS_BINANCE))
      throw new ErroConfiguracao(
        `Rede "${String(opcoes.rede)}" inválida para a Binance: use "testnet" ou "real".`,
      );
    this.rede = opcoes.rede;
    this.agora = opcoes.agora ?? Date.now;
    this.dormir = opcoes.dormir ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.limitePeso = opcoes.limitePeso ?? 4800;
    this.cliente = new ClienteBinance({
      urlBase: URLS_BINANCE[opcoes.rede].rest,
      apiKey: opcoes.apiKey,
      apiSecret: opcoes.apiSecret,
      agora: this.agora,
      ...(opcoes.fetch ? { fetch: opcoes.fetch } : {}),
      ...(opcoes.timeoutMs ? { timeoutMs: opcoes.timeoutMs } : {}),
      ...(opcoes.disjuntor ? { disjuntor: opcoes.disjuntor } : {}),
    });
  }

  /** Saldos diferentes de zero e se a conta pode negociar (GET /api/v3/account). */
  async conta(): Promise<{ podeNegociar: boolean; saldos: SaldoBinance[] }> {
    const r = await this.assinado(
      "/api/v3/account",
      { omitZeroBalances: true },
      RespostaContaCompleta,
      PESO.conta,
    );
    const saldos = r.balances
      .map((b) => ({ ativo: b.asset, livre: dec(b.free), bloqueado: dec(b.locked) }))
      .filter((s) => s.livre.plus(s.bloqueado).gt(0));
    return { podeNegociar: r.canTrade, saldos };
  }

  /** Todas as negociações do par a partir do id `desdeId`, paginando por fromId. */
  async negociacoes(simbolo: string, desdeId: number): Promise<NegociacaoBruta[]> {
    let todas: NegociacaoBruta[] = [];
    for (let fromId = desdeId; ;) {
      const pagina = await this.assinado(
        "/api/v3/myTrades",
        { symbol: simbolo, fromId, limit: PAGINA },
        RespostaMinhasNegociacoes,
        PESO.negociacoes,
      );
      todas = [...todas, ...pagina.map(negociacaoBruta)];
      const ultima = pagina.at(-1);
      if (pagina.length < PAGINA || !ultima) return todas;
      fromId = ultima.id + 1;
    }
  }

  /** clientOrderId de cada ordem do par entre `desdeOrdem` e `ateOrdem` (allOrders, por orderId). */
  async idsCliente(simbolo: string, desdeOrdem: number, ateOrdem: number): Promise<Map<number, string>> {
    const ids = new Map<number, string>();
    for (let orderId = desdeOrdem; ;) {
      const pagina = await this.assinado(
        "/api/v3/allOrders",
        { symbol: simbolo, orderId, limit: PAGINA },
        RespostaTodasOrdens,
        PESO.ordens,
      );
      pagina.forEach((o) => ids.set(o.orderId, o.clientOrderId));
      const ultima = pagina.at(-1);
      if (pagina.length < PAGINA || !ultima || ultima.orderId >= ateOrdem) return ids;
      orderId = ultima.orderId + 1;
    }
  }

  /** Todos os pares da Binance (base e cotação), em cache por uma hora. */
  pares(): Promise<Map<string, AtivosDoPar>> {
    const agora = this.agora();
    if (this.paresEmCache && agora - this.paresEmCache.em < VALIDADE_PARES_MS) return this.paresEmCache.pares;
    const pares = this.publico("/api/v3/exchangeInfo", {}, RespostaPares, PESO.pares).then(
      (r) => new Map(r.symbols.map((s) => [s.symbol, { base: s.baseAsset, cotacao: s.quoteAsset }])),
    );
    this.paresEmCache = { em: agora, pares };
    pares.catch(() => (this.paresEmCache = null));
    return pares;
  }

  /** Preço atual em USDT de cada moeda pedida (par direto ou invertido). Sem par, a moeda fica de fora. */
  async precosUsdt(ativos: readonly string[]): Promise<Map<string, Valor>> {
    return precosUsdtDaTabela(await this.tabelaPrecos(), ativos);
  }

  /** Último preço de todos os pares (GET /api/v3/ticker/price sem símbolo). */
  async tabelaPrecos(): Promise<Map<string, Valor>> {
    const r = await this.publico("/api/v3/ticker/price", {}, RespostaPrecos, PESO.precos);
    return new Map(r.map((p) => [p.symbol, dec(p.price)]));
  }

  /**
   * Preço em USDT de `ativo` no instante `em`: fechamento da vela de 1 minuto que o
   * contém (par direto ou invertido). Uma busca traz 1000 minutos, que ficam em cache.
   * Sem par ou sem vela, null: o preço é desconhecido.
   */
  async precoHistoricoUsdt(ativo: string, em: number): Promise<Valor | null> {
    if (ativo === USDT) return dec(1);
    const pares = await this.pares();
    const direto = `${ativo}${USDT}`;
    const invertido = `${USDT}${ativo}`;
    const simbolo = pares.has(direto) ? direto : pares.has(invertido) ? invertido : null;
    if (!simbolo) return null;
    const minuto = Math.floor(em / MINUTO) * MINUTO;
    const chave = `${simbolo}:${minuto}`;
    if (!this.velas.has(chave)) await this.buscarVelas(simbolo, minuto);
    const fecha = this.velas.get(chave) ?? null;
    if (!fecha || fecha.isZero()) return null;
    return simbolo === direto ? fecha : dec(1).div(fecha);
  }

  /** Permissões da chave (/sapi/v1/account/apiRestrictions). A testnet não tem /sapi: null. */
  async restricoes(): Promise<RestricoesChave | null> {
    if (this.rede !== "real") return null;
    const r = await this.assinado(
      "/sapi/v1/account/apiRestrictions",
      {},
      RespostaRestricoes,
      PESO.restricoes,
    );
    return {
      podeLer: r.enableReading,
      podeSacar: r.enableWithdrawals,
      podeNegociar: r.enableSpotAndMarginTrading,
      ipRestrito: r.ipRestrict,
    };
  }

  private async buscarVelas(simbolo: string, minuto: number): Promise<void> {
    const linhas = await this.publico(
      "/api/v3/klines",
      { symbol: simbolo, interval: "1m", startTime: minuto, limit: PAGINA },
      RespostaKlines,
      PESO.velas,
    );
    // Marca o minuto pedido como buscado, mesmo sem vela: não pergunta de novo.
    this.velas.set(`${simbolo}:${minuto}`, null);
    for (const k of linhas) this.velas.set(`${simbolo}:${k[0]}`, dec(k[4]));
  }

  private async reservarPeso(peso: number): Promise<void> {
    const usado = this.cliente.pesoUsado();
    if (usado === null || usado + peso <= this.limitePeso) return;
    const agora = this.cliente.agoraServidor();
    // Espera o minuto virar (com 1 s de folga): o peso da Binance zera a cada minuto.
    await this.dormir(MINUTO - (agora % MINUTO) + 1000);
  }

  private async assinado<T>(
    caminho: string,
    params: Parametros,
    esquema: z.ZodType<T>,
    peso: number,
  ): Promise<T> {
    await this.reservarPeso(peso);
    return this.cliente.assinado("GET", caminho, params, esquema);
  }

  private async publico<T>(
    caminho: string,
    params: Parametros,
    esquema: z.ZodType<T>,
    peso: number,
  ): Promise<T> {
    await this.reservarPeso(peso);
    return this.cliente.publico(caminho, params, esquema);
  }
}

function negociacaoBruta(n: z.infer<typeof RespostaMinhasNegociacoes>[number]): NegociacaoBruta {
  return {
    simbolo: n.symbol,
    id: n.id,
    orderId: n.orderId,
    preco: dec(n.price),
    quantidade: dec(n.qty),
    valorCotacao: dec(n.quoteQty),
    taxa: dec(n.commission),
    ativoTaxa: n.commissionAsset,
    em: n.time,
    isBuyer: n.isBuyer,
  };
}

/** Preço em USDT de cada moeda pela tabela de preços; moeda sem par fica de fora. */
export function precosUsdtDaTabela(
  tabela: ReadonlyMap<string, Valor>,
  ativos: readonly string[],
): Map<string, Valor> {
  const precos = new Map<string, Valor>();
  for (const a of ativos) {
    const p = precoUsdtDaTabela(tabela, a);
    if (p) precos.set(a, p);
  }
  return precos;
}

/** Preço em USDT pela tabela de preços: XUSDT direto, ou 1 ÷ USDTX. */
export function precoUsdtDaTabela(tabela: ReadonlyMap<string, Valor>, ativo: string): Valor | null {
  if (ativo === USDT) return dec(1);
  const direto = tabela.get(`${ativo}${USDT}`);
  if (direto && direto.gt(0)) return direto;
  const invertido = tabela.get(`${USDT}${ativo}`);
  return invertido && invertido.gt(0) ? dec(1).div(invertido) : null;
}
