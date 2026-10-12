import { contextoAte, hlcDe, serieDe, type ContextoMercado } from "./contexto.js";
import { dec, type Valor } from "./dinheiro.js";
import type { Estrategia } from "./estrategia.js";
import { formatarNumero } from "./formatar.js";
import type { Posicao } from "./posicao.js";
import { precoEmpate, precoStop } from "./precos.js";
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
  /** Maior máxima desde a entrada (a marca d'água do stop móvel). */
  readonly maxima: Valor;
  /** Candles do intervalo fechados desde a entrada (para a saída por tempo). */
  readonly candles: number;
}

export interface AtualizacaoStop {
  readonly acompanhamento: Acompanhamento;
  /** O stop novo, só quando ele subiu; `null` = a ordem de stop na corretora fica como está. */
  readonly novoStop: Valor | null;
  readonly explicacao: string | null;
}

const pct = (fracao: number): string => `${formatarNumero(fracao * 100)}%`;
const maior = (a: Valor, b: Valor): Valor => (a.gte(b) ? a : b);

/** ATR(n) do último candle como decimal, ou `null` se faltar dado ou ele for zero. */
function atrDe(ctx: ContextoMercado, periodo: number): Valor | null {
  const v = hlcDe(ctx);
  const valor = v && atr(v, periodo);
  return valor !== null && valor > 0 ? dec(valor) : null;
}

/**
 * Stop da compra. Sem `stopAtr`, é o percentual de sempre. Com ele, é
 * entrada − k × ATR(n) do candle da entrada, mas nunca mais longe que o stop
 * percentual, que vira o teto da distância (e o plano B se faltar ATR).
 */
export function stopDeEntrada(
  e: Estrategia,
  preco: Valor,
  ctx: ContextoMercado,
): { readonly stop: Valor; readonly explicacao: string | null } {
  const fixo = precoStop(preco, e.stop);
  if (!e.stopAtr) return { stop: fixo, explicacao: null };
  const { periodo, multiplo } = e.stopAtr;
  const valor = atrDe(ctx, periodo);
  if (!valor)
    return {
      stop: fixo,
      explicacao: `sem dados para ATR(${periodo}): stop fixo de ${pct(e.stop)} (${formatarNumero(fixo)})`,
    };
  const porAtr = preco.minus(valor.times(multiplo));
  if (porAtr.lt(fixo))
    return {
      stop: fixo,
      explicacao: `stop em ${formatarNumero(fixo)} (${formatarNumero(multiplo)} × ATR(${periodo}) passaria do stop máximo de ${pct(e.stop)})`,
    };
  return {
    stop: porAtr,
    explicacao: `stop em ${formatarNumero(porAtr)} (preço − ${formatarNumero(multiplo)} × ATR(${periodo}) de ${formatarNumero(valor)})`,
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

/** Acompanhamento de uma posição que acabou de abrir: o stop da estratégia (já ajustado pela compra). */
export function iniciarAcompanhamento(e: Estrategia, posicao: Posicao): Acompanhamento {
  const entrada = posicao.precoMedio;
  return { entrada, stop: precoStop(entrada, e.stop), maxima: entrada, candles: 0 };
}

interface Candidato {
  readonly stop: Valor;
  readonly motivo: string;
}

function candidatos(e: Estrategia, a: Acompanhamento, maxima: Valor, ctx: ContextoMercado): Candidato[] {
  const lista: Candidato[] = [];
  if (e.empate && maxima.gte(a.entrada.times(1 + e.empate.gatilho)))
    lista.push({
      stop: precoEmpate(a.entrada, e.taxa),
      motivo: `o preço subiu ${pct(e.empate.gatilho)} e o stop foi para o empate`,
    });
  const movel = e.stopMovel;
  if (movel?.tipo === "percentual")
    lista.push({
      stop: maxima.times(dec(1).minus(movel.distancia)),
      motivo: `stop móvel: ${pct(movel.distancia)} abaixo da máxima ${formatarNumero(maxima)}`,
    });
  if (movel?.tipo === "atr") {
    const valor = atrDe(ctx, movel.periodo);
    if (valor)
      lista.push({
        stop: maxima.minus(valor.times(movel.multiplo)),
        motivo: `stop móvel: máxima ${formatarNumero(maxima)} − ${formatarNumero(movel.multiplo)} × ATR(${movel.periodo}) de ${formatarNumero(valor)}`,
      });
  }
  return lista;
}

/**
 * Um candle do intervalo fechou com a posição aberta: guarda a nova máxima, conta
 * o candle e sobe o stop se o stop móvel ou o empate pedirem. Nunca desce.
 * O último candle do contexto é o que acabou de fechar.
 */
export function atualizarStop(e: Estrategia, a: Acompanhamento, ctx: ContextoMercado): AtualizacaoStop {
  const ultimo = ctx.fechamentos.length - 1;
  if (ultimo < 0) return { acompanhamento: a, novoStop: null, explicacao: null };
  const topo = serieDe(ctx, "maximas")?.[ultimo] ?? (ctx.fechamentos[ultimo] as number);
  const maxima = maior(a.maxima, dec(topo));
  const melhor = candidatos(e, a, maxima, ctx).reduce<Candidato | null>(
    (m, c) => (m === null || c.stop.gt(m.stop) ? c : m),
    null,
  );
  const subiu = melhor !== null && melhor.stop.gt(a.stop);
  const stop = subiu ? melhor.stop : a.stop;
  return {
    acompanhamento: { entrada: a.entrada, stop, maxima, candles: a.candles + 1 },
    novoStop: subiu ? stop : null,
    explicacao: subiu
      ? `stop subiu de ${formatarNumero(a.stop)} para ${formatarNumero(stop)} (${melhor.motivo})`
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
