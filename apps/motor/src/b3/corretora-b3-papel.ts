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
import { PapelCorretora } from "@zentrade/corretora";
import {
  dec,
  type Candle,
  type Execucao,
  type FiltrosAtivo,
  type NivelLivro,
  type Valor,
} from "@zentrade/dominio";
import type { FonteVelasB3 } from "./fonte.js";
import {
  ATIVO_WIN,
  emReais,
  MOEDA_B3,
  PONTOS_POR_TICK,
  REAIS_POR_PONTO,
  SIMBOLO_WIN_PAPEL,
  velasFechadas,
} from "./mercado.js";

/**
 * Crédito virtual da conta de papel: a corretora de papel é de à vista (a compra debita o
 * valor cheio do contrato, ~R$ 36 mil). No futuro só a margem fica presa; com esta linha
 * o papel não recusa a compra, e o saldo livre que o núcleo vê já desconta a linha e a margem.
 */
const LINHA_VIRTUAL = dec(50_000_000);

export interface OpcoesCorretoraB3 {
  readonly fonte: FonteVelasB3;
  readonly capital: Valor;
  readonly margemPorContrato: Valor;
  readonly tarifaPorContrato: Valor;
  readonly deslizamentoTicks: number;
  readonly contratosMaximos: number;
  /**
   * Preço de referência (pontos) para traduzir a tarifa por contrato e os ticks de
   * deslizamento nas frações que a corretora de papel usa. Com o WIN a ±20% dele, o erro
   * é de centavos por contrato.
   */
  readonly precoReferenciaPontos: number;
  /** Cotação (fechamento da última vela de 5 min) mais velha que isto: a ordem é recusada (R2). */
  readonly idadeMaximaCotacaoMs: number;
  /** De quanto em quanto tempo lê o MT5 enquanto houver assinatura (0 = só `atualizar()` à mão). */
  readonly consultaMs: number;
  readonly agora: () => number;
}

interface Assinatura {
  readonly intervalo: Intervalo;
  readonly aoFechar: (c: Candle) => void;
  readonly aoEstado: ((e: EstadoConexao) => void) | undefined;
  ultimo: number | null;
  estado: EstadoConexao | null;
}

const minutos = (ms: number) => `${Math.round(ms / 60_000)} min`;

/**
 * Papel do mini índice pelo MESMO núcleo dos robôs (R1): velas de 5 min do MT5 da
 * corretora (só leitura), em reais por contrato; ordens, OCO, idempotência e restauração
 * da corretora de papel. Nenhuma ordem sai para a B3.
 */
export class CorretoraB3Papel implements Corretora {
  readonly rede = "papel" as const;
  private readonly papel: PapelCorretora;
  private readonly filtrosWin: FiltrosAtivo;
  private assinaturas: Assinatura[] = [];
  private cotacao: { preco: Valor; em: number } | null = null;
  private ultimaAlimentada: number | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private lendo: Promise<void> = Promise.resolve();

  constructor(private readonly o: OpcoesCorretoraB3) {
    const contrato = o.precoReferenciaPontos * REAIS_POR_PONTO;
    this.filtrosWin = {
      passoQuantidade: dec(1),
      quantidadeMinima: dec(1),
      quantidadeMaxima: dec(o.contratosMaximos),
      valorMinimo: dec(0),
      passoPreco: dec(PONTOS_POR_TICK * REAIS_POR_PONTO),
    };
    this.papel = new PapelCorretora({
      saldos: { [MOEDA_B3]: o.capital.plus(LINHA_VIRTUAL) },
      taxa: o.tarifaPorContrato.div(contrato).toNumber(),
      deslizamentoBps: ((o.deslizamentoTicks * PONTOS_POR_TICK) / o.precoReferenciaPontos) * 10_000,
      filtros: this.filtrosWin,
      agora: o.agora,
    });
  }

  filtros(_simbolo: string): Promise<FiltrosAtivo> {
    return Promise.resolve(this.filtrosWin);
  }

  async candles(_simbolo: string, intervalo: Intervalo, limite: number, fim?: number): Promise<Candle[]> {
    const reais = (await this.o.fonte.velas5m()).map(emReais);
    const ultima = reais.at(-1);
    if (ultima && fim === undefined) this.cotar(ultima);
    const fechadas = velasFechadas(reais, intervalo).filter((c) => fim === undefined || c.abertura < fim);
    return fechadas.slice(-limite);
  }

  livro(): Promise<{ compras: NivelLivro[]; vendas: NivelLivro[] }> {
    return Promise.resolve({ compras: [], vendas: [] });
  }

  /** BRL: patrimônio do futuro (caixa + resultado em aberto) menos a margem presa. WIN: contratos livres. */
  async saldoLivre(ativo: string): Promise<Valor> {
    if (ativo !== MOEDA_B3) return this.papel.saldoLivre(ativo);
    const caixa = await this.papel.saldoLivre(MOEDA_B3);
    const contratos = (await this.papel.saldoLivre(ATIVO_WIN)).plus(this.papel.saldoBloqueado(ATIVO_WIN));
    const preco = this.cotacao?.preco ?? dec(0);
    return caixa
      .plus(contratos.times(preco))
      .minus(LINHA_VIRTUAL)
      .minus(contratos.times(this.o.margemPorContrato));
  }

  enviarOrdemMercado(pedido: PedidoOrdemMercado): Promise<ResultadoOrdem> {
    const idade = this.cotacao ? this.o.agora() - this.cotacao.em : null;
    if (idade === null || idade > this.o.idadeMaximaCotacaoMs)
      return Promise.resolve({
        idCliente: pedido.idCliente,
        idCorretora: null,
        estado: "REJEITADA",
        execucoes: [],
        motivo:
          idade === null
            ? "Sem cotação do MT5 ainda: não executo no escuro."
            : `A cotação do MT5 tem ${minutos(idade)} (o limite é ${minutos(this.o.idadeMaximaCotacaoMs)}): não executo a preço que já passou.`,
      });
    return this.papel.enviarOrdemMercado(pedido);
  }

  consultarOrdem(simbolo: string, idCliente: string): Promise<ResultadoOrdem | null> {
    return this.papel.consultarOrdem(simbolo, idCliente);
  }

  colocarProtecao(pedido: PedidoProtecao): Promise<ResultadoProtecao> {
    return this.papel.colocarProtecao(pedido);
  }

  consultarProtecao(simbolo: string, ids: IdsProtecao): Promise<ResultadoProtecao | null> {
    return this.papel.consultarProtecao(simbolo, ids);
  }

  cancelarProtecao(simbolo: string, ids: IdsProtecao): Promise<ResultadoProtecao | null> {
    return this.papel.cancelarProtecao(simbolo, ids);
  }

  /** O saldo de papel sobrevive ao reinício: refeito das execuções gravadas. */
  restaurarExecucoes(simbolo: string, execucoes: readonly Execucao[]): void {
    this.papel.restaurarExecucoes(simbolo, execucoes);
  }

  /** "1m" recebe as velas de 5 min: é a menor que o MT5 manda, e vigia stop e alvo. */
  assinarCandles(
    _simbolo: string,
    intervalo: Intervalo,
    aoFechar: (c: Candle) => void,
    aoEstado?: (e: EstadoConexao) => void,
  ): () => void {
    const a: Assinatura = { intervalo, aoFechar, aoEstado, ultimo: null, estado: null };
    this.assinaturas = [...this.assinaturas, a];
    if (this.o.consultaMs > 0 && !this.timer)
      this.timer = setInterval(() => void this.atualizar(), this.o.consultaMs);
    return () => {
      this.assinaturas = this.assinaturas.filter((x) => x !== a);
      if (this.assinaturas.length === 0 && this.timer) {
        clearInterval(this.timer);
        this.timer = null;
      }
    };
  }

  /** Uma leitura do MT5: atualiza a cotação, dispara as proteções e entrega os candles novos. */
  atualizar(): Promise<void> {
    this.lendo = this.lendo.then(() => this.ler()).catch(() => undefined);
    return this.lendo;
  }

  private cotar(ultima: Candle): void {
    this.cotacao = { preco: ultima.fecha, em: ultima.fechamento + 1 };
    this.papel.definirPreco(SIMBOLO_WIN_PAPEL, ultima.fecha);
  }

  private async ler(): Promise<void> {
    let reais: Candle[];
    try {
      reais = (await this.o.fonte.velas5m()).map(emReais);
    } catch {
      reais = [];
    }
    const ultima = reais.at(-1);
    if (!ultima) {
      this.estado("desconectado");
      return;
    }
    // Proteções primeiro (o stop da vela vale antes da decisão), como no papel ao vivo.
    if (this.ultimaAlimentada !== null)
      for (const c of reais.filter((v) => v.abertura > (this.ultimaAlimentada ?? 0)))
        this.papel.alimentar(SIMBOLO_WIN_PAPEL, "5m", c);
    this.ultimaAlimentada = ultima.abertura;
    this.cotar(ultima);
    this.estado("conectado");
    for (const a of this.assinaturas) {
      const fechadas = velasFechadas(reais, a.intervalo);
      if (a.ultimo === null) {
        a.ultimo = fechadas.at(-1)?.abertura ?? 0;
        continue;
      }
      for (const c of fechadas.filter((v) => v.abertura > (a.ultimo ?? 0))) {
        a.ultimo = c.abertura;
        a.aoFechar(c);
      }
    }
  }

  private estado(e: EstadoConexao): void {
    for (const a of this.assinaturas)
      if (a.estado !== e) {
        a.estado = e;
        a.aoEstado?.(e);
      }
  }
}
