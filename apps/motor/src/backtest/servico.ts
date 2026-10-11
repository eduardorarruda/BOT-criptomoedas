import type { BacktestParaRodar } from "@zentrade/banco";
import { paraTexto, type LimitesRisco, type Valor } from "@zentrade/dominio";
import type { Registro } from "../nucleo/tipos.js";
import { candlesHistoricos, type FontesCandles } from "./candles-historicos.js";
import type { PontoCurva } from "./metricas.js";
import { rodarBacktest, type ResultadoBacktest } from "./rodar.js";

/** O pedaço do repositório de backtests (packages/banco) que o motor usa. */
export interface RepositorioBacktestsDoMotor {
  paraRodar(id: string): Promise<BacktestParaRodar | null>;
  concluir(id: string, resultado: { metricas: unknown; curva: unknown }): Promise<void>;
  falhar(id: string, erro: string): Promise<void>;
}

export interface DependenciasBacktest {
  readonly backtests: RepositorioBacktestsDoMotor;
  readonly fontes: FontesCandles;
  readonly registro: Registro;
}

export interface OpcoesBacktest {
  readonly saldoInicial: Valor;
  /** Fração do saldo arriscada por operação (0,01 = 1%). */
  readonly riscoPorOperacao: number;
}

/** Métricas gravadas em backtests.metricas (nomes estáveis; dinheiro em texto, frações em número). */
export interface MetricasGravadas {
  readonly resultadoLiquido: string;
  readonly resultadoPercentual: number;
  readonly maiorQueda: string;
  readonly maiorQuedaPercentual: number;
  readonly operacoes: number;
  readonly acertos: number;
  readonly taxaAcerto: number;
  readonly taxasPagas: string;
  readonly ordens: number;
  readonly saldoInicial: string;
  readonly patrimonioFinal: string;
  readonly riscoPorOperacao: string;
  readonly candles: number;
}

/** Ponto de backtests.curva. */
export interface PontoCurvaGravado {
  readonly em: number;
  readonly patrimonio: string;
}

const AQUECIMENTO = 200;
const PONTOS_CURVA = 1000;

/** No máximo `maximo` pontos igualmente espaçados, sempre com o primeiro e o último. */
export function reduzirCurva(curva: readonly PontoCurva[], maximo: number): PontoCurva[] {
  if (curva.length <= maximo) return [...curva];
  const passo = (curva.length - 1) / (maximo - 1);
  return Array.from({ length: maximo }, (_, i) => curva[Math.round(i * passo)] as PontoCurva);
}

/**
 * Sem robô por trás, o backtest mede a estratégia: risco por operação e exposição
 * vêm do saldo; sem freio de perda diária, de frequência ou de pausa após perda.
 */
function limitesDoBacktest(saldo: Valor): LimitesRisco {
  return {
    perdaDiariaMaxima: saldo,
    exposicaoMaxima: saldo,
    ordensPorHoraMax: 1_000,
    pausaAposPerdaMs: 0,
    confiancaMinima: 0,
  };
}

function metricasGravadas(
  r: ResultadoBacktest,
  o: OpcoesBacktest,
  risco: Valor,
  candles: number,
): MetricasGravadas {
  return {
    resultadoLiquido: paraTexto(r.resultadoLiquido),
    resultadoPercentual: r.resultadoLiquido.div(o.saldoInicial).toNumber(),
    maiorQueda: paraTexto(r.maiorQueda),
    maiorQuedaPercentual: r.maiorQuedaPercentual,
    operacoes: r.operacoes,
    acertos: r.acertos,
    taxaAcerto: r.taxaAcerto,
    taxasPagas: paraTexto(r.taxasPagas),
    ordens: r.ordens,
    saldoInicial: paraTexto(o.saldoInicial),
    patrimonioFinal: paraTexto(r.patrimonioFinal),
    riscoPorOperacao: paraTexto(risco),
    candles,
  };
}

async function rodar(d: DependenciasBacktest, o: OpcoesBacktest, p: BacktestParaRodar) {
  const consulta = { simbolo: p.simbolo, intervalo: p.intervalo, inicio: p.inicio, fim: p.fim };
  const candles = await candlesHistoricos(d.fontes, consulta, AQUECIMENTO);
  const risco = o.saldoInicial.times(o.riscoPorOperacao);
  const r = await rodarBacktest({
    ...consulta,
    candles,
    estrategia: p.estrategia,
    limites: limitesDoBacktest(o.saldoInicial),
    riscoPorOperacao: risco,
    saldoInicial: o.saldoInicial,
    agente: "sempre_concorda",
    aquecimento: AQUECIMENTO,
  });
  const curva: PontoCurvaGravado[] = reduzirCurva(r.curva, PONTOS_CURVA).map((c) => ({
    em: c.em,
    patrimonio: paraTexto(c.patrimonio),
  }));
  const naJanela = candles.filter((c) => c.abertura >= p.inicio).length;
  return { metricas: metricasGravadas(r, o, risco, naJanela), curva };
}

/**
 * Um job da fila `backtests`: lê o pedido no banco, baixa os candles, roda com as
 * mesmas funções do robô ao vivo e grava o resultado. Erro do backtest (estratégia,
 * janela sem candles) vira `falhou` com a mensagem; erro do banco sobe para a fila
 * tentar de novo.
 */
export async function processarBacktest(
  d: DependenciasBacktest,
  o: OpcoesBacktest,
  backtestId: string,
): Promise<"concluido" | "falhou" | "ignorado"> {
  const pedido = await d.backtests.paraRodar(backtestId);
  if (!pedido) {
    d.registro.info({ backtestId }, "backtest já terminado ou inexistente: nada a fazer");
    return "ignorado";
  }
  let resultado: Awaited<ReturnType<typeof rodar>>;
  try {
    resultado = await rodar(d, o, pedido);
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    d.registro.error({ erro, backtestId }, "backtest falhou");
    await d.backtests.falhar(backtestId, mensagem);
    return "falhou";
  }
  await d.backtests.concluir(backtestId, resultado);
  d.registro.info({ backtestId, operacoes: resultado.metricas.operacoes }, "backtest concluído");
  return "concluido";
}
