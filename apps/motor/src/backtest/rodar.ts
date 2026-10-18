import type { CustosBacktest, Intervalo, RoboConfig } from "@zentrade/contratos";
import { ativosDoSimbolo, PapelCorretora } from "@zentrade/corretora";
import {
  contextoDeCandles,
  formatarNumero,
  limiteInferior,
  posicaoDe,
  problemasNoMercado,
  recorte,
  validarEstrategia,
  type Candle,
  type ContextoMercado,
  type Estrategia,
  type FiltrosAtivo,
  type LimitesRisco,
  type Posicao,
  type Sinal,
  type Valor,
} from "@zentrade/dominio";
import { operacoesFechadas, type OperacaoFechada } from "../historico.js";
import { processarSinal } from "../nucleo/ciclo.js";
import { NucleoRobo } from "../nucleo/nucleo-robo.js";
import { OPCOES_PADRAO, type Dependencias, type Registro } from "../nucleo/tipos.js";
import { AgenteFixo } from "../portas/agente-fixo.js";
import { AprovacaoMemoria, DecisoesMemoria, OrdensMemoria, RobosMemoria } from "../portas/memoria.js";
import { RelogioManual } from "../relogio.js";
import { USUARIO_LOCAL } from "../usuario-local.js";
import {
  aoFecharComPosicao,
  contextoEntre,
  iniciar,
  niveisEfetivos,
  precisaAcompanhar,
  type PosicaoAcompanhada,
} from "./acompanhamento.js";
import { curvaBuyHold, type ResultadoBuyHold } from "./buy-hold.js";
import { bpsContra, custoDeslizamento } from "./custos.js";
import { saidaNoCaminho, saidaNoCandle, type NiveisSaida, type SaidaIntrabar } from "./intrabar.js";
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
  /** Onde começa o dia da perda diária (padrão: America/Sao_Paulo, como OPCOES_PADRAO). */
  readonly fuso?: string;
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
  const decisoes = new DecisoesMemoria();
  const deps: Dependencias = {
    corretora,
    robos: new RobosMemoria([robo]),
    decisoes,
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
      fuso: e.fuso ?? OPCOES_PADRAO.fuso,
    },
  };
  return { relogio, corretora, ordens, decisoes, erros, robo, deps, nucleo: new NucleoRobo(robo, deps) };
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
  niveis: NiveisSaida,
): (SaidaIntrabar & { readonly em: number }) | null {
  const minutos = minutosDo(e.minutos, c);
  if (minutos.length > 0) return saidaNoCaminho(minutos, niveis);
  const saida = saidaNoCandle(c, niveis);
  return saida ? { ...saida, em: c.fechamento } : null;
}

/**
 * Vende a posição inteira pelo MESMO ciclo do robô (processarSinal: plano, motor de
 * risco, ordem idempotente na corretora, diário), com a corretora no preço da saída.
 * Assim a saída paga taxa, deslizamento e spread como qualquer ordem a mercado.
 */
async function vender(
  m: Montagem,
  e: EntradaBacktest,
  s: { readonly preco: Valor; readonly em: number; readonly sinal: Sinal },
  posicao: Posicao,
  fechamentos: readonly number[],
): Promise<boolean> {
  m.relogio.definir(s.em);
  m.corretora.definirPreco(e.simbolo, s.preco);
  await processarSinal(m.deps, m.robo, { sinal: s.sinal, preco: s.preco, fechamentos, posicao, em: s.em });
  return (await posicaoAtual(m)).quantidade.isZero();
}

const posicaoAtual = async (m: Montagem): Promise<Posicao> => posicaoDe(await m.ordens.execucoes(ID));

function explicar(s: SaidaIntrabar, c: Candle): string {
  const extremo =
    s.motivo === "stop" ? `mínima ${formatarNumero(c.minima)}` : `máxima ${formatarNumero(c.maxima)}`;
  const ambiguo = s.ambiguo ? "; stop e alvo no mesmo candle, conta o stop (pior caso)" : "";
  return `${s.motivo} tocado dentro do candle (${extremo}) a ${formatarNumero(s.preco)}${ambiguo}`;
}

interface Estado {
  aberta: PosicaoAcompanhada | null;
  expostas: number;
  readonly intrabar: { stop: number; alvo: number; ambiguos: number };
}

/** Antes do fechamento: com posição aberta, stop e alvo dentro do candle. */
async function vigiarDentroDoCandle(
  m: Montagem,
  e: EntradaBacktest,
  c: Candle,
  st: Estado,
  ctx: ContextoMercado,
) {
  const posicao = await posicaoAtual(m);
  if (posicao.quantidade.isZero() || !st.aberta) return;
  st.expostas++;
  const saida = saidaDentroDo(e, c, niveisEfetivos(posicao, st.aberta));
  if (!saida) return;
  const sinal: Sinal = { acao: "VENDER", motivo: saida.motivo, explicacao: explicar(saida, c) };
  if (!(await vender(m, e, { preco: saida.preco, em: saida.em, sinal }, posicao, ctx.fechamentos))) return;
  st.aberta = null;
  st.intrabar[saida.motivo]++;
  if (saida.ambiguo) st.intrabar.ambiguos++;
}

/** Depois do fechamento: começa a acompanhar uma compra nova ou atualiza a que segue aberta. */
async function aposFechamento(m: Montagem, e: EntradaBacktest, c: Candle, st: Estado, ctx: ContextoMercado) {
  const posicao = await posicaoAtual(m);
  if (posicao.quantidade.isZero()) {
    st.aberta = null;
    return;
  }
  if (!st.aberta) {
    st.aberta = iniciar(e.estrategia, await m.decisoes.ultimaCompraExecutada(ID), posicao);
    return;
  }
  if (!precisaAcompanhar(e.estrategia)) return;
  const r = aoFecharComPosicao(st.aberta, ctx, c.fecha, posicao);
  st.aberta = r.posicao;
  if (
    r.saida &&
    (await vender(m, e, { preco: c.fecha, em: c.fechamento, sinal: r.saida }, posicao, ctx.fechamentos))
  )
    st.aberta = null;
}

/**
 * Backtest com as MESMAS funções do robô ao vivo (NucleoRobo: decidir, agente,
 * risco, execução idempotente) sobre candles históricos, numa corretora de papel e
 * com um agente fixo. Stop e alvo são vigiados DENTRO do candle (mínima e máxima, ou o
 * caminho de 1 minuto), com o stop por ATR acertado na compra e o stop móvel, o empate
 * e a saída por tempo do domínio. Determinístico: mesma entrada, mesmo resultado; sem rede.
 */
export async function rodarBacktest(e: EntradaBacktest): Promise<ResultadoBacktest> {
  // O à vista de cripto só opera comprado: estratégia vendida (ou nos dois sentidos) não roda aqui.
  const problemas = [...validarEstrategia(e.estrategia), ...problemasNoMercado(e.estrategia, "cripto")];
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
  // O mesmo tamanho de histórico que o robô guarda: indicadores e ATR veem o que ele veria.
  const todos = contextoDeCandles(e.candles);
  const historico = m.deps.opcoes.tamanhoHistorico;
  const ate = (i: number) => contextoEntre(todos, Math.max(0, i + 1 - historico), i + 1);
  const curva: PontoCurva[] = [];
  const st: Estado = { aberta: null, expostas: 0, intrabar: { stop: 0, alvo: 0, ambiguos: 0 } };
  for (const [k, c] of janela.entries()) {
    await vigiarDentroDoCandle(m, e, c, st, ate(corte + k - 1));
    m.relogio.definir(c.fechamento);
    m.corretora.alimentar(e.simbolo, e.intervalo, c);
    await m.nucleo.aoFecharIntervalo(c);
    await aposFechamento(m, e, c, st, ate(corte + k));
    curva.push({ em: c.fechamento, patrimonio: await patrimonio(m.corretora, e.simbolo, c.fecha) });
  }
  if (m.erros.length > 0) throw new Error(`O backtest falhou: ${m.erros[0]}`);
  const execucoes = await m.ordens.execucoes(ID);
  return {
    ...resumir(e, curva, metricasDasExecucoes(execucoes, m.ordens.todas().length)),
    buyHold: curvaBuyHold(janela, e.saldoInicial, custosDe(e)),
    operacoesFechadas: operacoesFechadas(execucoes),
    deslizamentoPago: custoDeslizamento(execucoes, bpsContra(custosDe(e))),
    barrasExpostas: st.expostas,
    saidasIntrabar: st.intrabar,
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
