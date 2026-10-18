import { dec, type Valor } from "@zentrade/dominio";

/**
 * Formatação de dinheiro e quantidades a partir de texto decimal. Nada passa por
 * ponto flutuante: o texto vira Decimal (do domínio), é arredondado com meio-para-o-par
 * e só então ganha separadores pt-BR.
 */
export const TRACO = "—";
const MENOS = "−"; // U+2212, o sinal de menos tipográfico
const MOEDA = "US$";
/** O mini índice (WIN) é cotado em reais. */
export type Moeda = "US$" | "R$";

export type Sinal = "ganho" | "perda" | "neutro";

export interface OpcoesDinheiro {
  readonly casas?: number;
  readonly sinal?: boolean;
  /** Padrão: US$ (o cripto). */
  readonly moeda?: Moeda;
}

function lerDecimal(texto: string | number): Valor | null {
  if (typeof texto === "string" && texto.trim() === "") return null;
  try {
    return dec(texto);
  } catch {
    return null;
  }
}

function agruparMilhar(inteiro: string): string {
  return inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/** Valor absoluto com `casas` decimais em pt-BR ("1.234,56"). */
function absolutoPtBr(v: Valor, casas: number): string {
  const [inteiro = "0", fracao] = v.abs().toFixed(casas).split(".");
  return fracao ? `${agruparMilhar(inteiro)},${fracao}` : agruparMilhar(inteiro);
}

function prefixoSinal(arredondado: Valor, comMais: boolean): string {
  if (arredondado.isZero()) return "";
  if (arredondado.isNegative()) return MENOS;
  return comMais ? "+" : "";
}

function comCasas(v: Valor, casas: number): Valor {
  return dec(v.toFixed(casas));
}

export function formatarDinheiro(texto: string, opcoes: OpcoesDinheiro = {}): string {
  const v = lerDecimal(texto);
  if (!v) return TRACO;
  const casas = opcoes.casas ?? 2;
  const arredondado = comCasas(v, casas);
  return `${prefixoSinal(arredondado, opcoes.sinal ?? false)}${opcoes.moeda ?? MOEDA} ${absolutoPtBr(arredondado, casas)}`;
}

/** Custo de IA costuma ser frações de centavo: 4 casas. */
export const formatarCustoIa = (texto: string): string => formatarDinheiro(texto, { casas: 4 });

/** Quantidade do ativo: até 8 casas, sem zeros à direita. */
export function formatarQuantidade(texto: string): string {
  const v = lerDecimal(texto);
  if (!v) return TRACO;
  const arredondado = v.toDecimalPlaces(8);
  const [inteiro = "0", fracao] = arredondado.abs().toFixed().split(".");
  const corpo = fracao ? `${agruparMilhar(inteiro)},${fracao}` : agruparMilhar(inteiro);
  return `${prefixoSinal(arredondado, false)}${corpo}`;
}

/** Casas de um preço: 2 acima de 100, 4 entre 1 e 100, e o suficiente para 4 dígitos abaixo de 1. */
function casasDoPreco(v: Valor): number {
  const absoluto = v.abs();
  if (absoluto.gte(100)) return 2;
  if (absoluto.gte(1)) return 4;
  if (absoluto.isZero()) return 2;
  return Math.min(10, -absoluto.e + 4);
}

export function formatarPreco(texto: string): string {
  const v = lerDecimal(texto);
  if (!v) return TRACO;
  const casas = casasDoPreco(v);
  const arredondado = comCasas(v, casas);
  return `${prefixoSinal(arredondado, false)}${absolutoPtBr(arredondado, casas)}`;
}

/** Fração (0,025) para percentual ("2,5%"). */
export function formatarPercentual(fracao: number | string, opcoes: OpcoesDinheiro = {}): string {
  if (typeof fracao === "number" && !Number.isFinite(fracao)) return TRACO;
  const v = lerDecimal(fracao);
  if (!v) return TRACO;
  const casas = opcoes.casas ?? 1;
  const arredondado = comCasas(v.times(100), casas);
  return `${prefixoSinal(arredondado, opcoes.sinal ?? false)}${absolutoPtBr(arredondado, casas)}%`;
}

/** Valor que já está em % (0,31 → "0,31%"), como os resultados e o valor esperado dos cenários. */
export function formatarPorcento(valor: number, opcoes: OpcoesDinheiro = {}): string {
  if (!Number.isFinite(valor)) return TRACO;
  return formatarPercentual(dec(valor).div(100).toString(), opcoes);
}

export function sinalDe(texto: string): Sinal {
  const v = lerDecimal(texto);
  if (!v || v.isZero()) return "neutro";
  return v.isNegative() ? "perda" : "ganho";
}
