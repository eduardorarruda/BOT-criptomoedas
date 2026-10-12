import { precoAlvo, precoStop, type Candle, type Estrategia, type Valor } from "@zentrade/dominio";

/**
 * Stop e alvo DENTRO do candle. O robô ao vivo vigia a cada minuto; no backtest só há
 * o candle do intervalo (abertura, máxima, mínima, fechamento) e, opcionalmente, os de
 * 1 minuto. Regras, para posição comprada:
 *   1. abriu abaixo do stop (salto): sai na abertura, que é pior que o stop;
 *   2. abriu acima do alvo: sai na abertura;
 *   3. a mínima tocou o stop: sai no stop — MESMO se a máxima também tocou o alvo.
 *      Sem dado mais fino não dá para saber qual veio primeiro; assume-se o pior caso;
 *   4. a máxima tocou o alvo: sai no alvo.
 * Depois do merge das ordens de stop/OCO na corretora de papel, estas regras podem
 * virar ordens em repouso na própria corretora (veja docs/estrategias.md).
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

export function niveisDaPosicao(
  precoMedio: Valor,
  e: Pick<Estrategia, "stop" | "alvoLiquido" | "taxa">,
): NiveisSaida {
  return { stop: precoStop(precoMedio, e.stop), alvo: precoAlvo(precoMedio, e.alvoLiquido, e.taxa) };
}

export function saidaNoCandle(c: Candle, n: NiveisSaida): SaidaIntrabar | null {
  if (c.abre.lte(n.stop)) return { preco: c.abre, motivo: "stop", ambiguo: false };
  if (c.abre.gte(n.alvo)) return { preco: c.abre, motivo: "alvo", ambiguo: false };
  const tocouStop = c.minima.lte(n.stop);
  const tocouAlvo = c.maxima.gte(n.alvo);
  if (tocouStop) return { preco: n.stop, motivo: "stop", ambiguo: tocouAlvo };
  if (tocouAlvo) return { preco: n.alvo, motivo: "alvo", ambiguo: false };
  return null;
}

/** Com candles de 1 minuto: o primeiro minuto que toca um nível decide (e diz quando). */
export function saidaNoCaminho(
  minutos: readonly Candle[],
  n: NiveisSaida,
): (SaidaIntrabar & { readonly em: number }) | null {
  for (const m of minutos) {
    const saida = saidaNoCandle(m, n);
    if (saida) return { ...saida, em: m.fechamento };
  }
  return null;
}
