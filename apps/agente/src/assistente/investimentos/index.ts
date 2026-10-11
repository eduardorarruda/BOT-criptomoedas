import type { FerramentaLeitura } from "../../ferramentas/index.js";
import { carteiraCripto } from "./carteira.js";
import type { ContextoInvestimentos, LeituraInvestimentos } from "./comum.js";
import { investimentosImobiliarios } from "./imobiliario.js";
import { rendaFixa } from "./renda-fixa.js";

export type { ContextoInvestimentos, LeituraInvestimentos } from "./comum.js";

/**
 * Investimentos da pessoa, só de leitura: carteira cripto (Binance sincronizada), renda
 * fixa e imobiliário. Nenhuma ferramenta compra, vende, aplica ou resgata.
 */
export function ferramentasDeInvestimentos(
  ctx: ContextoInvestimentos,
  dados: LeituraInvestimentos,
): FerramentaLeitura[] {
  return [carteiraCripto(ctx, dados), rendaFixa(ctx, dados), investimentosImobiliarios(ctx, dados)];
}
