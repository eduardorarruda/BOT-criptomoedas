import type { CustosBacktest, Intervalo, RoboConfig } from "@zentrade/contratos";
import { ativosDoSimbolo, PapelCorretora } from "@zentrade/corretora";
import {
  dec,
  limiteInferior,
  posicaoDe,
  recorte,
  validarEstrategia,
  type Candle,
  type Estrategia,
  type FiltrosAtivo,
  type LimitesRisco,
  type Posicao,
  type Valor,
} from "@zentrade/dominio";
import { operacoesFechadas, type OperacaoFechada } from "../historico.js";
import { NucleoRobo } from "../nucleo/nucleo-robo.js";
import { OPCOES_PADRAO, type Dependencias, type Registro } from "../nucleo/tipos.js";
import { AgenteFixo } from "../portas/agente-fixo.js";
import { AprovacaoMemoria, DecisoesMemoria, OrdensMemoria, RobosMemoria } from "../portas/memoria.js";
import { RelogioManual } from "../relogio.js";
import { USUARIO_LOCAL } from "../usuario-local.js";
import { curvaBuyHold, type ResultadoBuyHold } from "./buy-hold.js";
import { bpsContra, custoDeslizamento } from "./custos.js";
import { niveisDaPosicao, saidaNoCaminho, saidaNoCandle, type SaidaIntrabar } from "./intrabar.js";
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
  /** Sem custos informados: a taxa da estratégia e nenhum deslizamento. */
  readonly custos?: CustosBacktest;
  /** Candles de 1 minuto da janela: dizem o que veio primeiro dentro de cada candle. */
  readonly minutos?: readonly Candle[];
  readonly filtros?: FiltrosAtivo;
  /** Janela operada: abertura em [inicio, fim). */
  readonly inicio?: number;
  readonly fim?: number;
  /** Candles antes do início usados só para os indicadores. Padrão 200. */
  readonly aquecimento?: number;
}

export interface SaidasIntrabar {
  readonly stop: number;
  readonly alvo: number;
  /** Candles em que stop e alvo cabiam juntos (contou o stop). */
  readonly ambiguos: number;
}

export interface ResultadoBacktest extends MetricasOperacoes {
  readonly resultadoLiquido: Valor;
  readonly patrimonioFinal: Valor;
  readonly maiorQueda: Valor;
  readonly maiorQuedaPercentual: number;
  readonly curva: PontoCurva[];
  readonly buyHold: ResultadoBuyHold;
  readonly operacoesFechadas: OperacaoFechada[];
  readonly deslizamentoPago: Valor;
  /** Candles que começaram com posição aberta. */
  readonly barrasExpostas: number;
  readonly saidasIntrabar: SaidasIntrabar;
  /** Candles da janela operada. */
  readonly candles: readonly Candle[];
}

const ID = "backtest";
const nada = () => undefined;

const custosDe = (e: EntradaBacktest): CustosBacktest =>
  e.custos ?? { taxaPorLado: e.estrategia.taxa, deslizamentoBps: 0, meioSpreadBps: 0 };

function montar(e: EntradaBacktest, aquecimento: number) {
  const relogio = new RelogioManual(0);
  const custos = custosDe(e);
  const corretora = new PapelCorretora({
    saldos: { [ativosDoSimbolo(e.simbolo).cotacao]: e.saldoInicial },
    taxa: custos.taxaPorLado,
    deslizamentoBps: bpsContra(custos),
    agora: () => relogio.agora(),
    ...(e.filtros ? { filtros: e.filtros } : {}),
  });
  const robo: RoboConfig = {
    id: ID,
    usuarioId: USUARIO_LOCAL,
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

type Montagem = ReturnType<typeof montar>;

/** Os candles de 1 minuto dentro de um candle do intervalo (vazio se não houver). */
function minutosDo(minutos: readonly Candle[] | undefined, c: Candle): readonly Candle[] {
  return minutos ? recorte(minutos, c.abertura, c.fechamento + 1, (m) => m.abertura) : [];
}

/** Onde a posição sairia dentro do candle: pelo caminho de 1 minuto, se houver; senão, pelo candle. */
function saidaDentroDo(
  e: EntradaBacktest,
  c: Candle,
  posicao: Posicao,
): (SaidaIntrabar & { readonly em: number }) | null {
  const niveis = niveisDaPosicao(posicao.precoMedio, e.estrategia);
  const minutos = minutosDo(e.minutos, c);
  if (minutos.length > 0) return saidaNoCaminho(minutos, niveis);
  const saida = saidaNoCandle(c, niveis);
  return saida ? { ...saida, em: c.fechamento } : null;
}

/**
 * Leva a saída intrabar ao robô pelo MESMO caminho da vigia de 1 minuto ao vivo: o
 * preço da corretora vai ao nível tocado e o núcleo decide (stop/alvo, risco, ordem).
 * Assim a ordem passa pelo motor de risco e paga taxa e deslizamento como qualquer outra.
 */
async function sairDentroDoCandle(
  m: Montagem,
  e: EntradaBacktest,
  c: Candle,
  s: { preco: Valor; em: number },
) {
  m.relogio.definir(s.em);
  m.corretora.definirPreco(e.simbolo, s.preco);
  await m.nucleo.aoFecharMinuto({
    abertura: Math.max(c.abertura, s.em - 59_999),
    fechamento: s.em,
    abre: s.preco,
    maxima: s.preco,
    minima: s.preco,
    fecha: s.preco,
    volume: dec(0),
  });
}

/**
 * Backtest com as MESMAS funções do robô ao vivo (NucleoRobo: decidir, agente,
 * risco, execução idempotente) sobre candles históricos, numa corretora de papel e
 * com um agente fixo. Stop e alvo são vigiados DENTRO do candle (mínima e máxima, ou o
 * caminho de 1 minuto). Determinístico: mesma entrada, mesmo resultado; sem rede.
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
  const m = montar(e, aquecimento);
  const anteriores = e.candles.slice(Math.max(0, corte - aquecimento), corte);
  anteriores.forEach((c) => m.corretora.alimentar(e.simbolo, e.intervalo, c));
  await m.nucleo.completarHistorico(anteriores);
  const curva: PontoCurva[] = [];
  const intrabar = { stop: 0, alvo: 0, ambiguos: 0 };
  let expostas = 0;
  for (const c of janela) {
    const posicao = posicaoDe(await m.ordens.execucoes(ID));
    if (posicao.quantidade.gt(0)) {
      expostas++;
      const saida = saidaDentroDo(e, c, posicao);
      if (saida) {
        await sairDentroDoCandle(m, e, c, saida);
        if (posicaoDe(await m.ordens.execucoes(ID)).quantidade.isZero()) {
          intrabar[saida.motivo]++;
          if (saida.ambiguo) intrabar.ambiguos++;
        }
      }
    }
    m.relogio.definir(c.fechamento);
    m.corretora.alimentar(e.simbolo, e.intervalo, c);
    await m.nucleo.aoFecharIntervalo(c);
    curva.push({ em: c.fechamento, patrimonio: await patrimonio(m.corretora, e.simbolo, c.fecha) });
  }
  if (m.erros.length > 0) throw new Error(`O backtest falhou: ${m.erros[0]}`);
  const execucoes = await m.ordens.execucoes(ID);
  return {
    ...resumir(e, curva, metricasDasExecucoes(execucoes, m.ordens.todas().length)),
    buyHold: curvaBuyHold(janela, e.saldoInicial, custosDe(e)),
    operacoesFechadas: operacoesFechadas(execucoes),
    deslizamentoPago: custoDeslizamento(execucoes, bpsContra(custosDe(e))),
    barrasExpostas: expostas,
    saidasIntrabar: intrabar,
    candles: janela,
  };
}

async function patrimonio(corretora: PapelCorretora, simbolo: string, preco: Valor): Promise<Valor> {
  const { base, cotacao } = ativosDoSimbolo(simbolo);
  return (await corretora.saldoLivre(cotacao)).plus((await corretora.saldoLivre(base)).times(preco));
}

function resumir(e: EntradaBacktest, curva: PontoCurva[], m: MetricasOperacoes) {
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
