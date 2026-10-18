import type { BacktestParaRodar } from "@zentrade/banco";
import {
  configuracaoWin,
  SALDO_PADRAO_WIN,
  SIMBOLO_WIN_IBOV,
  type AvisoBacktest,
  type ConfiguracaoBacktest,
  type MetricasBacktest,
  type ValidacaoBacktest,
} from "@zentrade/contratos";
import { dec } from "@zentrade/dominio";
import { candlesHistoricos, type FontesCandles } from "../candles-historicos.js";
import { limitesDoBacktest } from "../limites.js";
import { validarBacktest } from "../validacao/index.js";
import { barrasPorAnoDaSerie, metricasGravadasWin } from "./metricas.js";
import { modeloWinDe } from "./modelo.js";
import { HISTORICO_WIN, rodarBacktestWin, type ResultadoBacktestWin } from "./rodar.js";

/**
 * Candles de aquecimento antes do início: o mesmo histórico que os indicadores veem no
 * robô. O carregador conta em pregões (vai mais para trás em tempo corrido) e lê o
 * mini índice só do banco.
 */
const AQUECIMENTO_WIN = HISTORICO_WIN;

export const AVISO_APROXIMACAO =
  "Aproximação: o índice à vista não tem a base do futuro nem o horário completo do WIN; valide com dados reais do WIN antes de operar.";

function avisosDoWin(simbolo: string, r: ResultadoBacktestWin): AvisoBacktest[] {
  const avisos: AvisoBacktest[] = [];
  if (simbolo === SIMBOLO_WIN_IBOV)
    avisos.push({
      codigo: "aproximacao_ibov",
      nivel: "atencao",
      base: "heuristica",
      mensagem: AVISO_APROXIMACAO,
    });
  if (r.semEspacoNoRisco > 0)
    avisos.push({
      codigo: "sem_espaco_no_risco",
      nivel: "atencao",
      base: "heuristica",
      mensagem: `Em ${r.semEspacoNoRisco} sinal(is), nem 1 contrato coube no risco por operação ou na margem: a estratégia operou menos vezes que os sinais.`,
    });
  return avisos;
}

/**
 * Um backtest do mini índice: candles do banco (WIN-IBOV ou WIN), o modelo do WIN
 * (custos por contrato, sessão, zeragem, tamanho pelo risco em reais), as mesmas
 * métricas e a MESMA validação do cripto (dentro/fora da amostra, walk-forward, Monte
 * Carlo e avisos), com a referência "sempre comprado na sessão" no lugar do buy and hold.
 */
export async function rodarWin(
  fontes: FontesCandles,
  p: BacktestParaRodar,
  config: ConfiguracaoBacktest,
): Promise<{
  readonly metricas: MetricasBacktest;
  readonly curva: ResultadoBacktestWin["curva"];
  readonly referencia: ResultadoBacktestWin["referencia"];
  readonly validacao: ValidacaoBacktest;
}> {
  const saldo = dec(config.saldoInicial ?? SALDO_PADRAO_WIN);
  const modelo = modeloWinDe(configuracaoWin(config));
  const { limites } = limitesDoBacktest(config, saldo, 0);
  const consulta = { simbolo: p.simbolo, intervalo: p.intervalo, inicio: p.inicio, fim: p.fim };
  const candles = await candlesHistoricos(fontes, consulta, AQUECIMENTO_WIN);
  const r = rodarBacktestWin({
    simbolo: p.simbolo,
    candles,
    estrategia: p.estrategia,
    modelo,
    limites: config.risco.modo === "sem_limites" ? null : limites,
    saldoInicial: saldo,
    inicio: p.inicio,
    fim: p.fim,
  });
  const contexto = {
    simbolo: p.simbolo,
    saldoInicial: saldo,
    riscoPorOperacao: modelo.riscoPorOperacao,
    inicio: p.inicio,
    fim: p.fim,
  };
  const porAno = barrasPorAnoDaSerie(r.candles.length, p.inicio, p.fim);
  const validacao = validarBacktest(
    { saldoInicial: saldo, curva: r.curva, buyHold: r.referencia.curva, operacoes: r.operacoes, porAno },
    { inicio: p.inicio, fim: p.fim },
    config.validacao,
    {
      semLimites: config.risco.modo === "sem_limites",
      candlesAmbiguos: r.saidasIntrabar.ambiguos,
      precisaoMinuto: false,
    },
  );
  return {
    metricas: metricasGravadasWin(r, contexto),
    curva: r.curva,
    referencia: r.referencia,
    validacao: { ...validacao, avisos: [...validacao.avisos, ...avisosDoWin(p.simbolo, r)] },
  };
}
