/**
 * Gerador pseudoaleatório com semente (mulberry32): o exemplo sai igual a cada
 * carregamento, o que ajuda a comparar telas e a testar.
 */
export type Aleatorio = () => number;

export function criarAleatorio(semente: number): Aleatorio {
  let a = semente >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Normal padrão (Box–Muller). */
export function normal(aleatorio: Aleatorio): number {
  const u = Math.max(aleatorio(), 1e-12);
  const v = aleatorio();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export function escolher<T>(aleatorio: Aleatorio, itens: readonly T[]): T {
  const item = itens[Math.floor(aleatorio() * itens.length)];
  if (item === undefined) throw new Error("não há itens para escolher");
  return item;
}
