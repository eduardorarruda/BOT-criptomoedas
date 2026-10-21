import type { ModoExecucaoBacktest } from "@zentrade/contratos";
import {
  contextoDeCandles,
  dec,
  diaB3,
  limiteInferior,
  problemasNoMercado,
  recorte,
  validarEstrategia,
  type Candle,
  type ContextoMercado,
  type Estrategia,
  type EventoMercado,
  type LimitesRisco,
  type ModoDiasDeEvento,
  type Valor,
} from "@zentrade/dominio";
import { contextoEntre } from "../acompanhamento.js";
import { maiorQueda, type PontoCurva } from "../metricas.js";
import type { SaidasIntrabar } from "../rodar.js";
import { valorAberto, type OperacaoWin } from "./execucao.js";
import type { ModeloWin } from "./modelo.js";
import {
  aoFecharComPosicao,
  executarPendente,
  tentarAbrir,
  vigiarDentroDoCandle,
  type EstadoWin,
  type MomentoCandle,
} from "./passos.js";
import { referenciaDaSessao, type ReferenciaSessao } from "./referencia.js";

export interface EntradaBacktestWin {
  readonly simbolo: string;
  /** Candles fechados em ordem, com o aquecimento antes de `inicio`. Só o horário de pregão. */
  readonly candles: readonly Candle[];
  readonly estrategia: Estrategia;
  readonly modelo: ModeloWin;
  /** `null`: sem os limites do robô (perda diária, ordens por hora, pausa após perda). */
  readonly limites: LimitesRisco | null;
  readonly saldoInicial: Valor;
  /** Janela operada: abertura em [inicio, fim). */
  readonly inicio?: number;
  readonly fim?: number;
  /**
   * Onde executa a ordem decidida no fechamento do candle. Sem ele (ou `fechamento`): no
   * fechamento, com tick e deslizamento. `proximaAbertura`: na abertura do candle seguinte
   * do mesmo pregão; a zeragem do fim do pregão e da janela continua no fechamento do
   * último candle, e uma entrada sinalizada no último candle não abre.
   */
  readonly execucao?: ModoExecucaoBacktest;
  /**
   * Filtro opcional de dia de evento (padrão: ignorar) com a agenda da pessoa: `bloquear`
   * não abre posição no dia (e janela) de um evento de alto impacto do WIN; `reduzir` abre
   * com metade do risco por operação. As velas NÃO são removidas (distorceria os indicadores).
   */
  readonly diasDeEvento?: ModoDiasDeEvento;
  readonly eventos?: readonly EventoMercado[];
}

export interface ResultadoBacktestWin {
  readonly curva: PontoCurva[];
  readonly operacoes: OperacaoWin[];
  /** Ficar comprado com 1 contrato da abertura ao fechamento de cada pregão. */
  readonly referencia: ReferenciaSessao;
  /** Candles da janela operada. */
  readonly candles: readonly Candle[];
  readonly resultadoLiquido: Valor;
  readonly patrimonioFinal: Valor;
  readonly maiorQueda: Valor;
  readonly maiorQuedaPercentual: number;
  readonly barrasExpostas: number;
  readonly saidasIntrabar: SaidasIntrabar;
  readonly zeragens: number;
  readonly semEspacoNoRisco: number;
  readonly barradasPelosLimites: number;
  /** Sinais de entrada barrados pelo filtro de dia de evento. */
  readonly entradasBarradasPorEvento: number;
  /** Entradas abertas com metade do risco pelo filtro de dia de evento. */
  readonly entradasReduzidasPorEvento: number;
  /** Pregões na janela. */
  readonly dias: number;
}

/** O mesmo tamanho de histórico do robô ao vivo: os indicadores veem o que ele veria. */
export const HISTORICO_WIN = 500;

/** Onde o candle está no pregão. O último do dia (ou da janela) zera a posição que sobrar. */
function momentoDo(candles: readonly Candle[], i: number, ultimoDaJanela: boolean): MomentoCandle {
  const c = candles[i] as Candle;
  const dia = diaB3(c.abertura);
  const anterior = candles[i - 1];
  const proximo = candles[i + 1];
  return {
    dia,
    primeiroDoDia: !anterior || diaB3(anterior.abertura) !== dia,
    ultimoDoDia: ultimoDaJanela || !proximo || diaB3(proximo.abertura) !== dia,
    decisao: c.fechamento + 1,
  };
}

/**
 * A `taxa` da estratégia é a taxa percentual da corretora de cripto. No WIN o custo é
 * outro (tarifa e corretagem por contrato, ticks de deslizamento) e entra pelo modelo
 * do contrato; deixar a taxa no alvo líquido e no empate empurraria os dois centenas de
 * pontos para longe por um custo que não existe.
 */
function semTaxaPercentual(e: EntradaBacktestWin): EntradaBacktestWin {
  return e.estrategia.taxa === 0 ? e : { ...e, estrategia: { ...e.estrategia, taxa: 0 } };
}

function validar(e: EntradaBacktestWin): void {
  const problemas = [...validarEstrategia(e.estrategia), ...problemasNoMercado(e.estrategia, "win")];
  if (problemas.length > 0)
    throw new RangeError(`Estratégia inválida para o backtest: ${problemas.join("; ")}.`);
}

function estadoInicial(saldo: Valor): EstadoWin {
  return {
    caixa: saldo,
    aberta: null,
    dia: "",
    resultadoDoDia: dec(0),
    ordens: [],
    ultimaPerdaEm: null,
    operacoes: [],
    expostas: 0,
    zeragens: 0,
    semEspaco: 0,
    barradas: 0,
    barradasPorEvento: 0,
    reduzidasPorEvento: 0,
    pendente: null,
    intrabar: { stop: 0, alvo: 0, ambiguos: 0 },
  };
}

/**
 * Backtest do mini índice: a cada candle da janela, na ordem,
 *   1. com posição aberta, stop e alvo DENTRO do candle (pior caso: no comprado o stop
 *      é tocado pela mínima, no vendido pela máxima; os dois no mesmo candle, conta o stop);
 *   2. no fechamento, com posição: stop móvel/empate, `decidirComSentido` (stop, alvo,
 *      regra de saída do lado, tempo) e a ZERAGEM (hora da zeragem, último candle do
 *      pregão ou da janela) — nada dorme posicionado;
 *   3. sem posição, se a sessão deixa (início, corte, leilão de abertura) e os limites
 *      deixam: abre no sentido que a regra pediu, no fechamento com tick e deslizamento,
 *      com contratos pelo risco em reais, pelo máximo e pela margem.
 * Com `execucao: "proximaAbertura"`, a entrada e a saída por regra decididas no
 * fechamento do candle i são executadas na ABERTURA do candle i+1, antes de tudo o mais
 * nele (com o mesmo tick e deslizamento); stop e alvo seguem dentro do candle, e a
 * zeragem do fim do pregão continua no fechamento do último candle.
 * Determinístico e sem rede. Custos: tarifa da B3 e corretagem por contrato e por lado.
 */
export function rodarBacktestWin(entrada: EntradaBacktestWin): ResultadoBacktestWin {
  const e = semTaxaPercentual(entrada);
  validar(e);
  const inicio = e.inicio ?? Number.NEGATIVE_INFINITY;
  const janela = recorte(e.candles, inicio, e.fim ?? Number.POSITIVE_INFINITY, (c) => c.abertura);
  if (janela.length === 0)
    throw new RangeError(
      "A janela do backtest não tem nenhum candle: confira início, fim e se há candles do mini índice gravados.",
    );
  const corte = limiteInferior(e.candles, inicio, (c) => c.abertura);
  const todos = contextoDeCandles(e.candles);
  const ate = (i: number): ContextoMercado => contextoEntre(todos, Math.max(0, i + 1 - HISTORICO_WIN), i + 1);
  const st = estadoInicial(e.saldoInicial);
  const curva: PontoCurva[] = [];
  for (const [k, c] of janela.entries()) {
    const i = corte + k;
    const t = momentoDo(e.candles, i, k === janela.length - 1);
    if (t.dia !== st.dia) {
      st.dia = t.dia;
      st.resultadoDoDia = dec(0);
    }
    if (st.pendente) executarPendente(st, e, c, ate(i - 1), t);
    vigiarDentroDoCandle(st, e.modelo, c, t);
    const ctx = ate(i);
    if (!aoFecharComPosicao(st, e, c, ctx, t)) tentarAbrir(st, e, c, ctx, t);
    const aberto = st.aberta ? valorAberto(st.aberta, c.fecha) : dec(0);
    curva.push({ em: c.fechamento, patrimonio: st.caixa.plus(aberto) });
  }
  const patrimonioFinal = curva.at(-1)?.patrimonio ?? e.saldoInicial;
  const queda = maiorQueda(curva);
  return {
    curva,
    operacoes: st.operacoes,
    referencia: referenciaDaSessao(janela, e.saldoInicial, e.modelo),
    candles: janela,
    resultadoLiquido: patrimonioFinal.minus(e.saldoInicial),
    patrimonioFinal,
    maiorQueda: queda.valor,
    maiorQuedaPercentual: queda.percentual,
    barrasExpostas: st.expostas,
    saidasIntrabar: st.intrabar,
    zeragens: st.zeragens,
    semEspacoNoRisco: st.semEspaco,
    barradasPelosLimites: st.barradas,
    entradasBarradasPorEvento: st.barradasPorEvento,
    entradasReduzidasPorEvento: st.reduzidasPorEvento,
    dias: new Set(janela.map((c) => diaB3(c.abertura))).size,
  };
}
