import type { Valor } from "./dinheiro.js";
import { aFavor, contra, type Sentido } from "./sentido.js";
import type { Candle } from "./tipos.js";

/**
 * Stop e alvo DENTRO do candle. O robô ao vivo vigia a cada minuto; o backtest e o
 * placar do Claude só têm o candle do intervalo (abertura, máxima, mínima,
 * fechamento). Regras, para posição comprada:
 *   1. abriu abaixo do stop (salto): sai na abertura, que é pior que o stop;
 *   2. abriu acima do alvo: sai na abertura;
 *   3. a mínima tocou o stop: sai no stop — MESMO se a máxima também tocou o alvo.
 *      Sem dado mais fino não dá para saber qual veio primeiro; assume-se o pior caso;
 *   4. a máxima tocou o alvo: sai no alvo.
 *
 * Para posição VENDIDA (mini índice), o espelho: o stop está acima e é tocado pela
 * MÁXIMA; o alvo está abaixo e é tocado pela mínima; o salto de abertura acima do
 * stop sai na abertura; stop e alvo no mesmo candle contam o stop.
 */
export interface NiveisSaida {
  readonly stop: Valor;
  readonly alvo: Valor;
}

export interface SaidaIntrabar {
  readonly preco: Valor;
  readonly motivo: "stop" | "alvo";
  /** Stop e alvo couberam no mesmo candle: contou o stop (pior caso). */
  readonly ambiguo: boolean;
}

export function saidaNoCandle(
  c: Candle,
  n: NiveisSaida,
  sentido: Sentido = "comprado",
): SaidaIntrabar | null {
  if (contra(c.abre, n.stop, sentido)) return { preco: c.abre, motivo: "stop", ambiguo: false };
  if (aFavor(c.abre, n.alvo, sentido)) return { preco: c.abre, motivo: "alvo", ambiguo: false };
  const comprado = sentido === "comprado";
  const tocouStop = contra(comprado ? c.minima : c.maxima, n.stop, sentido);
  const tocouAlvo = aFavor(comprado ? c.maxima : c.minima, n.alvo, sentido);
  if (tocouStop) return { preco: n.stop, motivo: "stop", ambiguo: tocouAlvo };
  if (tocouAlvo) return { preco: n.alvo, motivo: "alvo", ambiguo: false };
  return null;
}
