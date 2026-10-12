import type {
  Corretora,
  EstadoConexao,
  IdsProtecao,
  Intervalo,
  PedidoOrdemMercado,
  PedidoProtecao,
  ResultadoOrdem,
  ResultadoProtecao,
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
import {
  gatilhoNoCandle,
  problemaDosPrecos,
  protecaoAtiva,
  protecaoCancelada,
  protecaoExecutada,
  protecaoRejeitada,
  type ProtecaoPapel,
} from "./papel-protecao.js";

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
 *
 * Proteções (stop-limit e OCO) ficam no livro como na Binance: travam a base e
 * disparam em `alimentar`, pela mínima e pela máxima do candle, ANTES de o candle
 * chegar a quem assina — a corretora é mais rápida que o robô. Regras do disparo em
 * `gatilhoNoCandle` (papel-protecao.ts).
 */
export class PapelCorretora implements Corretora {
  readonly rede = "papel" as const;
  private saldos: ReadonlyMap<string, Valor>;
  private readonly historico = new Map<string, Candle[]>();
  private readonly precos = new Map<string, Valor>();
  private readonly ordens = new Map<string, ResultadoOrdem>();
  private protecoes: ReadonlyMap<string, ProtecaoPapel> = new Map();
  private bloqueados: ReadonlyMap<string, Valor> = new Map();
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
    // A corretora segue executando o livro mesmo com a conexão do robô caída.
    this.dispararProtecoes(simbolo, candle);
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

  /** Quanto do ativo está travado por proteções no livro (não entra no saldo livre). */
  saldoBloqueado(ativo: string): Valor {
    return this.bloqueados.get(ativo) ?? dec(0);
  }

  colocarProtecao(pedido: PedidoProtecao): Promise<ResultadoProtecao> {
    const existente = this.protecoes.get(pedido.ids.lista);
    if (existente) return Promise.resolve(existente.resultado);
    const problema = this.problemaDaProtecao(pedido);
    if (problema) return Promise.resolve(protecaoRejeitada(pedido.ids, problema));
    const { base } = ativosDoSimbolo(pedido.simbolo);
    this.moverBase(base, pedido.quantidade.neg());
    const idCorretora = `papel-${++this.sequencia}`;
    const protecao: ProtecaoPapel = {
      pedido,
      idCorretora,
      criadaEm: this.agora(),
      disparada: false,
      resultado: protecaoAtiva(pedido, idCorretora),
    };
    this.guardarProtecao(protecao);
    return Promise.resolve(protecao.resultado);
  }

  consultarProtecao(_simbolo: string, ids: IdsProtecao): Promise<ResultadoProtecao | null> {
    return Promise.resolve(this.protecoes.get(ids.lista)?.resultado ?? null);
  }

  cancelarProtecao(_simbolo: string, ids: IdsProtecao): Promise<ResultadoProtecao | null> {
    const p = this.protecoes.get(ids.lista);
    if (!p) return Promise.resolve(null);
    if (p.resultado.estado === "ATIVA") {
      this.moverBase(ativosDoSimbolo(p.pedido.simbolo).base, p.pedido.quantidade);
      this.guardarProtecao({ ...p, resultado: protecaoCancelada(p.resultado) });
    }
    return Promise.resolve(this.protecoes.get(ids.lista)?.resultado ?? null);
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

  /**
   * Refaz os saldos com execuções que já aconteceram (gravadas no banco), sem validar
   * nem gerar ordens: no papel com banco, o saldo simulado sobrevive ao reinício.
   */
  restaurarExecucoes(simbolo: string, execucoes: readonly Execucao[]): void {
    const { base, cotacao } = ativosDoSimbolo(simbolo);
    const novos = new Map(this.saldos);
    const saldo = (a: string) => novos.get(a) ?? dec(0);
    for (const e of execucoes) {
      const valor = e.quantidade.times(e.preco);
      const compra = e.lado === "COMPRA";
      novos.set(
        cotacao,
        compra
          ? saldo(cotacao).minus(valor).minus(e.taxaCotacao)
          : saldo(cotacao).plus(valor).minus(e.taxaCotacao),
      );
      novos.set(base, compra ? saldo(base).plus(e.quantidade) : saldo(base).minus(e.quantidade));
    }
    this.saldos = novos;
  }

  private problemaDaProtecao(pedido: PedidoProtecao): string | null {
    const preco = this.precos.get(pedido.simbolo);
    if (!preco) return `Sem preço conhecido para ${pedido.simbolo}: a proteção não foi colocada.`;
    const precos = problemaDosPrecos(pedido, preco);
    if (precos) return precos;
    const quantidade = this.problemaDeQuantidade(
      pedido.quantidade,
      pedido.limite,
      this.filtrosDe(pedido.simbolo),
    );
    if (quantidade) return quantidade;
    const { base } = ativosDoSimbolo(pedido.simbolo);
    const livre = this.saldos.get(base) ?? dec(0);
    if (livre.lt(pedido.quantidade))
      return `Saldo insuficiente de ${base}: precisa de ${pedido.quantidade.toFixed()}, há ${livre.toFixed()} livre.`;
    return null;
  }

  /** Base entre o saldo livre e o travado: negativo trava, positivo devolve. */
  private moverBase(base: string, quantidade: Valor): void {
    const livre = this.saldos.get(base) ?? dec(0);
    this.saldos = new Map([...this.saldos, [base, livre.plus(quantidade)]]);
    this.bloqueados = new Map([...this.bloqueados, [base, this.saldoBloqueado(base).minus(quantidade)]]);
  }

  private guardarProtecao(p: ProtecaoPapel): void {
    this.protecoes = new Map([...this.protecoes, [p.pedido.ids.lista, p]]);
    for (const perna of p.resultado.pernas) this.ordens.set(perna.ordem.idCliente, perna.ordem);
  }

  private dispararProtecoes(simbolo: string, candle: Candle): void {
    const deslizamento = dec(this.opcoes.deslizamentoBps).div(10_000);
    for (const p of this.protecoes.values()) {
      if (p.pedido.simbolo !== simbolo || p.resultado.estado !== "ATIVA") continue;
      const gatilho = gatilhoNoCandle(p, candle, deslizamento);
      if (!gatilho) continue;
      if ("disparou" in gatilho) this.guardarProtecao({ ...p, disparada: true });
      else this.executarProtecao(p, gatilho.perna, gatilho.preco);
    }
  }

  /** A perna executou: a base travada sai, a cotação entra (menos a taxa) e a outra perna cai. */
  private executarProtecao(p: ProtecaoPapel, perna: "stop" | "alvo", preco: Valor): void {
    const { base, cotacao } = ativosDoSimbolo(p.pedido.simbolo);
    const valor = p.pedido.quantidade.times(preco);
    const taxa = valor.times(this.opcoes.taxa);
    this.bloqueados = new Map([
      ...this.bloqueados,
      [base, this.saldoBloqueado(base).minus(p.pedido.quantidade)],
    ]);
    const livre = this.saldos.get(cotacao) ?? dec(0);
    this.saldos = new Map([...this.saldos, [cotacao, livre.plus(valor).minus(taxa)]]);
    const execucao: Execucao = {
      lado: "VENDA",
      preco,
      quantidade: p.pedido.quantidade,
      taxaCotacao: taxa,
      em: this.agora(),
    };
    const resultado = protecaoExecutada(p.resultado, perna, execucao, `papel-${++this.sequencia}`);
    this.guardarProtecao({ ...p, resultado });
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
