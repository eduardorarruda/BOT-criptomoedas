import { dec, type Valor } from "./dinheiro.js";

/**
 * Reconciliação: a posição que os robôs registram (derivada das execuções) contra o
 * saldo real na corretora (livre + bloqueado). Nunca opera para corrigir: só aponta.
 *
 * Só FALTA conta como divergência. Saldo a mais é normal: moedas da pessoa fora dos
 * robôs, o saldo inicial da testnet, poeira de conversões.
 */

/** 0,5%: a Binance cobra a taxa da compra no próprio ativo (sem BNB) e arredonda lotes. */
export const TOLERANCIA_RELATIVA = dec("0.005");
/** Diferenças que valem menos que isto (em US$) são poeira. */
export const POEIRA_USD = dec(1);

export interface SaldoParaConferir {
  readonly ativo: string;
  /** Soma das posições dos robôs da conta neste ativo. */
  readonly esperado: Valor;
  readonly livre: Valor;
  /** Preso em ordem aberta (por exemplo, o stop na corretora): ainda é da pessoa. */
  readonly bloqueado: Valor;
  /** Último preço conhecido, em US$, para medir a poeira. `null` = desconhecido. */
  readonly preco: Valor | null;
}

export interface ResultadoConferencia {
  readonly ativo: string;
  readonly esperado: Valor;
  readonly naCorretora: Valor;
  /** Quanto falta na corretora (zero se não falta nada). */
  readonly falta: Valor;
  readonly tolerancia: Valor;
  readonly divergente: boolean;
}

export function conferirSaldo(s: SaldoParaConferir): ResultadoConferencia {
  const naCorretora = s.livre.plus(s.bloqueado);
  const diferenca = s.esperado.minus(naCorretora);
  const falta = diferenca.isPositive() ? diferenca : dec(0);
  const relativa = s.esperado.times(TOLERANCIA_RELATIVA);
  const poeira = s.preco && s.preco.gt(0) ? POEIRA_USD.div(s.preco) : dec(0);
  const tolerancia = relativa.gt(poeira) ? relativa : poeira;
  return {
    ativo: s.ativo,
    esperado: s.esperado,
    naCorretora,
    falta,
    tolerancia,
    divergente: falta.gt(tolerancia),
  };
}
