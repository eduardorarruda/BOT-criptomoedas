import {
  precoAlvo,
  precoStop,
  saidaNoCandle,
  type Candle,
  type Estrategia,
  type NiveisSaida,
  type SaidaIntrabar,
  type Sentido,
  type Valor,
} from "@zentrade/dominio";

/**
 * Stop e alvo DENTRO do candle: as regras moram no domínio (`saidaNoCandle`, as mesmas
 * do placar do Claude). Aqui ficam os níveis da posição e o caminho de 1 minuto.
 * Depois do merge das ordens de stop/OCO na corretora de papel, estas regras podem
 * virar ordens em repouso na própria corretora (veja docs/estrategias.md).
 */
export { saidaNoCandle, type NiveisSaida, type SaidaIntrabar } from "@zentrade/dominio";

export function niveisDaPosicao(
  precoMedio: Valor,
  e: Pick<Estrategia, "stop" | "alvoLiquido" | "taxa">,
): NiveisSaida {
  return { stop: precoStop(precoMedio, e.stop), alvo: precoAlvo(precoMedio, e.alvoLiquido, e.taxa) };
}

/** Com candles de 1 minuto: o primeiro minuto que toca um nível decide (e diz quando). */
export function saidaNoCaminho(
  minutos: readonly Candle[],
  n: NiveisSaida,
  sentido: Sentido = "comprado",
): (SaidaIntrabar & { readonly em: number }) | null {
  for (const m of minutos) {
    const saida = saidaNoCandle(m, n, sentido);
    if (saida) return { ...saida, em: m.fechamento };
  }
  return null;
}
