import { dec, type Valor } from "./dinheiro.js";
import { fatorSentido, type Sentido } from "./sentido.js";

/**
 * Preços derivados da entrada. Ficam fora de estrategia.ts para que saidas.ts e
 * estrategia.ts usem as mesmas contas sem um importar o outro.
 *
 * Todos aceitam o sentido da posição (padrão: comprado). No vendido, as contas são
 * o espelho: o stop fica acima da entrada e o alvo abaixo. Com o fator f = +1
 * (comprado) ou −1 (vendido), as fórmulas são as mesmas.
 */

/**
 * Preço de saída que deixa exatamente `alvoLiquido` de lucro depois da taxa de entrada
 * e de saída. Comprado: entrada × (1 + t) × (1 + a) / (1 − t). Vendido (vende na
 * entrada e recompra na saída): entrada × (1 − t) × (1 − a) / (1 + t).
 */
export function precoAlvo(
  entrada: Valor,
  alvoLiquido: number,
  taxa: number,
  sentido: Sentido = "comprado",
): Valor {
  const f = fatorSentido(sentido);
  return entrada
    .times(dec(1).plus(f * taxa))
    .times(dec(1).plus(f * alvoLiquido))
    .div(dec(1).minus(f * taxa));
}

/** Comprado: entrada × (1 − stop); vendido: entrada × (1 + stop). */
export const precoStop = (entrada: Valor, stop: number, sentido: Sentido = "comprado"): Valor =>
  entrada.times(dec(1).minus(fatorSentido(sentido) * stop));

/** Preço de empate: saindo nele, as duas taxas estão pagas e o resultado é zero. */
export const precoEmpate = (entrada: Valor, taxa: number, sentido: Sentido = "comprado"): Valor =>
  precoAlvo(entrada, 0, taxa, sentido);

/** Custo das duas taxas como fração da entrada: o gatilho do empate precisa passar disso. */
export const custoIdaEVolta = (taxa: number): number => (1 + taxa) / (1 - taxa) - 1;
