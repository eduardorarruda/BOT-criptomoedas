/** As duas implementações (Voyage e bge-m3 local) produzem 1024 dimensões: a coluna é vector(1024). */
export const DIMENSOES = 1024;

/** Voyage diferencia o texto guardado ("documento") da pergunta ("consulta"); isso melhora a busca. */
export type TipoEntrada = "documento" | "consulta";

export interface Embeddings {
  readonly dimensoes: typeof DIMENSOES;
  gerar(textos: readonly string[], tipo: TipoEntrada): Promise<number[][]>;
}

export class ErroEmbeddings extends Error {
  override name = "ErroEmbeddings";
}

export type BuscarHttp = (url: string, init: RequestInit) => Promise<Response>;
export type Esperar = (ms: number) => Promise<void>;

export const esperarDeVerdade: Esperar = (ms) => new Promise((resolver) => setTimeout(resolver, ms));

export function emLotes<T>(itens: readonly T[], tamanho: number): T[][] {
  if (!Number.isInteger(tamanho) || tamanho < 1) {
    throw new RangeError(`tamanho de lote inválido (${tamanho}): use um inteiro positivo`);
  }
  return Array.from({ length: Math.ceil(itens.length / tamanho) }, (_, i) =>
    itens.slice(i * tamanho, (i + 1) * tamanho),
  );
}

export function conferirVetores(vetores: number[][], esperados: number, provedor: string): number[][] {
  if (vetores.length !== esperados) {
    throw new ErroEmbeddings(
      `${provedor} devolveu ${vetores.length} vetores para ${esperados} textos; confira o modelo configurado.`,
    );
  }
  const errado = vetores.find((v) => v.length !== DIMENSOES);
  if (errado) {
    throw new ErroEmbeddings(
      `${provedor} devolveu vetores de ${errado.length} dimensões; o banco espera ${DIMENSOES}. ` +
        "Use um modelo de 1024 dimensões (voyage-4 com output_dimension 1024, ou bge-m3).",
    );
  }
  return vetores;
}
