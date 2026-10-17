import type { FonteConhecimento } from "./tipos.js";

export interface Classificavel {
  readonly id: string;
  readonly fonte: FonteConhecimento;
  readonly publicadoEm: Date;
}

export interface OpcoesFusao {
  readonly agora: Date;
  readonly limite: number;
  readonly pesos: Readonly<Record<FonteConhecimento, number>>;
  /** Em quantos dias o peso de um item daquela fonte cai pela metade. */
  readonly meiaVidaDias: Readonly<Record<FonteConhecimento, number>>;
  /** Constante do RRF; 60 é o valor do artigo original (Cormack et al., 2009). */
  readonly k?: number;
}

const DIA_MS = 86_400_000;

function decaimento(item: Classificavel, o: OpcoesFusao): number {
  const idadeDias = Math.max(0, (o.agora.getTime() - item.publicadoEm.getTime()) / DIA_MS);
  return 0.5 ** (idadeDias / o.meiaVidaDias[item.fonte]);
}

/**
 * Reciprocal Rank Fusion: soma 1/(k + posição) de cada lista em que o item aparece.
 * Usa só a posição, não a nota de cada busca — cosseno e ts_rank não são comparáveis.
 * Depois pesa pela fonte e pela idade.
 *
 * Lista ausente (`null`/`undefined`, ex.: a vetorial sem embeddings configurados) é
 * ignorada; com uma lista só, o resultado segue a ordem dela. Item repetido dentro da
 * mesma lista conta uma vez, pela melhor posição.
 */
export function fundirResultados<T extends Classificavel>(
  listas: readonly (readonly T[] | null | undefined)[],
  o: OpcoesFusao,
): (T & { readonly pontuacao: number })[] {
  const k = o.k ?? 60;
  const acumulado = new Map<string, { item: T; rrf: number }>();
  for (const lista of listas) {
    const vistos = new Set<string>();
    (lista ?? []).forEach((item, i) => {
      if (vistos.has(item.id)) return;
      vistos.add(item.id);
      const atual = acumulado.get(item.id);
      acumulado.set(item.id, { item: atual?.item ?? item, rrf: (atual?.rrf ?? 0) + 1 / (k + i + 1) });
    });
  }
  return [...acumulado.values()]
    .map(({ item, rrf }) => ({ ...item, pontuacao: rrf * o.pesos[item.fonte] * decaimento(item, o) }))
    .sort((a, b) => b.pontuacao - a.pontuacao)
    .slice(0, o.limite);
}
