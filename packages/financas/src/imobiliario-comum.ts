import { dec, type Valor } from "@zentrade/dominio";
import { ErroParametroFinanceiro } from "./fluxo-caixa.js";

/**
 * Ajudantes internos dos módulos de imóveis e amortização (não saem pelo index).
 * Arredondamento de centavos: meio para cima, como nas tabelas dos bancos.
 */
const METADE_PARA_CIMA = 4; // Decimal.ROUND_HALF_UP

export const ZERO = dec(0);

export const centavos = (v: Valor): Valor => v.toDecimalPlaces(2, METADE_PARA_CIMA);

export const somar = (valores: readonly Valor[]): Valor => valores.reduce((s, v) => s.plus(v), ZERO);

export function exigirPositivo(v: Valor, nome: string): Valor {
  if (!v.isFinite() || v.lte(0)) throw new ErroParametroFinanceiro(`${nome} precisa ser maior que zero`);
  return v;
}

export function exigirNaoNegativo(v: Valor, nome: string): Valor {
  if (!v.isFinite() || v.isNegative()) throw new ErroParametroFinanceiro(`${nome} não pode ser negativo`);
  return v;
}

/** Fração entre `minimo` e `maximo` (padrão 0 a 1): 0,05 = 5%. */
export function exigirFracao(x: number, nome: string, minimo = 0, maximo = 1): number {
  if (!Number.isFinite(x) || x < minimo || x > maximo) {
    const pct = (n: number) => `${(n * 100).toLocaleString("pt-BR")}%`;
    throw new ErroParametroFinanceiro(`${nome} precisa estar entre ${pct(minimo)} e ${pct(maximo)}`);
  }
  return x;
}

export function exigirInteiro(x: number, nome: string, minimo: number, maximo: number): number {
  if (!Number.isInteger(x) || x < minimo || x > maximo) {
    throw new ErroParametroFinanceiro(`${nome} precisa ser um inteiro entre ${minimo} e ${maximo}`);
  }
  return x;
}

/** Divisão que devolve fração (number) ou null quando o divisor é zero. */
export const razao = (a: Valor, b: Valor): number | null => (b.isZero() ? null : a.div(b).toNumber());

export const MS_POR_DIA = 86_400_000;

/** "2026-10-11" → ms UTC da meia-noite. Recusa data que não existe (31/02). */
export function diaUtc(iso: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  const ms = m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : Number.NaN;
  if (!m || Number.isNaN(ms) || new Date(ms).toISOString().slice(0, 10) !== iso) {
    throw new ErroParametroFinanceiro(`data inválida: ${iso} (use AAAA-MM-DD)`);
  }
  return ms;
}

/** Soma `meses` a uma data, prendendo no último dia do mês (31/01 + 1 mês = 28 ou 29/02). */
export function somarMesesMs(ms: number, meses: number): number {
  const d = new Date(ms);
  const ano = d.getUTCFullYear();
  const mes = d.getUTCMonth() + meses;
  const ultimoDia = new Date(Date.UTC(ano, mes + 1, 0)).getUTCDate();
  return Date.UTC(ano, mes, Math.min(d.getUTCDate(), ultimoDia));
}

export const isoDeMs = (ms: number): string => new Date(ms).toISOString().slice(0, 10);
