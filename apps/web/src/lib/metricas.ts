import { dec } from "@zentrade/dominio";

/** Contas sobre séries de valores em texto decimal, sempre em Decimal. */
export function maiorQueda(valores: readonly string[]): string {
  let topo = null as ReturnType<typeof dec> | null;
  let pior = dec(0);
  for (const texto of valores) {
    const v = dec(texto);
    if (topo === null || v.gt(topo)) topo = v;
    const queda = v.minus(topo);
    if (queda.lt(pior)) pior = queda;
  }
  return pior.toFixed();
}

export function somar(valores: readonly string[]): string {
  return valores.reduce((total, v) => total.plus(dec(v)), dec(0)).toFixed();
}

export function variacao(valores: readonly string[]): { absoluta: string; fracao: string } {
  const primeiro = valores[0];
  const ultimo = valores[valores.length - 1];
  if (primeiro === undefined || ultimo === undefined) return { absoluta: "0", fracao: "0" };
  const a = dec(primeiro);
  const diferenca = dec(ultimo).minus(a);
  return { absoluta: diferenca.toFixed(), fracao: a.isZero() ? "0" : diferenca.div(a).toFixed() };
}
