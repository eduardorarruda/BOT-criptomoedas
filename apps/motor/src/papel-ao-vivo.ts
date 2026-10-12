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
import type { PapelCorretora } from "@zentrade/corretora";
import type { Candle, Execucao, FiltrosAtivo, NivelLivro, Valor } from "@zentrade/dominio";

/**
 * Modo papel ao vivo: mercado (candles, filtros, livro) de uma corretora de verdade e
 * ordens/saldos simulados no papel. O papel é alimentado pelo MESMO stream que o robô
 * usa para decidir — uma fonte só de preço. As proteções ficam no livro do papel e
 * disparam pela mínima/máxima de cada candle alimentado (o de 1 min e o do intervalo).
 */
export class CorretoraPapelAoVivo implements Corretora {
  readonly rede = "papel" as const;

  constructor(
    private readonly dados: Corretora,
    private readonly papel: PapelCorretora,
  ) {}

  async filtros(simbolo: string): Promise<FiltrosAtivo> {
    const f = await this.dados.filtros(simbolo);
    this.papel.definirFiltros(simbolo, f);
    return f;
  }

  async candles(simbolo: string, intervalo: Intervalo, limite: number, fim?: number): Promise<Candle[]> {
    const candles = await this.dados.candles(simbolo, intervalo, limite, fim);
    const ultimo = candles.at(-1);
    if (ultimo && fim === undefined) this.papel.definirPreco(simbolo, ultimo.fecha);
    return candles;
  }

  livro(simbolo: string, profundidade: number): Promise<{ compras: NivelLivro[]; vendas: NivelLivro[] }> {
    return this.dados.livro(simbolo, profundidade);
  }

  /** Papel com banco: o saldo simulado sobrevive ao reinício (refeito das execuções gravadas). */
  restaurarExecucoes(simbolo: string, execucoes: readonly Execucao[]): void {
    this.papel.restaurarExecucoes(simbolo, execucoes);
  }

  saldoLivre(ativo: string): Promise<Valor> {
    return this.papel.saldoLivre(ativo);
  }

  enviarOrdemMercado(pedido: PedidoOrdemMercado): Promise<ResultadoOrdem> {
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

  assinarCandles(
    simbolo: string,
    intervalo: Intervalo,
    aoFechar: (candle: Candle) => void,
    aoEstado?: (estado: EstadoConexao) => void,
  ): () => void {
    const alimentarEDecidir = (c: Candle) => {
      this.papel.alimentar(simbolo, intervalo, c);
      aoFechar(c);
    };
    return this.dados.assinarCandles(simbolo, intervalo, alimentarEDecidir, aoEstado);
  }
}
