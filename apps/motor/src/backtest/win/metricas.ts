import type { MetricasBacktest, MetricasWin } from "@zentrade/contratos";
import {
  apurarIrDayTrade,
  dec,
  paraTexto,
  pontosDosReais,
  type ModoDiasDeEvento,
  type Valor,
} from "@zentrade/dominio";
import { metricasGravadas } from "../metricas-gravadas.js";
import { ANO_MS } from "../metricas-retorno.js";
import type { ResultadoBacktest } from "../rodar.js";
import type { OperacaoWin } from "./execucao.js";
import type { ResultadoBacktestWin } from "./rodar.js";

export interface ContextoMetricasWin {
  readonly simbolo: string;
  readonly saldoInicial: Valor;
  readonly riscoPorOperacao: Valor;
  /** Período pedido (ms). */
  readonly inicio: number;
  readonly fim: number;
  readonly diasDeEvento?: ModoDiasDeEvento;
}

/** Símbolo da aproximação pelo Ibovespa à vista. */
const PROXY = "WIN-IBOV";

/**
 * Candles por ano medidos na própria série: o WIN só negocia no pregão (cerca de 252
 * dias, umas 9 horas por dia), então a conta do cripto (365 × 24 h) inflaria o Sharpe.
 */
export function barrasPorAnoDaSerie(candles: number, inicio: number, fim: number): number {
  const anos = (fim - inicio) / ANO_MS;
  return anos > 0 && candles > 0 ? candles / anos : 1;
}

const soma = (ops: readonly OperacaoWin[], f: (o: OperacaoWin) => Valor): Valor =>
  ops.reduce((s, o) => s.plus(f(o)), dec(0));
const centavos = (v: Valor): string => paraTexto(v.toDecimalPlaces(2));

/** O resultado do WIN no formato que as métricas de sempre leem (taxas = tarifa + corretagem). */
function comoBacktest(r: ResultadoBacktestWin): ResultadoBacktest {
  const ops = r.operacoes;
  const acertos = ops.filter((o) => o.resultado.gt(0)).length;
  return {
    operacoes: ops.length,
    acertos,
    taxaAcerto: ops.length === 0 ? 0 : acertos / ops.length,
    taxasPagas: soma(ops, (o) => o.tarifas.plus(o.corretagem)),
    ordens: ops.length * 2,
    resultadoLiquido: r.resultadoLiquido,
    patrimonioFinal: r.patrimonioFinal,
    maiorQueda: r.maiorQueda,
    maiorQuedaPercentual: r.maiorQuedaPercentual,
    curva: r.curva,
    buyHold: r.referencia,
    operacoesFechadas: ops,
    deslizamentoPago: soma(ops, (o) => o.deslizamento),
    barrasExpostas: r.barrasExpostas,
    saidasIntrabar: r.saidasIntrabar,
    candles: r.candles,
    entradasBarradasPorEvento: r.entradasBarradasPorEvento,
    entradasReduzidasPorEvento: r.entradasReduzidasPorEvento,
  };
}

function porLado(ops: readonly OperacaoWin[]) {
  const compradas = ops.filter((o) => o.sentido === "comprado");
  const vendidas = ops.filter((o) => o.sentido === "vendido");
  return {
    operacoesCompradas: compradas.length,
    operacoesVendidas: vendidas.length,
    resultadoComprado: paraTexto(soma(compradas, (o) => o.resultado)),
    resultadoVendido: paraTexto(soma(vendidas, (o) => o.resultado)),
  };
}

/** Reais e pontos, contratos, custos da B3, deslizamento, IR estimado e a referência da sessão. */
export function metricasDoWin(r: ResultadoBacktestWin, c: ContextoMetricasWin): MetricasWin {
  const ops = r.operacoes;
  const contratos = ops.reduce((s, o) => s + o.contratos, 0);
  const bruto = soma(ops, (o) => o.bruto);
  const tarifas = soma(ops, (o) => o.tarifas);
  const corretagem = soma(ops, (o) => o.corretagem);
  const deslizamento = soma(ops, (o) => o.deslizamento);
  const liquido = r.resultadoLiquido;
  const porContrato = contratos === 0 ? dec(0) : liquido.div(contratos);
  const ir = apurarIrDayTrade(ops.map((o) => ({ dia: o.dia, resultado: o.resultado })));
  const sessao = r.referencia.final.minus(c.saldoInicial);
  return {
    simbolo: c.simbolo,
    aproximacao: c.simbolo === PROXY,
    contratosNegociados: contratos,
    ...porLado(ops),
    pontosBrutos: paraTexto(pontosDosReais(bruto)),
    pontosLiquidos: paraTexto(pontosDosReais(liquido)),
    resultadoPorContrato: centavos(porContrato),
    pontosPorContrato: centavos(pontosDosReais(porContrato)),
    custosB3: paraTexto(tarifas),
    corretagem: paraTexto(corretagem),
    deslizamentoPago: paraTexto(deslizamento),
    deslizamentoPontos: paraTexto(pontosDosReais(deslizamento)),
    custosSobreBruto: bruto.gt(0) ? tarifas.plus(corretagem).plus(deslizamento).div(bruto).toNumber() : null,
    irEstimado: paraTexto(ir.irTotal),
    irrfInformativo: paraTexto(ir.irrfTotal),
    prejuizoACompensar: paraTexto(ir.prejuizoACompensar),
    liquidoDepoisDoIr: paraTexto(liquido.minus(ir.irTotal)),
    meses: ir.meses.map((m) => ({
      mes: m.mes,
      resultado: paraTexto(m.resultado),
      prejuizoAntes: paraTexto(m.prejuizoAntes),
      compensado: paraTexto(m.compensado),
      base: paraTexto(m.base),
      ir: paraTexto(m.ir),
      irrf: paraTexto(m.irrf),
      prejuizoDepois: paraTexto(m.prejuizoDepois),
    })),
    zeragens: r.zeragens,
    semEspacoNoRisco: r.semEspacoNoRisco,
    barradasPelosLimites: r.barradasPelosLimites,
    dias: r.dias,
    sessao: {
      resultado: paraTexto(sessao),
      resultadoPercentual: c.saldoInicial.isZero() ? 0 : sessao.div(c.saldoInicial).toNumber(),
    },
  };
}

/** As métricas de sempre (em reais, anualizadas pelos candles do pregão) mais o bloco `win`. */
export function metricasGravadasWin(r: ResultadoBacktestWin, c: ContextoMetricasWin): MetricasBacktest {
  const porAno = barrasPorAnoDaSerie(r.candles.length, c.inicio, c.fim);
  return {
    ...metricasGravadas(comoBacktest(r), {
      saldoInicial: c.saldoInicial,
      riscoPorOperacao: c.riscoPorOperacao,
      porAno,
      inicio: c.inicio,
      fim: c.fim,
      precisaoMinuto: false,
      ...(c.diasDeEvento ? { diasDeEvento: c.diasDeEvento } : {}),
    }),
    win: metricasDoWin(r, c),
  };
}
