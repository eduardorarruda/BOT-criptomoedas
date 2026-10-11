import type { Intervalo, RoboConfig } from "@zentrade/contratos";
import { ativosDoSimbolo, PapelCorretora } from "@zentrade/corretora";
import {
  limiteInferior,
  recorte,
  validarEstrategia,
  type Candle,
  type Estrategia,
  type FiltrosAtivo,
  type LimitesRisco,
  type Valor,
} from "@zentrade/dominio";
import { NucleoRobo } from "../nucleo/nucleo-robo.js";
import { OPCOES_PADRAO, type Dependencias, type Registro } from "../nucleo/tipos.js";
import { AgenteFixo } from "../portas/agente-fixo.js";
import { AprovacaoMemoria, DecisoesMemoria, OrdensMemoria, RobosMemoria } from "../portas/memoria.js";
import { RelogioManual } from "../relogio.js";
import { maiorQueda, metricasDasExecucoes, type MetricasOperacoes, type PontoCurva } from "./metricas.js";

export interface EntradaBacktest {
  readonly simbolo: string;
  readonly intervalo: Intervalo;
  /** Candles fechados em ordem de abertura. */
  readonly candles: readonly Candle[];
  readonly estrategia: Estrategia;
  readonly limites: LimitesRisco;
  readonly riscoPorOperacao: Valor;
  readonly saldoInicial: Valor;
  readonly agente: "sempre_concorda" | "nunca_concorda";
  readonly deslizamentoBps?: number;
  readonly filtros?: FiltrosAtivo;
  /** Janela operada: abertura em [inicio, fim). */
  readonly inicio?: number;
  readonly fim?: number;
  /** Candles antes do início usados só para os indicadores. Padrão 200. */
  readonly aquecimento?: number;
}

export interface ResultadoBacktest extends MetricasOperacoes {
  readonly resultadoLiquido: Valor;
  readonly patrimonioFinal: Valor;
  readonly maiorQueda: Valor;
  readonly maiorQuedaPercentual: number;
  readonly curva: PontoCurva[];
}

const ID = "backtest";
const nada = () => undefined;

function montar(e: EntradaBacktest, aquecimento: number) {
  const relogio = new RelogioManual(0);
  const corretora = new PapelCorretora({
    saldos: { [ativosDoSimbolo(e.simbolo).cotacao]: e.saldoInicial },
    taxa: e.estrategia.taxa,
    deslizamentoBps: e.deslizamentoBps ?? 0,
    agora: () => relogio.agora(),
    ...(e.filtros ? { filtros: e.filtros } : {}),
  });
  const robo: RoboConfig = {
    id: ID,
    simbolo: e.simbolo,
    intervalo: e.intervalo,
    modo: "auto",
    rede: "papel",
    estrategia: e.estrategia,
    limites: e.limites,
    riscoPorOperacao: e.riscoPorOperacao,
  };
  const erros: string[] = [];
  const registro: Registro = {
    debug: nada,
    info: nada,
    warn: nada,
    error: (obj, msg) => erros.push(`${msg}: ${String((obj as { erro?: unknown }).erro)}`),
  };
  const ordens = new OrdensMemoria(relogio);
  const deps: Dependencias = {
    corretora,
    robos: new RobosMemoria([robo]),
    decisoes: new DecisoesMemoria(),
    ordens,
    agente: new AgenteFixo(e.agente),
    eventos: { publicar: () => Promise.resolve() },
    aprovacao: new AprovacaoMemoria(),
    relogio,
    registro,
    dormir: relogio.dormir,
    opcoes: {
      ...OPCOES_PADRAO,
      agenteObrigatorio: true,
      tamanhoHistorico: Math.max(aquecimento, OPCOES_PADRAO.tamanhoHistorico),
    },
  };
  return { relogio, corretora, ordens, erros, nucleo: new NucleoRobo(robo, deps) };
}

/**
 * Backtest com as MESMAS funções do robô ao vivo (NucleoRobo: decidir, agente,
 * risco, execução idempotente) sobre candles históricos, numa corretora de papel e
 * com um agente fixo. Determinístico: mesma entrada, mesmo resultado; sem rede.
 */
export async function rodarBacktest(e: EntradaBacktest): Promise<ResultadoBacktest> {
  const problemas = validarEstrategia(e.estrategia);
  if (problemas.length > 0)
    throw new RangeError(`Estratégia inválida para o backtest: ${problemas.join("; ")}.`);
  const inicio = e.inicio ?? Number.NEGATIVE_INFINITY;
  const janela = recorte(e.candles, inicio, e.fim ?? Number.POSITIVE_INFINITY, (c) => c.abertura);
  if (janela.length === 0)
    throw new RangeError(
      "A janela do backtest não tem nenhum candle: confira início, fim e a série enviada.",
    );
  const aquecimento = e.aquecimento ?? 200;
  const corte = limiteInferior(e.candles, inicio, (c) => c.abertura);
  const { relogio, corretora, ordens, erros, nucleo } = montar(e, aquecimento);
  const anteriores = e.candles.slice(Math.max(0, corte - aquecimento), corte);
  anteriores.forEach((c) => corretora.alimentar(e.simbolo, e.intervalo, c));
  await nucleo.completarHistorico(anteriores);
  const curva: PontoCurva[] = [];
  for (const c of janela) {
    relogio.definir(c.fechamento);
    corretora.alimentar(e.simbolo, e.intervalo, c);
    await nucleo.aoFecharIntervalo(c);
    curva.push({ em: c.fechamento, patrimonio: await patrimonio(corretora, e.simbolo, c.fecha) });
  }
  if (erros.length > 0) throw new Error(`O backtest falhou: ${erros[0]}`);
  return resumir(e, curva, metricasDasExecucoes(await ordens.execucoes(ID), ordens.todas().length));
}

async function patrimonio(corretora: PapelCorretora, simbolo: string, preco: Valor): Promise<Valor> {
  const { base, cotacao } = ativosDoSimbolo(simbolo);
  return (await corretora.saldoLivre(cotacao)).plus((await corretora.saldoLivre(base)).times(preco));
}

function resumir(e: EntradaBacktest, curva: PontoCurva[], m: MetricasOperacoes): ResultadoBacktest {
  const patrimonioFinal = curva.at(-1)?.patrimonio ?? e.saldoInicial;
  const queda = maiorQueda(curva);
  return {
    ...m,
    resultadoLiquido: patrimonioFinal.minus(e.saldoInicial),
    patrimonioFinal,
    maiorQueda: queda.valor,
    maiorQuedaPercentual: queda.percentual,
    curva,
  };
}
