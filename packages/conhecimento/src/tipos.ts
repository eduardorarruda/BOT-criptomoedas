import { z } from "zod";

export const FONTES = ["diario", "noticia", "regra_corretora", "estrategia", "nota"] as const;
export const FonteConhecimento = z.enum(FONTES);
export type FonteConhecimento = z.infer<typeof FonteConhecimento>;

export class ErroConhecimento extends Error {
  override name = "ErroConhecimento";
}

/** Linha de `documentos` pronta para gravar (esquema em docs/contrato-api.md). */
export interface DocumentoParaGravar {
  readonly id: string;
  readonly usuarioId: string;
  readonly fonte: FonteConhecimento;
  readonly titulo: string;
  readonly url: string | null;
  readonly publicadoEm: Date;
  readonly hashConteudo: string;
}

export interface TrechoParaGravar {
  readonly id: string;
  readonly ordem: number;
  readonly texto: string;
  readonly embedding: readonly number[];
}

export interface FiltroBusca {
  readonly usuarioId: string;
  readonly fontes: readonly FonteConhecimento[] | null;
  readonly limite: number;
}

/** O que a busca precisa para citar: fonte, título, data e ids. */
export interface TrechoEncontradoBruto {
  readonly trechoId: string;
  readonly documentoId: string;
  readonly fonte: FonteConhecimento;
  readonly titulo: string;
  readonly url: string | null;
  readonly publicadoEm: Date;
  readonly texto: string;
}

export interface TrechoEncontrado extends TrechoEncontradoBruto {
  readonly pontuacao: number;
}

/** Acesso ao banco do RAG. A implementação real está em postgres/repositorio.ts. */
export interface RepositorioConhecimento {
  documentoPorHash(usuarioId: string, hashConteudo: string): Promise<string | null>;
  gravarDocumento(
    documento: DocumentoParaGravar,
    trechos: readonly TrechoParaGravar[],
  ): Promise<{ documentoId: string; novo: boolean }>;
  buscarVetorial(filtro: FiltroBusca, vetor: readonly number[]): Promise<TrechoEncontradoBruto[]>;
  /** `termos` já vem pronto para to_tsquery('simple', …): palavras unidas por " | ". */
  buscarTextual(filtro: FiltroBusca, termos: string): Promise<TrechoEncontradoBruto[]>;
}

export function mensagemZod(erro: z.ZodError): string {
  return erro.issues.map((i) => `${i.path.join(".") || "entrada"}: ${i.message}`).join("; ");
}
