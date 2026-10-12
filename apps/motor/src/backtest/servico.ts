import type { BacktestParaRodar, ResultadoBacktestGravado } from "@zentrade/banco";
import {
  ConfiguracaoBacktestEsquema,
  limitesPadraoDoBacktest,
  type ConfiguracaoBacktest,
  type LimitesRiscoDTO,
  type PontoCurvaBacktest,
} from "@zentrade/contratos";
import { dec, paraTexto, type LimitesRisco, type Valor } from "@zentrade/dominio";
import type { Registro } from "../nucleo/tipos.js";
import { candlesHistoricos, type FontesCandles } from "./candles-historicos.js";
import { metricasGravadas } from "./metricas-gravadas.js";
import { barrasPorAno } from "./metricas-retorno.js";
import { rodarBacktest, type ResultadoBacktest } from "./rodar.js";
import { validarBacktest } from "./validacao/index.js";

/** O pedaço do repositório de backtests (packages/banco) que o motor usa. */
export interface RepositorioBacktestsDoMotor {
  paraRodar(id: string): Promise<BacktestParaRodar | null>;
  concluir(id: string, resultado: ResultadoBacktestGravado): Promise<void>;
  falhar(id: string, erro: string): Promise<void>;
}

export interface DependenciasBacktest {
  readonly backtests: RepositorioBacktestsDoMotor;
  readonly fontes: FontesCandles;
  readonly registro: Registro;
}

export interface OpcoesBacktest {
  /** Saldo quando o pedido não traz um. */
  readonly saldoInicial: Valor;
  /** Fração do saldo arriscada por operação no modo "sem limites" (0,01 = 1%). */
  readonly riscoPorOperacao: number;
}

const AQUECIMENTO = 200;
const PONTOS_CURVA = 1000;

/** No máximo `maximo` itens igualmente espaçados, sempre com o primeiro e o último. */
export function reduzirCurva<T>(curva: readonly T[], maximo: number): T[] {
  if (curva.length <= maximo) return [...curva];
  const passo = (curva.length - 1) / (maximo - 1);
  return Array.from({ length: maximo }, (_, i) => curva[Math.round(i * passo)] as T);
}

const doDTO = (l: LimitesRiscoDTO): LimitesRisco => ({
  perdaDiariaMaxima: dec(l.perdaDiariaMaxima),
  exposicaoMaxima: dec(l.exposicaoMaxima),
  ordensPorHoraMax: l.ordensPorHoraMax,
  pausaAposPerdaMs: l.pausaAposPerdaMin * 60_000,
  confiancaMinima: l.confiancaMinima,
});

/**
 * `robo` (padrão): os limites do robô de verdade — os informados ou os de um robô novo
 * proporcionais ao saldo. `sem_limites`: só a estratégia, sem freio de perda diária,
 * frequência ou pausa após perda (menos realista); risco por operação do ambiente.
 */
export function limitesDoBacktest(
  c: ConfiguracaoBacktest,
  saldo: Valor,
  riscoSemLimites: number,
): { limites: LimitesRisco; riscoPorOperacao: Valor } {
  if (c.risco.modo === "sem_limites")
    return {
      limites: {
        perdaDiariaMaxima: saldo,
        exposicaoMaxima: saldo,
        ordensPorHoraMax: 1_000,
        pausaAposPerdaMs: 0,
        confiancaMinima: 0,
      },
      riscoPorOperacao: saldo.times(riscoSemLimites),
    };
  const l = c.risco.limites ?? limitesPadraoDoBacktest(paraTexto(saldo));
  return { limites: doDTO(l), riscoPorOperacao: dec(l.riscoPorOperacao) };
}

function curvaGravada(r: ResultadoBacktest): PontoCurvaBacktest[] {
  const pontos = r.curva.map((p, i) => {
    const bh = r.buyHold.curva[i];
    return {
      em: p.em,
      patrimonio: paraTexto(p.patrimonio),
      ...(bh ? { buyHold: paraTexto(bh.patrimonio) } : {}),
    };
  });
  return reduzirCurva(pontos, PONTOS_CURVA);
}

async function rodar(d: DependenciasBacktest, o: OpcoesBacktest, p: BacktestParaRodar) {
  const config = ConfiguracaoBacktestEsquema.parse(p.configuracao ?? {});
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
    ...(minutos ? { minutos } : {}),
  });
  const porAno = barrasPorAno(p.intervalo);
  const contexto = { saldoInicial: saldo, riscoPorOperacao, porAno, inicio: p.inicio, fim: p.fim };
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
  return { metricas, curva: curvaGravada(r), validacao };
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
