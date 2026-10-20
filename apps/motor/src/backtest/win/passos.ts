import type { ModoExecucaoBacktest } from "@zentrade/contratos";
import {
  atualizarStop,
  contratosPeloRisco,
  decidirComSentido,
  deveZerar,
  iniciarAcompanhamento,
  podeAbrirNaSessao,
  precoAlvo,
  stopDeEntrada,
  type Candle,
  type ContextoMercado,
  type Estrategia,
  type LimitesRisco,
  type Sentido,
  type Valor,
} from "@zentrade/dominio";
import { saidaNoCandle } from "../intrabar.js";
import type { SaidasIntrabar } from "../rodar.js";
import {
  custoDeUmLado,
  fecharPosicao,
  precoDeEntrada,
  type OperacaoWin,
  type PosicaoWin,
  type MotivoSaidaWin,
  type Saida,
} from "./execucao.js";
import type { ModeloWin } from "./modelo.js";

/**
 * Os passos de um candle do backtest do mini índice. O estado da simulação é mutável
 * (como o do backtest de cripto), mas só dentro de uma rodada: cada rodada começa do zero.
 */
export interface EstadoWin {
  caixa: Valor;
  aberta: PosicaoWin | null;
  dia: string;
  resultadoDoDia: Valor;
  /** Instantes das ordens (entradas e saídas) da última hora, para o limite de frequência. */
  ordens: number[];
  ultimaPerdaEm: number | null;
  readonly operacoes: OperacaoWin[];
  expostas: number;
  zeragens: number;
  semEspaco: number;
  barradas: number;
  /** Ordem decidida no fechamento do candle anterior, à espera da abertura deste (`proximaAbertura`). */
  pendente: OrdemPendente | null;
  readonly intrabar: { -readonly [K in keyof SaidasIntrabar]: number };
}

/**
 * O que a regra decidiu no fechamento e só executa na abertura do candle seguinte. A
 * entrada guarda o que a estratégia viu (sentido e distância de risco); o preço, o stop
 * e o tamanho saem do preço de abertura, que é o executado.
 */
export type OrdemPendente =
  | { readonly tipo: "entrar"; readonly sentido: Sentido; readonly distanciaRisco: Valor | undefined }
  | { readonly tipo: "sair"; readonly motivo: MotivoSaidaWin };

export interface Simulacao {
  readonly estrategia: Estrategia;
  readonly modelo: ModeloWin;
  readonly limites: LimitesRisco | null;
  /** Onde executa a ordem decidida no fechamento. Sem ele: no fechamento. */
  readonly execucao?: ModoExecucaoBacktest;
}

export interface MomentoCandle {
  readonly dia: string;
  readonly primeiroDoDia: boolean;
  readonly ultimoDoDia: boolean;
  /** Fim do candle: o instante da decisão. */
  readonly decisao: number;
}

const naAbertura = (s: Simulacao): boolean => s.execucao === "proximaAbertura";

const HORA_MS = 3_600_000;

function registrarSaida(st: EstadoWin, m: ModeloWin, s: Saida): void {
  if (!st.aberta) return;
  const { operacao, caixa } = fecharPosicao(m, st.aberta, s);
  st.caixa = st.caixa.plus(caixa);
  st.aberta = null;
  st.operacoes.push(operacao);
  st.resultadoDoDia = st.resultadoDoDia.plus(operacao.resultado);
  st.ordens.push(s.em);
  if (operacao.resultado.lt(0)) st.ultimaPerdaEm = s.em;
  if (s.motivo === "zeragem") st.zeragens++;
}

/** Antes do fechamento: stop e alvo dentro do candle, no pior caso, para o lado da posição. */
export function vigiarDentroDoCandle(st: EstadoWin, m: ModeloWin, c: Candle, t: MomentoCandle): void {
  const p = st.aberta;
  if (!p) return;
  st.expostas++;
  const saida = saidaNoCandle(c, { stop: p.acompanhamento.stop, alvo: p.alvo }, p.sentido);
  if (!saida) return;
  registrarSaida(st, m, { referencia: saida.preco, motivo: saida.motivo, em: c.fechamento, dia: t.dia });
  st.intrabar[saida.motivo]++;
  if (saida.ambiguo) st.intrabar.ambiguos++;
}

/**
 * No fechamento, com posição: anda o stop (móvel, empate), decide (stop, alvo, regra de
 * saída do lado, tempo) e zera na hora da zeragem ou no último candle do pregão.
 * `true` se fechou (aí não abre outra no mesmo fechamento).
 */
export function aoFecharComPosicao(
  st: EstadoWin,
  s: Simulacao,
  c: Candle,
  ctx: ContextoMercado,
  t: MomentoCandle,
): boolean {
  const p = st.aberta;
  if (!p) return false;
  const acompanhamento = atualizarStop(s.estrategia, p.acompanhamento, ctx).acompanhamento;
  const sinal = decidirComSentido(
    s.estrategia,
    { ...ctx, preco: c.fecha, acompanhamento },
    { sentido: p.sentido, precoMedio: p.entrada },
  );
  const zeragem = t.ultimoDoDia || deveZerar(t.decisao, s.modelo.sessao);
  if (sinal.acao === "ZERAR" || zeragem) {
    const motivo = sinal.acao === "ZERAR" ? sinal.motivo : "zeragem";
    // A zeragem do fim do pregão (ou da janela) não espera: nada dorme posicionado.
    if (naAbertura(s) && !zeragem) {
      st.aberta = { ...p, acompanhamento };
      st.pendente = { tipo: "sair", motivo };
    } else registrarSaida(st, s.modelo, { referencia: c.fecha, motivo, em: c.fechamento, dia: t.dia });
    return true;
  }
  st.aberta = { ...p, acompanhamento };
  return false;
}

/**
 * Executa, na ABERTURA do candle `c`, a ordem que a regra decidiu no fechamento do
 * anterior (`ctx` é o mercado daquele fechamento). Roda antes de qualquer outra coisa do
 * candle: a ordem chega primeiro, e o stop e o alvo do candle já valem para a posição nova.
 */
export function executarPendente(
  st: EstadoWin,
  s: Simulacao,
  c: Candle,
  ctx: ContextoMercado,
  t: MomentoCandle,
): void {
  const ordem = st.pendente;
  st.pendente = null;
  if (!ordem) return;
  if (ordem.tipo === "sair") {
    registrarSaida(st, s.modelo, { referencia: c.abre, motivo: ordem.motivo, em: c.abertura, dia: t.dia });
    return;
  }
  const posicao = montarPosicao(s, ordem.sentido, c.abre, c.abertura, ctx, ordem.distanciaRisco, st.caixa);
  if (!posicao) {
    st.semEspaco++;
    return;
  }
  st.caixa = st.caixa.minus(custoDeUmLado(s.modelo, posicao.contratos));
  st.aberta = posicao;
  st.ordens.push(c.abertura);
}

/** O que barra uma entrada, como no motor de risco do robô: perda do dia, frequência e pausa. */
export function barreira(st: EstadoWin, l: LimitesRisco | null, agora: number): string | null {
  if (!l) return null;
  st.ordens = st.ordens.filter((em) => agora - em < HORA_MS);
  if (st.resultadoDoDia.lte(l.perdaDiariaMaxima.neg())) return "perda_diaria";
  if (st.ordens.length >= l.ordensPorHoraMax) return "frequencia";
  if (st.ultimaPerdaEm !== null && agora - st.ultimaPerdaEm < l.pausaAposPerdaMs) return "pausa_apos_perda";
  return null;
}

/**
 * A posição que a entrada abriria a partir do preço de `referencia` (o fechamento do
 * candle da decisão ou a abertura do seguinte): preço executado (tick + deslizamento), stop da
 * estratégia a partir dele (percentual ou por ATR), contratos pelo risco em reais, pelo
 * máximo e pela margem. `null` quando nem 1 contrato cabe.
 */
export function montarPosicao(
  s: Simulacao,
  sentido: Sentido,
  referencia: Valor,
  em: number,
  ctx: ContextoMercado,
  distanciaRisco: Valor | undefined,
  capital: Valor,
): PosicaoWin | null {
  const m = s.modelo;
  const entrada = precoDeEntrada(m, sentido, referencia);
  const { stop } = stopDeEntrada(s.estrategia, entrada, ctx, sentido);
  const distancia = entrada.minus(stop).abs();
  const risco = distanciaRisco?.gt(distancia) ? distanciaRisco : distancia;
  if (!risco.gt(0)) return null;
  const { contratos } = contratosPeloRisco({
    riscoPorOperacao: m.riscoPorOperacao,
    distanciaPontos: risco,
    custos: m.custos,
    contratosMaximos: m.contratosMaximos,
    margemPorContrato: m.margemPorContrato,
    capital,
  });
  if (contratos === 0) return null;
  return {
    sentido,
    contratos,
    referencia,
    entrada,
    alvo: precoAlvo(entrada, s.estrategia.alvoLiquido, s.estrategia.taxa, sentido),
    acompanhamento: { ...iniciarAcompanhamento(s.estrategia, { precoMedio: entrada }, sentido), stop },
    em,
  };
}

/** Sem posição: abre se a sessão, a regra, os limites e o tamanho deixarem. */
export function tentarAbrir(st: EstadoWin, s: Simulacao, c: Candle, ctx: ContextoMercado, t: MomentoCandle) {
  if (st.aberta || t.ultimoDoDia || deveZerar(t.decisao, s.modelo.sessao)) return;
  if (!podeAbrirNaSessao(t.decisao, s.modelo.sessao, t.primeiroDoDia).pode) return;
  const sinal = decidirComSentido(s.estrategia, { ...ctx, preco: c.fecha }, null);
  if (sinal.acao !== "ABRIR") return;
  if (barreira(st, s.limites, c.fechamento)) {
    st.barradas++;
    return;
  }
  if (naAbertura(s)) {
    st.pendente = { tipo: "entrar", sentido: sinal.sentido, distanciaRisco: sinal.distanciaRisco };
    return;
  }
  const posicao = montarPosicao(s, sinal.sentido, c.fecha, c.fechamento, ctx, sinal.distanciaRisco, st.caixa);
  if (!posicao) {
    st.semEspaco++;
    return;
  }
  st.caixa = st.caixa.minus(custoDeUmLado(s.modelo, posicao.contratos));
  st.aberta = posicao;
  st.ordens.push(c.fechamento);
}
