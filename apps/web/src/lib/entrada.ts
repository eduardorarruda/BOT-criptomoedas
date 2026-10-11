import { dec } from "@zentrade/dominio";

/**
 * Leitura do que a pessoa digita em campos de valor. Aceita vírgula decimal
 * ("25,50") e devolve texto decimal ("25.50"), nunca float.
 */
export function lerDecimalDigitado(texto: string): string | null {
  const limpo = texto.trim().replace(/\s/g, "").replace(/^US\$/i, "");
  if (limpo === "") return null;
  const normalizado = limpo.includes(",") ? limpo.replace(/\./g, "").replace(",", ".") : limpo;
  if (!/^-?\d+(\.\d+)?$/.test(normalizado)) return null;
  try {
    return dec(normalizado).toFixed();
  } catch {
    return null;
  }
}

/** Texto decimal para mostrar num campo editável ("25.5" → "25,5"). */
export const paraCampo = (texto: string): string => texto.replace(".", ",");

export function erroValorPositivo(texto: string, nome: string): string | null {
  const v = lerDecimalDigitado(texto);
  if (v === null) return `Digite ${nome} em dólares, por exemplo 25 ou 25,50.`;
  if (!dec(v).gt(0)) return `${nome[0]?.toUpperCase()}${nome.slice(1)} precisa ser maior que zero.`;
  return null;
}

export function erroInteiro(texto: string, nome: string, min: number, max: number): string | null {
  const n = Number(texto);
  if (!/^\d+$/.test(texto.trim()) || n < min || n > max)
    return `${nome} precisa ser um número inteiro entre ${min} e ${max}.`;
  return null;
}
