import {
  CustosBacktestEsquema,
  type CustosPedido,
  type OperacaoPedido,
  type VelasPedido,
} from "@zentrade/contratos";
import { descreverRegra, type ContextoMercado, type Estrategia, type Sentido } from "@zentrade/dominio";

/** Deslizamento e meio spread padrão do backtest: a mesma hipótese de custo vale para o agente. */
const CUSTOS_BACKTEST = CustosBacktestEsquema.parse({});

/** Cripto à vista: a taxa da própria estratégia por lado e as hipóteses de execução do backtest. */
export const custosCriptoDoPedido = (e: Estrategia): CustosPedido => ({
  mercado: "cripto",
  taxaPorLado: e.taxa,
  deslizamentoBps: CUSTOS_BACKTEST.deslizamentoBps,
  meioSpreadBps: CUSTOS_BACKTEST.meioSpreadBps,
});

/**
 * Como a operação termina e quanto custa, para o agente avaliar pelas saídas reais
 * (stop, regra de saída, tempo) e não pelo alvo nominal — que nos modelos fica longe
 * de propósito.
 */
export function operacaoDoPedido(e: Estrategia, custos: CustosPedido, sentido: Sentido): OperacaoPedido {
  const saida = sentido === "comprado" ? e.saida : e.saidaVendida;
  return {
    sentido,
    custos,
    stopPercentual: e.stop,
    alvoLiquido: e.alvoLiquido,
    ...(saida ? { regraSaida: descreverRegra(saida).slice(0, 1000) } : {}),
    ...(e.stopAtr ? { stopAtr: { ...e.stopAtr } } : {}),
    ...(e.stopMovel ? { stopMovel: { ...e.stopMovel } } : {}),
    ...(e.empate ? { empate: { ...e.empate } } : {}),
    ...(e.tempoMaximo !== undefined ? { tempoMaximo: e.tempoMaximo } : {}),
    ...(e.tamanhoPorVolatilidade ? { tamanhoPorVolatilidade: { ...e.tamanhoPorVolatilidade } } : {}),
  };
}

/** As séries das velas do buffer, se estiverem todas e do tamanho dos fechamentos. */
export function velasDoPedido(ctx: ContextoMercado): VelasPedido | undefined {
  const { instantes, maximas, minimas, volumes, fechamentos } = ctx;
  if (!instantes || !maximas || !minimas || !volumes) return undefined;
  const n = fechamentos.length;
  if ([instantes, maximas, minimas, volumes].some((s) => s.length !== n)) return undefined;
  return { instantes: [...instantes], maximas: [...maximas], minimas: [...minimas], volumes: [...volumes] };
}
