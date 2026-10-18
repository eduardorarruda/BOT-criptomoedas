import type { Valor } from "./dinheiro.js";

/**
 * O lado de uma posição. Comprado ganha quando o preço sobe; vendido (venda a
 * descoberto, como no mini índice) ganha quando o preço cai. Toda conta de stop,
 * alvo, stop móvel e empate do lado vendido é o espelho da do comprado: o que era
 * "abaixo" vira "acima" e a máxima vira a mínima.
 *
 * O à vista de cripto só opera comprado (não há venda a descoberto na corretora);
 * o lado vendido existe para os mercados futuros, como o WIN.
 */
export type Sentido = "comprado" | "vendido";

/** Para que lado a estratégia pode abrir posição. */
export type Direcao = Sentido | "ambos";

export const DIRECOES: readonly Direcao[] = ["comprado", "vendido", "ambos"];

/** +1 no comprado, −1 no vendido: multiplica a variação do preço para dar o resultado. */
export const fatorSentido = (s: Sentido): 1 | -1 => (s === "comprado" ? 1 : -1);

/** `a` está do lado bom de `b` (ou empatado): acima no comprado, abaixo no vendido. */
export const aFavor = (a: Valor, b: Valor, s: Sentido): boolean => (s === "comprado" ? a.gte(b) : a.lte(b));

/** `a` está do lado ruim de `b` (ou empatado): abaixo no comprado, acima no vendido. */
export const contra = (a: Valor, b: Valor, s: Sentido): boolean => (s === "comprado" ? a.lte(b) : a.gte(b));

/** O melhor dos dois para quem está no sentido: o maior no comprado, o menor no vendido. */
export const melhorPara = (a: Valor, b: Valor, s: Sentido): Valor => (aFavor(a, b, s) ? a : b);

/** Os sentidos que a direção permite abrir, nesta ordem. */
export function sentidosDa(d: Direcao): readonly Sentido[] {
  return d === "ambos" ? ["comprado", "vendido"] : [d];
}

/** A direção de uma estratégia: sem o campo, é "comprado" (todas as estratégias antigas). */
export const direcaoDe = (e: { readonly direcao?: Direcao | undefined }): Direcao => e.direcao ?? "comprado";
