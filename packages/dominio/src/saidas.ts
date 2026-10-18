import { contextoAte, hlcDe, serieDe, type ContextoMercado } from "./contexto.js";
import { dec, type Valor } from "./dinheiro.js";
import type { Estrategia } from "./estrategia.js";
import { formatarNumero } from "./formatar.js";
import type { Posicao } from "./posicao.js";
import { precoEmpate, precoStop } from "./precos.js";
import { aFavor, melhorPara, type Sentido } from "./sentido.js";
import { atr } from "./volatilidade.js";

/**
 * Saídas além do stop fixo e do alvo: stop inicial por ATR, stop móvel (por % ou
 * por k × ATR), empate (break-even) e o tamanho da posição pela volatilidade.
 *
 * Tudo aqui é puro. O estado que muda com a posição aberta — stop efetivo, maior
 * máxima desde a entrada e candles passados — vive em `Acompanhamento`, que o
 * motor guarda entre um candle e outro e passa a `decidir` no contexto. A cada
 * candle FECHADO do intervalo do robô:
 *
 *   1. `atualizarStop(estrategia, acompanhamento, contexto)` → novo acompanhamento
 *      e, se o stop subiu, `novoStop` (para trocar a ordem de stop na corretora);
 *   2. `decidir(estrategia, { ...contexto, preco, acompanhamento }, posicao)`.
 *
 * O stop efetivo só sobe: é o maior entre o stop atual e os candidatos (stop móvel
 * e empate). Nunca passa da maior máxima desde a entrada.
 *
 * Na posição vendida (mini índice), tudo é o espelho: o stop fica acima da entrada e
 * só desce, a marca d'água é a MENOR mínima desde a entrada e o empate vale depois de
 * uma queda do tamanho do gatilho.
 */
export interface StopAtr {
  readonly periodo: number;
  readonly multiplo: number;
}

export type StopMovel =
  | { readonly tipo: "percentual"; readonly distancia: number }
  | { readonly tipo: "atr"; readonly periodo: number; readonly multiplo: number };

export interface Empate {
  /** Alta, em fração da entrada, que leva o stop para o preço de empate (0,03 = +3%). */
  readonly gatilho: number;
}

export interface TamanhoPorVolatilidade {
  readonly periodo: number;
  readonly multiplo: number;
}

/** Estado da posição aberta que o motor guarda entre candles. Imutável: cada passo devolve outro. */
export interface Acompanhamento {
  /** Preço médio de entrada. */
  readonly entrada: Valor;
  /** Stop efetivo agora. */
  readonly stop: Valor;
  /**
   * A marca d'água do stop móvel: a maior máxima desde a entrada no comprado; no
   * vendido, a MENOR mínima.
   */
  readonly maxima: Valor;
  /** Candles do intervalo fechados desde a entrada (para a saída por tempo). */
  readonly candles: number;
  /** Sem ele, comprado (o único lado do à vista de cripto). */
  readonly sentido?: Sentido;
}

export interface AtualizacaoStop {
  readonly acompanhamento: Acompanhamento;
  /** O stop novo, só quando ele andou a favor; `null` = a ordem de stop na corretora fica como está. */
  readonly novoStop: Valor | null;
  readonly explicacao: string | null;
}

const pct = (fracao: number): string => `${formatarNumero(fracao * 100)}%`;

/** ATR(n) do último candle como decimal, ou `null` se faltar dado ou ele for zero. */
function atrDe(ctx: ContextoMercado, periodo: number): Valor | null {
  const v = hlcDe(ctx);
  const valor = v && atr(v, periodo);
  return valor !== null && valor > 0 ? dec(valor) : null;
}

/**
 * Stop da entrada. Sem `stopAtr`, é o percentual de sempre. Com ele, é
 * entrada − k × ATR(n) do candle da entrada (entrada + k × ATR no vendido), mas nunca
 * mais longe que o stop percentual, que vira o teto da distância (e o plano B se
 * faltar ATR).
 */
export function stopDeEntrada(
  e: Estrategia,
  preco: Valor,
  ctx: ContextoMercado,
  sentido: Sentido = "comprado",
): { readonly stop: Valor; readonly explicacao: string | null } {
  const fixo = precoStop(preco, e.stop, sentido);
  if (!e.stopAtr) return { stop: fixo, explicacao: null };
  const { periodo, multiplo } = e.stopAtr;
  const valor = atrDe(ctx, periodo);
  if (!valor)
    return {
      stop: fixo,
      explicacao: `sem dados para ATR(${periodo}): stop fixo de ${pct(e.stop)} (${formatarNumero(fixo)})`,
    };
  const comprado = sentido === "comprado";
  const porAtr = comprado ? preco.minus(valor.times(multiplo)) : preco.plus(valor.times(multiplo));
  if (!aFavor(porAtr, fixo, sentido))
    return {
      stop: fixo,
      explicacao: `stop em ${formatarNumero(fixo)} (${formatarNumero(multiplo)} × ATR(${periodo}) passaria do stop máximo de ${pct(e.stop)})`,
    };
  return {
    stop: porAtr,
    explicacao: `stop em ${formatarNumero(porAtr)} (preço ${comprado ? "−" : "+"} ${formatarNumero(multiplo)} × ATR(${periodo}) de ${formatarNumero(valor)})`,
  };
}

/**
 * Distância usada para medir o risco da compra quando o tamanho é pela
 * volatilidade: k × ATR(n). O dimensionamento usa a maior entre ela e a distância
 * até o stop, então o risco por operação vale nos dois casos.
 */
export function distanciaDeRisco(e: Estrategia, ctx: ContextoMercado): Valor | null {
  if (!e.tamanhoPorVolatilidade) return null;
  const valor = atrDe(ctx, e.tamanhoPorVolatilidade.periodo);
  return valor && valor.times(e.tamanhoPorVolatilidade.multiplo);
}

/** Acompanhamento de uma posição que acabou de abrir: o stop da estratégia (já ajustado pela entrada). */
export function iniciarAcompanhamento(
  e: Estrategia,
  posicao: Pick<Posicao, "precoMedio">,
  sentido: Sentido = "comprado",
): Acompanhamento {
  const entrada = posicao.precoMedio;
  return {
    entrada,
    stop: precoStop(entrada, e.stop, sentido),
    maxima: entrada,
    candles: 0,
    ...(sentido === "vendido" ? { sentido } : {}),
  };
}

interface Candidato {
  readonly stop: Valor;
  readonly motivo: string;
}

function candidatos(
  e: Estrategia,
  a: Acompanhamento,
  extremo: Valor,
  ctx: ContextoMercado,
  sentido: Sentido,
): Candidato[] {
  const comprado = sentido === "comprado";
  const lista: Candidato[] = [];
  const gatilho = e.empate && a.entrada.times(comprado ? 1 + e.empate.gatilho : 1 - e.empate.gatilho);
  if (e.empate && gatilho && aFavor(extremo, gatilho, sentido))
    lista.push({
      stop: precoEmpate(a.entrada, e.taxa, sentido),
      motivo: `o preço ${comprado ? "subiu" : "caiu"} ${pct(e.empate.gatilho)} e o stop foi para o empate`,
    });
  const nome = comprado ? "máxima" : "mínima";
  const movel = e.stopMovel;
  if (movel?.tipo === "percentual")
    lista.push({
      stop: extremo.times(comprado ? dec(1).minus(movel.distancia) : dec(1).plus(movel.distancia)),
      motivo: `stop móvel: ${pct(movel.distancia)} ${comprado ? "abaixo" : "acima"} da ${nome} ${formatarNumero(extremo)}`,
    });
  if (movel?.tipo === "atr") {
    const valor = atrDe(ctx, movel.periodo);
    if (valor) {
      const distancia = valor.times(movel.multiplo);
      lista.push({
        stop: comprado ? extremo.minus(distancia) : extremo.plus(distancia),
        motivo: `stop móvel: ${nome} ${formatarNumero(extremo)} ${comprado ? "−" : "+"} ${formatarNumero(movel.multiplo)} × ATR(${movel.periodo}) de ${formatarNumero(valor)}`,
      });
    }
  }
  return lista;
}

/**
 * Um candle do intervalo fechou com a posição aberta: guarda a nova marca d'água,
 * conta o candle e anda o stop a favor se o stop móvel ou o empate pedirem. Nunca
 * volta. O último candle do contexto é o que acabou de fechar.
 */
export function atualizarStop(e: Estrategia, a: Acompanhamento, ctx: ContextoMercado): AtualizacaoStop {
  const ultimo = ctx.fechamentos.length - 1;
  if (ultimo < 0) return { acompanhamento: a, novoStop: null, explicacao: null };
  const sentido = a.sentido ?? "comprado";
  const comprado = sentido === "comprado";
  const serie = serieDe(ctx, comprado ? "maximas" : "minimas");
  const ponta = serie?.[ultimo] ?? (ctx.fechamentos[ultimo] as number);
  const extremo = melhorPara(a.maxima, dec(ponta), sentido);
  const melhor = candidatos(e, a, extremo, ctx, sentido).reduce<Candidato | null>(
    (m, c) => (m === null || !aFavor(m.stop, c.stop, sentido) ? c : m),
    null,
  );
  const andou = melhor !== null && !aFavor(a.stop, melhor.stop, sentido);
  const stop = andou ? melhor.stop : a.stop;
  return {
    acompanhamento: { ...a, stop, maxima: extremo, candles: a.candles + 1 },
    novoStop: andou ? stop : null,
    explicacao: andou
      ? `stop ${comprado ? "subiu" : "desceu"} de ${formatarNumero(a.stop)} para ${formatarNumero(stop)} (${melhor.motivo})`
      : null,
  };
}

/**
 * Refaz o acompanhamento depois de um reinício: repassa `atualizarStop` pelos
 * últimos `candlesDesdeEntrada` candles do contexto, cada um só com o que se sabia
 * naquele momento. `inicial` é o acompanhamento do momento da compra.
 */
export function reconstruirAcompanhamento(
  e: Estrategia,
  inicial: Acompanhamento,
  ctx: ContextoMercado,
  candlesDesdeEntrada: number,
): Acompanhamento {
  const total = ctx.fechamentos.length;
  if (!Number.isInteger(candlesDesdeEntrada) || candlesDesdeEntrada < 0 || candlesDesdeEntrada > total)
    throw new RangeError(`não há ${candlesDesdeEntrada} candles no contexto (há ${total})`);
  let a = inicial;
  for (let fim = total - candlesDesdeEntrada; fim < total; fim++)
    a = atualizarStop(e, a, contextoAte(ctx, fim)).acompanhamento;
  return a;
}
