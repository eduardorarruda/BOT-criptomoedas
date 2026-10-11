/** Tipos de arquivo que viram texto para o RAG. */
export const TIPOS_EXTRAIVEIS = ["pdf", "docx", "md", "txt", "html"] as const;
export type TipoExtraivel = (typeof TIPOS_EXTRAIVEIS)[number];

/**
 * ~500 mil caracteres (umas 150 páginas de texto corrido, ~450 trechos): acima disso o
 * custo dos embeddings e o ruído na busca não compensam. O que passar é cortado e avisado.
 */
export const LIMITE_CARACTERES_EXTRAIDOS = 500_000;

export interface TextoExtraido {
  readonly texto: string;
  /** Título achado no próprio arquivo (<title> do HTML), quando houver. */
  readonly titulo: string | null;
  readonly caracteres: number;
  readonly truncado: boolean;
}

/** Falha que a pessoa entende e consegue resolver (arquivo protegido, vazio, tipo errado...). */
export class ErroExtracao extends Error {
  override name = "ErroExtracao";
}

export function limitarTexto(texto: string, titulo: string | null = null): TextoExtraido {
  const truncado = texto.length > LIMITE_CARACTERES_EXTRAIDOS;
  const final = truncado ? texto.slice(0, LIMITE_CARACTERES_EXTRAIDOS) : texto;
  return { texto: final, titulo, caracteres: final.length, truncado };
}
