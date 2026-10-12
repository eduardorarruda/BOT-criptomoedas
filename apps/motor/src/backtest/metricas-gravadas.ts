import type { MetricasBacktest } from "@zentrade/contratos";
import { paraTexto, type Valor } from "@zentrade/dominio";
import { duracaoDaQueda, maiorQueda } from "./metricas.js";
import { estatisticasDasOperacoes } from "./metricas-operacoes.js";
import { ANO_MS, cagr, calmar, metricasDosRetornos, retornosDaCurva } from "./metricas-retorno.js";
import type { ResultadoBacktest } from "./rodar.js";

export interface ContextoMetricas {
  readonly saldoInicial: Valor;
  readonly riscoPorOperacao: Valor;
  readonly porAno: number;
  /** Período pedido (ms): define os anos do CAGR e do MinBTL. */
  readonly inicio: number;
  readonly fim: number;
  readonly precisaoMinuto: boolean;
}

const fracao = (resultado: Valor, base: Valor): number =>
  base.isZero() ? 0 : resultado.div(base).toNumber();
const textoOuNulo = (v: Valor | null): string | null => (v === null ? null : paraTexto(v));

/** Risco e retorno da curva (Sharpe, Sortino, volatilidade, CAGR, Calmar, queda e duração). */
function deRisco(r: ResultadoBacktest, c: ContextoMetricas, anos: number) {
  const retornos = metricasDosRetornos(retornosDaCurva(c.saldoInicial, r.curva), c.porAno);
  const crescimento = cagr(c.saldoInicial, r.patrimonioFinal, anos);
  const queda = duracaoDaQueda(r.curva, maiorQueda(r.curva));
  return {
    cagr: crescimento,
    volatilidadeAnual: retornos.volatilidadeAnual,
    sharpe: retornos.sharpe,
    sortino: retornos.sortino,
    calmar: calmar(crescimento, r.maiorQuedaPercentual),
    duracaoMaiorQuedaMs: queda.duracaoMs,
    maiorQuedaRecuperada: queda.recuperada,
    observacoes: retornos.observacoes,
    barrasPorAno: c.porAno,
    assimetria: retornos.assimetria,
    curtose: retornos.curtose,
    anos,
  };
}

/** Comparação com quem comprou no início e segurou, pagando os mesmos custos. */
function deBuyHold(r: ResultadoBacktest, c: ContextoMetricas) {
  const bh = r.buyHold;
  const retorno = fracao(bh.final.minus(c.saldoInicial), c.saldoInicial);
  return {
    buyHoldResultadoPercentual: retorno,
    buyHoldMaiorQuedaPercentual: maiorQueda(bh.curva).percentual,
    buyHoldSharpe: metricasDosRetornos(retornosDaCurva(c.saldoInicial, bh.curva), c.porAno).sharpe,
    excessoSobreBuyHold: fracao(r.resultadoLiquido, c.saldoInicial) - retorno,
  };
}

function dasOperacoes(r: ResultadoBacktest) {
  const e = estatisticasDasOperacoes(r.operacoesFechadas);
  return {
    fatorLucro: e.fatorLucro,
    expectativa: paraTexto(e.expectativa),
    ganhoMedio: textoOuNulo(e.ganhoMedio),
    perdaMedia: textoOuNulo(e.perdaMedia),
    payoff: e.payoff,
  };
}

/** Métricas gravadas em backtests.metricas: nomes do contrato, dinheiro em texto, frações em número. */
export function metricasGravadas(r: ResultadoBacktest, c: ContextoMetricas): MetricasBacktest {
  const bruto = r.resultadoLiquido.plus(r.taxasPagas).plus(r.deslizamentoPago);
  return {
    resultadoLiquido: paraTexto(r.resultadoLiquido),
    resultadoPercentual: fracao(r.resultadoLiquido, c.saldoInicial),
    resultadoBruto: paraTexto(bruto),
    resultadoBrutoPercentual: fracao(bruto, c.saldoInicial),
    maiorQueda: paraTexto(r.maiorQueda),
    maiorQuedaPercentual: r.maiorQuedaPercentual,
    operacoes: r.operacoes,
    acertos: r.acertos,
    taxaAcerto: r.taxaAcerto,
    taxasPagas: paraTexto(r.taxasPagas),
    deslizamentoPago: paraTexto(r.deslizamentoPago),
    ordens: r.ordens,
    saldoInicial: paraTexto(c.saldoInicial),
    patrimonioFinal: paraTexto(r.patrimonioFinal),
    riscoPorOperacao: paraTexto(c.riscoPorOperacao),
    candles: r.candles.length,
    tempoExposto: r.candles.length === 0 ? 0 : r.barrasExpostas / r.candles.length,
    stopsIntrabar: r.saidasIntrabar.stop,
    alvosIntrabar: r.saidasIntrabar.alvo,
    candlesAmbiguos: r.saidasIntrabar.ambiguos,
    precisaoMinuto: c.precisaoMinuto,
    ...deRisco(r, c, (c.fim - c.inicio) / ANO_MS),
    ...dasOperacoes(r),
    ...deBuyHold(r, c),
  };
}
