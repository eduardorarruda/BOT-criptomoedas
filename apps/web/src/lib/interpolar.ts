import { dec } from "@zentrade/dominio";

/**
 * Valor intermediário entre dois decimais em texto, para os números que contam até
 * o valor novo. A conta é feita em Decimal; o progresso (0 a 1) é só o tempo.
 */
export function interpolarDecimal(de: string, para: string, progresso: number): string {
  const t = Math.min(1, Math.max(0, progresso));
  if (t === 1) return para;
  try {
    const a = dec(de);
    const b = dec(para);
    return a.plus(b.minus(a).times(t)).toFixed();
  } catch {
    return para;
  }
}
