import type { BacktestParaRodar, ResultadoBacktestGravado } from "@zentrade/banco";
import {
  ConfiguracaoBacktestEsquema,
  mercadoDo,
  type ConfiguracaoBacktest,
  type PontoCurvaBacktest,
} from "@zentrade/contratos";
import { dec, paraTexto, type EventoMercado, type Valor } from "@zentrade/dominio";
import type { Registro } from "../nucleo/tipos.js";
import { candlesHistoricos, type FontesCandles } from "./candles-historicos.js";
import { limitesDoBacktest } from "./limites.js";
import { metricasGravadas } from "./metricas-gravadas.js";
import { barrasPorAno } from "./metricas-retorno.js";
import type { PontoCurva } from "./metricas.js";
import { rodarBacktest } from "./rodar.js";
import { validarBacktest } from "./validacao/index.js";
import { rodarWin } from "./win/servico.js";

export { limitesDoBacktest } from "./limites.js";

/** O pedaço do repositório de backtests (packages/banco) que o motor usa. */
export interface RepositorioBacktestsDoMotor {
  paraRodar(id: string): Promise<BacktestParaRodar | null>;
  concluir(id: string, resultado: ResultadoBacktestGravado): Promise<void>;
  falhar(id: string, erro: string): Promise<void>;
}

/** A agenda de eventos de mercado da pessoa (packages/banco), lida sob RLS. */
export interface AgendaDoBacktest {
  listar(usuarioId: string, de: string, ate: string): Promise<readonly EventoMercado[]>;
}

export interface DependenciasBacktest {
  readonly backtests: RepositorioBacktestsDoMotor;
  /** Sem ela, backtest com o filtro de dia de evento ligado falha com a explicação. */
  readonly agenda?: AgendaDoBacktest;
  readonly fontes: FontesCandles;
  readonly registro: Registro;
}

export interface OpcoesBacktest {
  /** Saldo quando o pedido não traz um. */
  readonly saldoInicial: Valor;
  /** Fração do saldo arriscada por operação no modo "sem limites" (0,01 = 1%). */
  readonly riscoPorOperacao: number;
  /** O fuso da instância: onde começa o dia da perda diária no backtest (como ao vivo). */
  readonly fuso?: string;
}

const AQUECIMENTO = 200;
const PONTOS_CURVA = 1000;

/** No máximo `maximo` itens igualmente espaçados, sempre com o primeiro e o último. */
export function reduzirCurva<T>(curva: readonly T[], maximo: number): T[] {
  if (curva.length <= maximo) return [...curva];
  const passo = (curva.length - 1) / (maximo - 1);
  return Array.from({ length: maximo }, (_, i) => curva[Math.round(i * passo)] as T);
}

/** A curva e a referência (buy and hold no cripto; sempre comprado na sessão no WIN), reduzidas. */
function curvaGravada(curva: readonly PontoCurva[], referencia: readonly PontoCurva[]): PontoCurvaBacktest[] {
  const pontos = curva.map((p, i) => {
    const bh = referencia[i];
    return {
      em: p.em,
      patrimonio: paraTexto(p.patrimonio),
      ...(bh ? { buyHold: paraTexto(bh.patrimonio) } : {}),
    };
  });
  return reduzirCurva(pontos, PONTOS_CURVA);
}

const DIA_MS = 86_400_000;

/**
 * Os eventos da pessoa no período, quando o filtro de dia de evento está ligado. Pede
 * dois dias a mais de cada lado: o dia do evento é o do fuso do mercado, não o de UTC.
 */
async function eventosDoPeriodo(
  d: DependenciasBacktest,
  p: BacktestParaRodar,
  config: ConfiguracaoBacktest,
): Promise<readonly EventoMercado[] | undefined> {
  if (config.diasDeEvento === "ignorar") return undefined;
  if (!d.agenda)
    throw new Error(
      "O filtro de dias de evento está ligado, mas a agenda de eventos não está disponível neste motor; desligue o filtro ou verifique o banco.",
    );
  const dia = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  return d.agenda.listar(p.usuarioId, dia(p.inicio - 2 * DIA_MS), dia(p.fim + 2 * DIA_MS));
}

async function rodar(d: DependenciasBacktest, o: OpcoesBacktest, p: BacktestParaRodar) {
  const config = ConfiguracaoBacktestEsquema.parse(p.configuracao ?? {});
  const eventos = await eventosDoPeriodo(d, p, config);
  if (mercadoDo(config) === "win") {
    const w = await rodarWin(d.fontes, p, config, eventos);
    return { metricas: w.metricas, curva: curvaGravada(w.curva, w.referencia.curva), validacao: w.validacao };
  }
  const saldo = config.saldoInicial ? dec(config.saldoInicial) : o.saldoInicial;
  const { limites, riscoPorOperacao } = limitesDoBacktest(config, saldo, o.riscoPorOperacao);
  const consulta = { simbolo: p.simbolo, intervalo: p.intervalo, inicio: p.inicio, fim: p.fim };
  const candles = await candlesHistoricos(d.fontes, consulta, AQUECIMENTO);
  const minutos = config.precisaoMinuto
    ? await candlesHistoricos(d.fontes, { ...consulta, intervalo: "1m" }, 0)
    : undefined;
  const r = await rodarBacktest({
    ...consulta,
    candles,
    estrategia: p.estrategia,
    limites,
    riscoPorOperacao,
    saldoInicial: saldo,
    agente: "sempre_concorda",
    aquecimento: AQUECIMENTO,
    custos: config.custos,
    execucao: config.execucao,
    ...(eventos ? { eventos } : {}),
    ...(minutos ? { minutos } : {}),
    ...(o.fuso ? { fuso: o.fuso } : {}),
  });
  const porAno = barrasPorAno(p.intervalo);
  const contexto = {
    saldoInicial: saldo,
    riscoPorOperacao,
    porAno,
    inicio: p.inicio,
    fim: p.fim,
    diasDeEvento: config.diasDeEvento,
  };
  const metricas = metricasGravadas(r, { ...contexto, precisaoMinuto: Boolean(minutos?.length) });
  const validacao = validarBacktest(
    { saldoInicial: saldo, curva: r.curva, buyHold: r.buyHold.curva, operacoes: r.operacoesFechadas, porAno },
    { inicio: p.inicio, fim: p.fim },
    config.validacao,
    {
      semLimites: config.risco.modo === "sem_limites",
      candlesAmbiguos: r.saidasIntrabar.ambiguos,
      precisaoMinuto: Boolean(minutos?.length),
    },
  );
  return { metricas, curva: curvaGravada(r.curva, r.buyHold.curva), validacao };
}

/**
 * Um job da fila `backtests`: lê o pedido no banco, baixa os candles, roda com as
 * mesmas funções do robô ao vivo, valida (dentro/fora da amostra, walk-forward, Monte
 * Carlo, avisos) e grava o resultado. Erro do backtest (estratégia, janela sem candles)
 * vira `falhou` com a mensagem; erro do banco sobe para a fila tentar de novo.
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
