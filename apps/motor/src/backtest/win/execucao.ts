import {
  custoFixoPorLado,
  precoExecutado,
  reaisDosPontos,
  type Acompanhamento,
  type MotivoVenda,
  type Sentido,
  type Valor,
} from "@zentrade/dominio";
import type { OperacaoFechada } from "../../historico.js";
import { resultadoEmReais, type ModeloWin } from "./modelo.js";

/**
 * Entrada e saída de uma posição do mini índice: preço executado no tick contra quem
 * opera, mais o deslizamento em ticks; tarifa da B3 e corretagem por contrato em cada
 * lado. Puro: cada passo devolve objetos novos.
 */
export type MotivoSaidaWin = MotivoVenda | "zeragem";

export interface PosicaoWin {
  readonly sentido: Sentido;
  readonly contratos: number;
  /** O preço de referência da ordem (o fechamento do candle da decisão ou, na `proximaAbertura`, a abertura do seguinte). */
  readonly referencia: Valor;
  /** O preço executado, com tick e deslizamento. */
  readonly entrada: Valor;
  readonly alvo: Valor;
  readonly acompanhamento: Acompanhamento;
  readonly em: number;
}

export interface OperacaoWin extends OperacaoFechada {
  readonly sentido: Sentido;
  readonly contratos: number;
  readonly referenciaEntrada: Valor;
  readonly entrada: Valor;
  readonly referenciaSaida: Valor;
  readonly saida: Valor;
  readonly motivo: MotivoSaidaWin;
  /** Em reais, antes de tarifa, corretagem e deslizamento. */
  readonly bruto: Valor;
  /** Tarifa da B3 e corretagem dos dois lados, em reais. */
  readonly tarifas: Valor;
  readonly corretagem: Valor;
  /** Deslizamento dos dois lados (com o arredondamento ao tick), em reais. */
  readonly deslizamento: Valor;
  /** Dia do pregão (Brasília) em que a operação fechou. */
  readonly dia: string;
}

/** O lado da ordem que abre (ou fecha) a posição. */
export const ladoDeAbrir = (s: Sentido) => (s === "comprado" ? "COMPRA" : "VENDA");
export const ladoDeFechar = (s: Sentido) => (s === "comprado" ? "VENDA" : "COMPRA");

/** Onde a ordem que abre no sentido executa, a partir do preço de referência. */
export const precoDeEntrada = (m: ModeloWin, s: Sentido, referencia: Valor): Valor =>
  precoExecutado(referencia, ladoDeAbrir(s), m.custos.deslizamentoTicks);

/** Tarifa e corretagem de um lado (entrada ou saída) da posição inteira. */
export const custoDeUmLado = (m: ModeloWin, contratos: number): Valor =>
  custoFixoPorLado(m.custos).times(contratos);

/** Patrimônio da posição a preço de `preco` (sem os custos da saída, como o à vista). */
export const valorAberto = (p: PosicaoWin, preco: Valor): Valor =>
  resultadoEmReais(p.sentido, p.entrada, preco, p.contratos);

export interface Saida {
  readonly referencia: Valor;
  readonly motivo: MotivoSaidaWin;
  readonly em: number;
  readonly dia: string;
}

/**
 * Fecha a posição: executa na referência (o stop, o alvo, a abertura do salto ou o
 * fechamento), no tick e com deslizamento contra. `caixa` = o que entra no caixa agora
 * (o resultado da saída menos o custo deste lado; o da entrada já saiu na abertura).
 */
export function fecharPosicao(
  m: ModeloWin,
  p: PosicaoWin,
  s: Saida,
): { readonly operacao: OperacaoWin; readonly caixa: Valor } {
  const saida = precoExecutado(s.referencia, ladoDeFechar(p.sentido), m.custos.deslizamentoTicks);
  const realizado = resultadoEmReais(p.sentido, p.entrada, saida, p.contratos);
  const umLado = custoDeUmLado(m, p.contratos);
  const pontosDeslizados = p.entrada.minus(p.referencia).abs().plus(saida.minus(s.referencia).abs());
  const operacao: OperacaoWin = {
    abertaEm: p.em,
    fechadaEm: s.em,
    resultado: realizado.minus(umLado.times(2)),
    sentido: p.sentido,
    contratos: p.contratos,
    referenciaEntrada: p.referencia,
    entrada: p.entrada,
    referenciaSaida: s.referencia,
    saida,
    motivo: s.motivo,
    bruto: resultadoEmReais(p.sentido, p.referencia, s.referencia, p.contratos),
    tarifas: m.custos.tarifaB3.times(p.contratos * 2),
    corretagem: m.custos.corretagem.times(p.contratos * 2),
    deslizamento: reaisDosPontos(pontosDeslizados, p.contratos),
    dia: s.dia,
  };
  return { operacao, caixa: realizado.minus(umLado) };
}
