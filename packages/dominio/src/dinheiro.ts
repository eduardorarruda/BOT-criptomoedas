import { Decimal } from "decimal.js";

/**
 * Dinheiro e quantidade são sempre decimais exatos. Ponto flutuante soma 0,1 + 0,2
 * em 0,30000000000000004 — num robô que arredonda lote e compara com o mínimo da
 * corretora, isso vira ordem recusada ou posição que nunca zera.
 *
 * Usa um clone do Decimal para não mexer na configuração global de quem importar
 * decimal.js por conta própria.
 */
const D = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_EVEN, toExpNeg: -40, toExpPos: 40 });

export type Valor = Decimal;

export class ErroDinheiro extends Error {
  override name = "ErroDinheiro";
}

export function dec(valor: Decimal.Value): Valor {
  let d: Valor;
  try {
    d = new D(valor);
  } catch {
    throw new ErroDinheiro(`valor inválido: ${String(valor)}`);
  }
  if (!d.isFinite()) throw new ErroDinheiro(`valor inválido: ${String(valor)}`);
  return d;
}

/** Maior múltiplo de `passo` que não passa de `valor` (o LOT_SIZE da corretora). */
export function arredondarParaBaixo(valor: Valor, passo: Valor): Valor {
  if (passo.lte(0)) throw new ErroDinheiro("o passo precisa ser positivo");
  return valor.div(passo).floor().times(passo);
}

export function ehMultiplo(valor: Valor, passo: Valor): boolean {
  if (passo.lte(0)) throw new ErroDinheiro("o passo precisa ser positivo");
  return valor.mod(passo).isZero();
}

/** Texto para a API da corretora e para o banco: sem notação científica. */
export function paraTexto(valor: Valor): string {
  return valor.toFixed();
}
