import { dec, type Valor } from "./dinheiro.js";

/**
 * Preços derivados da entrada. Ficam fora de estrategia.ts para que saidas.ts e
 * estrategia.ts usem as mesmas contas sem um importar o outro.
 */

/** Preço de venda que deixa exatamente `alvoLiquido` de lucro depois da taxa de compra e de venda. */
export function precoAlvo(entrada: Valor, alvoLiquido: number, taxa: number): Valor {
  return entrada.times(dec(1).plus(taxa)).times(dec(1).plus(alvoLiquido)).div(dec(1).minus(taxa));
}

export const precoStop = (entrada: Valor, stop: number): Valor => entrada.times(dec(1).minus(stop));

/** Preço de empate: vendendo nele, as duas taxas estão pagas e o resultado é zero. */
export const precoEmpate = (entrada: Valor, taxa: number): Valor => precoAlvo(entrada, 0, taxa);

/** Custo das duas taxas como fração da entrada: o gatilho do empate precisa passar disso. */
export const custoIdaEVolta = (taxa: number): number => (1 + taxa) / (1 - taxa) - 1;
