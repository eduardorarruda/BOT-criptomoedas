import {
  configuracaoWin,
  SIMBOLO_WIN_IBOV,
  type ConfiguracaoBacktest,
  type MetricasBacktest,
  type MetricasWin,
} from "@zentrade/contratos/esquemas";
import { momentos } from "@zentrade/financas";
import { apurarIrDayTrade, dec, diaB3 } from "@zentrade/dominio";
import type { Backtest, PontoCurvaBacktest } from "../api/esquemas";
import { criarAleatorio, normal } from "./aleatorio";
import { maiorQuedaDe, retornosDe, sharpeDe, validacaoDemo, type SerieDemo } from "./backtestDemoValidacao";

/**
 * Backtests do mini índice no modo de demonstração: pregões sintéticos, operações de
 * day trade nos dois sentidos com custos por contrato (tarifa da B3, corretagem,
 * deslizamento em ticks), zeragem no fim do dia, IR estimado e a referência "sempre
 * comprado na sessão". Contas simples, determinísticas pela semente; o de verdade é o
 * do motor (apps/motor/src/backtest/win).
 */
export interface PerfilWin {
  readonly semente: number;
  /** Pontos a favor por operação, em média, antes dos custos (a "vantagem"). */
  readonly vantagemPontos: number;
  readonly vantagemDepois?: number;
  readonly ateFracao?: number;
  /** Desvio dos pontos de cada operação. */
  readonly volatilidadePontos: number;
  /** Deriva do índice por pregão (para a referência da sessão), em pontos. */
  readonly derivaDia: number;
  readonly operacoesPorDia: number;
}

interface Pedido {
  readonly simbolo: string;
  readonly inicio: number;
  readonly fim: number;
}

const DIA = 86_400_000;
const ANO = 365 * DIA;
const PONTO = 0.2;
const TICK = 5;
const STOP_PONTOS = 250;
const MAXIMO_DIAS = 260;
/** Abertura do índice à vista (10:00 de Brasília = 13:00 UTC) e candles de 5 min. */
const ABERTURA_UTC_MS = 13 * 3_600_000;
const CANDLES_POR_DIA = 84;

interface OperacaoDemo {
  readonly abertaEm: number;
  readonly fechadaEm: number;
  readonly dia: string;
  readonly vendida: boolean;
  readonly contratos: number;
  readonly bruto: number;
  readonly tarifas: number;
  readonly corretagem: number;
  readonly deslizamento: number;
  readonly resultado: number;
  readonly retorno: number;
}

/**
 * Os dias úteis do fim do período para trás: sempre 5 de cada 7 dias corridos (no
 * máximo MAXIMO_DIAS), para o exemplo sair igual em qualquer dia da semana.
 */
function pregoes(p: Pedido): number[] {
  const quantos = Math.min(MAXIMO_DIAS, Math.round((((p.fim - p.inicio) / DIA) * 5) / 7));
  const dias: number[] = [];
  for (let t = Math.floor((p.fim - 1) / DIA) * DIA; dias.length < quantos; t -= DIA) {
    const semana = new Date(t).getUTCDay();
    if (semana !== 0 && semana !== 6) dias.unshift(t);
  }
  return dias;
}

function custos(c: ConfiguracaoBacktest) {
  const w = configuracaoWin(c);
  const porLado = { tarifa: Number(w.tarifaB3PorContrato), corretagem: Number(w.corretagemPorContrato) };
  const ticks = w.deslizamentoTicks;
  const idaEVolta = 2 * (porLado.tarifa + porLado.corretagem) + 2 * ticks * TICK * PONTO;
  const contratos = Math.max(
    0,
    Math.min(
      w.contratosMaximos,
      Math.floor(Number(w.riscoPorOperacao) / (STOP_PONTOS * PONTO + idaEVolta)),
      Math.floor(Number(c.saldoInicial ?? "5000") / Number(w.margemPorContrato)),
    ),
  );
  return { ...porLado, ticks, contratos };
}

function simular(p: Pedido, perfil: PerfilWin, c: ConfiguracaoBacktest) {
  const sortear = criarAleatorio(perfil.semente);
  const k = custos(c);
  const capital = Number(c.saldoInicial ?? "5000");
  const dias = pregoes(p);
  const s = { em: [] as number[], patrimonio: [] as number[], buyHold: [] as number[] };
  const operacoes: OperacaoDemo[] = [];
  let valor = capital;
  let sessao = capital;
  dias.forEach((d, n) => {
    const abertura = d + ABERTURA_UTC_MS;
    const vantagem =
      n / dias.length < (perfil.ateFracao ?? 1)
        ? perfil.vantagemPontos
        : (perfil.vantagemDepois ?? perfil.vantagemPontos);
    const quantas = k.contratos === 0 ? 0 : Math.floor(sortear() * (perfil.operacoesPorDia + 1));
    for (let j = 0; j < quantas; j++) {
      const pontos = Math.max(-STOP_PONTOS - TICK, vantagem + perfil.volatilidadePontos * normal(sortear));
      const deslizamento = 2 * k.ticks * TICK * PONTO * k.contratos;
      const tarifas = 2 * k.tarifa * k.contratos;
      const corretagem = 2 * k.corretagem * k.contratos;
      const bruto = pontos * PONTO * k.contratos;
      const resultado = bruto - deslizamento - tarifas - corretagem;
      const fechadaEm = abertura + (12 + j * 18) * 300_000 - 1;
      operacoes.push({
        abertaEm: fechadaEm - 6 * 300_000,
        fechadaEm,
        dia: diaB3(fechadaEm),
        vendida: sortear() < 0.5,
        contratos: k.contratos,
        bruto,
        tarifas,
        corretagem,
        deslizamento,
        resultado,
        retorno: resultado / valor,
      });
      valor += resultado;
      s.em.push(fechadaEm);
      s.patrimonio.push(valor);
      s.buyHold.push(sessao);
    }
    const pontosDoDia = perfil.derivaDia + 600 * normal(sortear);
    sessao += pontosDoDia * PONTO - 2 * k.ticks * TICK * PONTO - 2 * (k.tarifa + k.corretagem);
    s.em.push(abertura + CANDLES_POR_DIA * 300_000 - 1);
    s.patrimonio.push(valor);
    s.buyHold.push(sessao);
  });
  const anos = (p.fim - p.inicio) / ANO;
  // A curva do exemplo tem um ponto por operação e um por pregão: anualiza por eles.
  return { s, operacoes, capital, porAno: s.em.length / Math.max(anos, 1 / 365), dias };
}

const texto = (v: number) => v.toFixed(2);
const soma = (ops: readonly OperacaoDemo[], f: (o: OperacaoDemo) => number) =>
  ops.reduce((t, o) => t + f(o), 0);

function blocoWin(r: ReturnType<typeof simular>, simbolo: string): MetricasWin {
  const ops = r.operacoes;
  const liquido = soma(ops, (o) => o.resultado);
  const bruto = soma(ops, (o) => o.bruto);
  const tarifas = soma(ops, (o) => o.tarifas);
  const corretagem = soma(ops, (o) => o.corretagem);
  const deslizamento = soma(ops, (o) => o.deslizamento);
  const contratos = soma(ops, (o) => o.contratos);
  const ir = apurarIrDayTrade(ops.map((o) => ({ dia: o.dia, resultado: dec(o.resultado.toFixed(2)) })));
  const vendidas = ops.filter((o) => o.vendida);
  const sessao = (r.s.buyHold.at(-1) ?? r.capital) - r.capital;
  const porContrato = contratos ? liquido / contratos : 0;
  return {
    simbolo,
    aproximacao: simbolo === SIMBOLO_WIN_IBOV,
    contratosNegociados: contratos,
    operacoesCompradas: ops.length - vendidas.length,
    operacoesVendidas: vendidas.length,
    resultadoComprado: texto(liquido - soma(vendidas, (o) => o.resultado)),
    resultadoVendido: texto(soma(vendidas, (o) => o.resultado)),
    pontosBrutos: texto(bruto / PONTO),
    pontosLiquidos: texto(liquido / PONTO),
    resultadoPorContrato: texto(porContrato),
    pontosPorContrato: texto(porContrato / PONTO),
    custosB3: texto(tarifas),
    corretagem: texto(corretagem),
    deslizamentoPago: texto(deslizamento),
    deslizamentoPontos: texto(deslizamento / PONTO),
    custosSobreBruto: bruto > 0 ? (tarifas + corretagem + deslizamento) / bruto : null,
    irEstimado: ir.irTotal.toFixed(2),
    irrfInformativo: ir.irrfTotal.toFixed(2),
    prejuizoACompensar: ir.prejuizoACompensar.toFixed(2),
    liquidoDepoisDoIr: texto(liquido - ir.irTotal.toNumber()),
    meses: ir.meses.map((m) => ({
      mes: m.mes,
      resultado: m.resultado.toFixed(2),
      prejuizoAntes: m.prejuizoAntes.toFixed(2),
      compensado: m.compensado.toFixed(2),
      base: m.base.toFixed(2),
      ir: m.ir.toFixed(2),
      irrf: m.irrf.toFixed(2),
      prejuizoDepois: m.prejuizoDepois.toFixed(2),
    })),
    zeragens: Math.round(ops.length * 0.35),
    semEspacoNoRisco: 0,
    barradasPelosLimites: Math.round(ops.length * 0.04),
    dias: r.dias.length,
    sessao: { resultado: texto(sessao), resultadoPercentual: sessao / r.capital },
  };
}

function metricas(r: ReturnType<typeof simular>, p: Pedido, c: ConfiguracaoBacktest): MetricasBacktest {
  const win = blocoWin(r, p.simbolo);
  const { s, operacoes: ops, capital } = r;
  const final = s.patrimonio.at(-1) ?? capital;
  const liquido = final - capital;
  const retornos = retornosDe(capital, s.patrimonio);
  const m = momentos(retornos);
  const queda = maiorQuedaDe([capital, ...s.patrimonio]);
  const ganhos = ops.filter((o) => o.resultado > 0).map((o) => o.resultado);
  const perdas = ops.filter((o) => o.resultado < 0).map((o) => o.resultado);
  const media = (v: number[]) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : null);
  const ganhoMedio = media(ganhos);
  const perdaMedia = media(perdas);
  const bhRetorno = win.sessao.resultadoPercentual;
  const bruto = Number(win.pontosBrutos) * PONTO;
  return {
    resultadoLiquido: texto(liquido),
    resultadoPercentual: liquido / capital,
    resultadoBruto: texto(bruto),
    resultadoBrutoPercentual: bruto / capital,
    patrimonioFinal: texto(final),
    maiorQueda: texto(queda * Math.max(...s.patrimonio, capital)),
    maiorQuedaPercentual: queda,
    operacoes: ops.length,
    acertos: ganhos.length,
    taxaAcerto: ops.length ? ganhos.length / ops.length : 0,
    taxasPagas: texto(Number(win.custosB3) + Number(win.corretagem)),
    deslizamentoPago: win.deslizamentoPago,
    ordens: ops.length * 2,
    saldoInicial: texto(capital),
    riscoPorOperacao: configuracaoWin(c).riscoPorOperacao,
    candles: r.dias.length * CANDLES_POR_DIA,
    cagr: null,
    volatilidadeAnual: m.desvio * Math.sqrt(r.porAno),
    sharpe: sharpeDe(retornos, r.porAno),
    sortino: null,
    calmar: null,
    fatorLucro: perdas.length ? ganhos.reduce((a, b) => a + b, 0) / -perdas.reduce((a, b) => a + b, 0) : null,
    expectativa: texto(ops.length ? liquido / ops.length : 0),
    ganhoMedio: ganhoMedio === null ? null : texto(ganhoMedio),
    perdaMedia: perdaMedia === null ? null : texto(perdaMedia),
    payoff: ganhoMedio !== null && perdaMedia !== null ? ganhoMedio / -perdaMedia : null,
    tempoExposto: Math.min(1, (ops.length * 6) / Math.max(1, r.dias.length * CANDLES_POR_DIA)),
    buyHoldResultadoPercentual: bhRetorno,
    buyHoldMaiorQuedaPercentual: maiorQuedaDe([capital, ...s.buyHold]),
    buyHoldSharpe: sharpeDe(retornosDe(capital, s.buyHold), r.porAno),
    excessoSobreBuyHold: liquido / capital - bhRetorno,
    observacoes: m.n,
    barrasPorAno: r.porAno,
    assimetria: m.assimetria,
    curtose: m.curtose,
    anos: (p.fim - p.inicio) / ANO,
    stopsIntrabar: perdas.length,
    alvosIntrabar: 0,
    candlesAmbiguos: Math.round(ops.length * 0.02),
    precisaoMinuto: false,
    win,
  };
}

const AVISO_APROXIMACAO = {
  codigo: "aproximacao_ibov",
  nivel: "atencao" as const,
  base: "heuristica" as const,
  mensagem:
    "Aproximação: o índice à vista não tem a base do futuro nem o horário completo do WIN; valide com dados reais do WIN antes de operar.",
};

/** Resultado completo (métricas com o bloco win, curva com a referência da sessão e validação). */
export function resultadoDemoWin(
  p: Pedido,
  perfil: PerfilWin,
  configuracao: ConfiguracaoBacktest,
): Pick<Backtest, "metricas" | "curva" | "validacao"> {
  const r = simular(p, perfil, configuracao);
  const serie: SerieDemo = { ...r.s, operacoes: r.operacoes, porAno: r.porAno, capital: r.capital };
  const passo = Math.max(1, Math.ceil(r.s.em.length / 400));
  const curva: PontoCurvaBacktest[] = r.s.em
    .map((em, i) => ({ em, patrimonio: texto(r.s.patrimonio[i] ?? 0), buyHold: texto(r.s.buyHold[i] ?? 0) }))
    .filter((_, i) => i % passo === 0 || i === r.s.em.length - 1);
  const validacao = validacaoDemo(
    serie,
    p,
    configuracao.validacao,
    configuracao.risco.modo === "sem_limites",
  );
  return {
    metricas: metricas(r, p, configuracao),
    curva,
    validacao: {
      ...validacao,
      avisos: [...validacao.avisos, ...(p.simbolo === SIMBOLO_WIN_IBOV ? [AVISO_APROXIMACAO] : [])],
    },
  };
}

/** Perfil de um pedido de WIN feito na tela do exemplo: vantagem pequena, que os custos comem. */
export function perfilWinDoPedido(semente: number): PerfilWin {
  const sorte = criarAleatorio(semente);
  return {
    semente,
    vantagemPontos: 4 + sorte() * 14,
    vantagemDepois: sorte() < 0.5 ? -6 : 8,
    ateFracao: 0.7,
    volatilidadePontos: 180 + sorte() * 80,
    derivaDia: (sorte() - 0.5) * 200,
    operacoesPorDia: 3,
  };
}
