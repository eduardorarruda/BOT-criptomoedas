export const LIMITE_MAXIMO_LISTA = 200;
const LIMITE_PADRAO = 50;

/** Listas têm teto: ninguém pede 1 milhão de linhas por acidente. */
export const limitar = (limite?: number): number =>
  Math.min(Math.max(limite ?? LIMITE_PADRAO, 1), LIMITE_MAXIMO_LISTA);
