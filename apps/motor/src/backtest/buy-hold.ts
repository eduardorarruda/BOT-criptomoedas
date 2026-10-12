import type { CustosBacktest } from "@zentrade/contratos";
import { dec, type Candle, type Valor } from "@zentrade/dominio";
import { bpsContra } from "./custos.js";
import type { PontoCurva } from "./metricas.js";

export interface ResultadoBuyHold {
  /** Patrimônio a preço de fechamento (marcado a mercado, como a curva da estratégia). */
  readonly curva: PontoCurva[];
  /** O que sobraria vendendo tudo no último fechamento, com taxa e deslizamento. */
  readonly final: Valor;
}

/**
 * Referência honesta: comprar tudo na abertura do primeiro candle da janela e segurar,
 * pagando os MESMOS custos da estratégia na compra e na venda final.
 * Quantidade = saldo ÷ (abertura × (1 + f) × (1 + taxa)), f = deslizamento + meio spread.
 */
export function curvaBuyHold(
  candles: readonly Candle[],
  saldo: Valor,
  custos: CustosBacktest,
): ResultadoBuyHold {
  const primeiro = candles[0];
  const ultimo = candles.at(-1);
  if (!primeiro || !ultimo) return { curva: [], final: saldo };
  const f = dec(bpsContra(custos)).div(10_000);
  const taxa = dec(custos.taxaPorLado);
  const quantidade = saldo.div(primeiro.abre.times(dec(1).plus(f)).times(dec(1).plus(taxa)));
  return {
    curva: candles.map((c) => ({ em: c.fechamento, patrimonio: quantidade.times(c.fecha) })),
    final: quantidade.times(ultimo.fecha).times(dec(1).minus(f)).times(dec(1).minus(taxa)),
  };
}
