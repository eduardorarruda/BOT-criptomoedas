import type {
  Corretora,
  EstadoConexao,
  Intervalo,
  PedidoOrdemMercado,
  ResultadoOrdem,
} from "@zentrade/contratos";
import {
  dec,
  ehMultiplo,
  formatarDolar,
  limiteInferior,
  type Candle,
  type Execucao,
  type FiltrosAtivo,
  type NivelLivro,
  type Valor,
} from "@zentrade/dominio";
import { ativosDoSimbolo } from "./ativos.js";
import { ErroConfiguracao } from "./erros.js";

export interface OpcoesPapel {
  readonly saldos: Readonly<Record<string, Valor>>;
  /** Taxa por ponta, em fração (0,001 = 0,1%), cobrada na moeda de cotação. */
  readonly taxa: number;
  /** Deslizamento contra quem opera, em pontos-base (10 = 0,1%). */
  readonly deslizamentoBps: number;
  readonly filtros?: FiltrosAtivo;
  readonly agora?: () => number;
}

interface Assinante {
  readonly chave: string;
  readonly aoFechar: (c: Candle) => void;
  readonly aoEstado: ((e: EstadoConexao) => void) | undefined;
}

const FILTROS_PADRAO: FiltrosAtivo = {
  passoQuantidade: dec("0.00001"),
  quantidadeMinima: dec("0.00001"),
  valorMinimo: dec(5),
  passoPreco: dec("0.01"),
};
const QUANTIDADE_LIVRO = dec(1_000_000);

const chaveDe = (simbolo: string, intervalo: Intervalo) => `${simbolo}:${intervalo}`;

/**
 * Corretora simulada para o modo papel e o backtest. Não sabe de onde vem o preço:
 * quem a usa alimenta candles (a mesma fonte que o robô usa para decidir — uma fonte
 * só de preço). Saldos em memória, deslizamento contra quem opera e taxa cobrada.
 */
export class PapelCorretora implements Corretora {
  readonly rede = "papel" as const;
  private saldos: ReadonlyMap<string, Valor>;
  private readonly historico = new Map<string, Candle[]>();
  private readonly precos = new Map<string, Valor>();
  private readonly ordens = new Map<string, ResultadoOrdem>();
  private assinantes: readonly Assinante[] = [];
  private conectada = true;
  private sequencia = 0;
  private readonly filtrosPadrao: FiltrosAtivo;
  private filtrosPorSimbolo: ReadonlyMap<string, FiltrosAtivo> = new Map();
  private readonly agora: () => number;

  constructor(private readonly opcoes: OpcoesPapel) {
    if (!(opcoes.taxa >= 0 && opcoes.taxa < 0.01))
      throw new ErroConfiguracao("A taxa do papel precisa estar entre 0 e 1% (ex.: 0.001).");
    if (!(opcoes.deslizamentoBps >= 0 && opcoes.deslizamentoBps <= 1_000))
      throw new ErroConfiguracao("O deslizamento do papel precisa estar entre 0 e 1000 pontos-base.");
    this.saldos = new Map(Object.entries(opcoes.saldos));
    this.filtrosPadrao = opcoes.filtros ?? FILTROS_PADRAO;
    this.agora = opcoes.agora ?? Date.now;
  }

  /** Registra um candle fechado, atualiza o último preço e entrega a quem assina (se conectada). */
  alimentar(simbolo: string, intervalo: Intervalo, candle: Candle): void {
    const chave = chaveDe(simbolo, intervalo);
    const lista = this.historico.get(chave) ?? [];
    const ultimo = lista.at(-1);
    if (!ultimo || candle.abertura > ultimo.abertura) this.historico.set(chave, [...lista, candle]);
    this.precos.set(simbolo, candle.fecha);
    if (!this.conectada) return;
    this.assinantes.filter((a) => a.chave === chave).forEach((a) => a.aoFechar(candle));
  }

  definirPreco(simbolo: string, preco: Valor): void {
    this.precos.set(simbolo, preco);
  }

  /** Simula a queda da conexão: candles alimentados ficam no histórico, mas não são entregues. */
  desconectar(): void {
    this.conectada = false;
    this.assinantes.forEach((a) => a.aoEstado?.("reconectando"));
  }

  reconectar(): void {
    this.conectada = true;
    this.assinantes.forEach((a) => a.aoEstado?.("conectado"));
  }

  /** Filtros de um símbolo (ex.: os reais da Binance, no papel ao vivo). Sem isso, vale o padrão. */
  definirFiltros(simbolo: string, filtros: FiltrosAtivo): void {
    this.filtrosPorSimbolo = new Map([...this.filtrosPorSimbolo, [simbolo, filtros]]);
  }

  filtros(simbolo: string): Promise<FiltrosAtivo> {
    return Promise.resolve(this.filtrosDe(simbolo));
  }

  private filtrosDe(simbolo: string): FiltrosAtivo {
    return this.filtrosPorSimbolo.get(simbolo) ?? this.filtrosPadrao;
  }

  candles(simbolo: string, intervalo: Intervalo, limite: number, fim?: number): Promise<Candle[]> {
    const lista = this.historico.get(chaveDe(simbolo, intervalo)) ?? [];
    const ate = fim === undefined ? lista.length : limiteInferior(lista, fim, (c) => c.abertura);
    return Promise.resolve(lista.slice(Math.max(0, ate - limite), ate));
  }

  livro(simbolo: string, _profundidade: number): Promise<{ compras: NivelLivro[]; vendas: NivelLivro[] }> {
    const preco = this.precos.get(simbolo);
    if (!preco)
      return Promise.reject(new Error(`Sem preço conhecido para ${simbolo}: alimente um candle antes.`));
    return Promise.resolve({
      compras: [{ preco: this.comDeslizamento(preco, "VENDA"), quantidade: QUANTIDADE_LIVRO }],
      vendas: [{ preco: this.comDeslizamento(preco, "COMPRA"), quantidade: QUANTIDADE_LIVRO }],
    });
  }

  saldoLivre(ativo: string): Promise<Valor> {
    return Promise.resolve(this.saldos.get(ativo) ?? dec(0));
  }

  enviarOrdemMercado(pedido: PedidoOrdemMercado): Promise<ResultadoOrdem> {
    const existente = this.ordens.get(pedido.idCliente);
    if (existente) return Promise.resolve(existente);
    const resultado = this.executar(pedido);
    this.ordens.set(pedido.idCliente, resultado);
    return Promise.resolve(resultado);
  }

  consultarOrdem(_simbolo: string, idCliente: string): Promise<ResultadoOrdem | null> {
    return Promise.resolve(this.ordens.get(idCliente) ?? null);
  }

  assinarCandles(
    simbolo: string,
    intervalo: Intervalo,
    aoFechar: (candle: Candle) => void,
    aoEstado?: (estado: EstadoConexao) => void,
  ): () => void {
    const assinante: Assinante = { chave: chaveDe(simbolo, intervalo), aoFechar, aoEstado };
    this.assinantes = [...this.assinantes, assinante];
    aoEstado?.(this.conectada ? "conectado" : "reconectando");
    return () => {
      this.assinantes = this.assinantes.filter((a) => a !== assinante);
      aoEstado?.("desconectado");
    };
  }

  private executar(pedido: PedidoOrdemMercado): ResultadoOrdem {
    const preco = this.precos.get(pedido.simbolo);
    if (!preco)
      return this.rejeitar(pedido, `Sem preço conhecido para ${pedido.simbolo}: a ordem não foi executada.`);
    const problema = this.problemaDeQuantidade(pedido.quantidade, preco, this.filtrosDe(pedido.simbolo));
    if (problema) return this.rejeitar(pedido, problema);
    const precoExecucao = this.comDeslizamento(preco, pedido.lado);
    const valor = pedido.quantidade.times(precoExecucao);
    const taxa = valor.times(this.opcoes.taxa);
    const faltou = this.movimentar(pedido, valor, taxa);
    if (faltou) return this.rejeitar(pedido, faltou);
    const execucao: Execucao = {
      lado: pedido.lado,
      preco: precoExecucao,
      quantidade: pedido.quantidade,
      taxaCotacao: taxa,
      em: this.agora(),
    };
    return {
      idCliente: pedido.idCliente,
      idCorretora: `papel-${++this.sequencia}`,
      estado: "PREENCHIDA",
      execucoes: [execucao],
    };
  }

  /** Atualiza os saldos (novo mapa, sem mutar o anterior) ou diz o que faltou. */
  private movimentar(pedido: PedidoOrdemMercado, valor: Valor, taxa: Valor): string | null {
    const { base, cotacao } = ativosDoSimbolo(pedido.simbolo);
    const saldo = (a: string) => this.saldos.get(a) ?? dec(0);
    const compra = pedido.lado === "COMPRA";
    const precisa = compra ? valor.plus(taxa) : pedido.quantidade;
    const ativo = compra ? cotacao : base;
    if (saldo(ativo).lt(precisa))
      return `Saldo insuficiente de ${ativo}: precisa de ${precisa.toFixed()}, há ${saldo(ativo).toFixed()} livre.`;
    const novos = new Map(this.saldos);
    novos.set(cotacao, compra ? saldo(cotacao).minus(precisa) : saldo(cotacao).plus(valor).minus(taxa));
    novos.set(base, compra ? saldo(base).plus(pedido.quantidade) : saldo(base).minus(pedido.quantidade));
    this.saldos = novos;
    return null;
  }

  private problemaDeQuantidade(q: Valor, preco: Valor, f: FiltrosAtivo): string | null {
    if (q.lte(0)) return "A quantidade da ordem precisa ser maior que zero.";
    if (q.lt(f.quantidadeMinima))
      return `A quantidade ${q.toFixed()} é menor que o mínimo (${f.quantidadeMinima.toFixed()}).`;
    if (!ehMultiplo(q, f.passoQuantidade))
      return `A quantidade ${q.toFixed()} não é múltipla do passo (${f.passoQuantidade.toFixed()}).`;
    if (f.quantidadeMaxima && q.gt(f.quantidadeMaxima))
      return `A quantidade ${q.toFixed()} passa do máximo (${f.quantidadeMaxima.toFixed()}).`;
    if (q.times(preco).lt(f.valorMinimo))
      return `A ordem vale ${formatarDolar(q.times(preco))}; o mínimo é ${formatarDolar(f.valorMinimo)}.`;
    return null;
  }

  private comDeslizamento(preco: Valor, lado: "COMPRA" | "VENDA"): Valor {
    const fator = dec(this.opcoes.deslizamentoBps).div(10_000);
    return lado === "COMPRA" ? preco.times(dec(1).plus(fator)) : preco.times(dec(1).minus(fator));
  }

  private rejeitar(pedido: PedidoOrdemMercado, motivo: string): ResultadoOrdem {
    return { idCliente: pedido.idCliente, idCorretora: null, estado: "REJEITADA", execucoes: [], motivo };
  }
}
