import { useSyncExternalStore } from "react";

/**
 * Loja mínima para dados ao vivo que mudam muitas vezes por segundo (preços,
 * passos da análise). O estado é sempre trocado por um novo valor.
 */
export interface Loja<T> {
  obter(): T;
  definir(f: (atual: T) => T): void;
  assinar(ouvinte: () => void): () => void;
}

export function criarLoja<T>(inicial: T): Loja<T> {
  let estado = inicial;
  const ouvintes = new Set<() => void>();
  return {
    obter: () => estado,
    definir(f) {
      const novo = f(estado);
      if (Object.is(novo, estado)) return;
      estado = novo;
      ouvintes.forEach((o) => o());
    },
    assinar(ouvinte) {
      ouvintes.add(ouvinte);
      return () => ouvintes.delete(ouvinte);
    },
  };
}

/** O seletor precisa devolver um valor estável (primitivo ou referência já existente). */
export function useLoja<T, S>(loja: Loja<T>, seletor: (estado: T) => S): S {
  return useSyncExternalStore(
    loja.assinar,
    () => seletor(loja.obter()),
    () => seletor(loja.obter()),
  );
}
