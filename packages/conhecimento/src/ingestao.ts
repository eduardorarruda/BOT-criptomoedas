import { randomUUID } from "node:crypto";
import { z } from "zod";
import { dividirTexto, OPCOES_DIVISOR_PADRAO, type OpcoesDivisor } from "./divisor.js";
import type { Embeddings } from "./embeddings/tipos.js";
import { hashConteudo, normalizarTexto } from "./normalizar.js";
import {
  ErroConhecimento,
  FonteConhecimento,
  mensagemZod,
  type RepositorioConhecimento,
  type TrechoParaGravar,
} from "./tipos.js";

export { ErroConhecimento };

export const NovoDocumentoEsquema = z.object({
  usuarioId: z.uuid(),
  fonte: FonteConhecimento,
  titulo: z.string().trim().min(1).max(300),
  url: z.url().max(2000).optional(),
  publicadoEm: z.coerce.date(),
  texto: z.string().refine((t) => normalizarTexto(t) !== "", "o texto está vazio"),
});
export type NovoDocumento = z.input<typeof NovoDocumentoEsquema>;

export interface DependenciasIngestao {
  readonly repositorio: RepositorioConhecimento;
  readonly embeddings: Embeddings;
  readonly divisor?: OpcoesDivisor;
  readonly gerarId?: () => string;
}

export interface ResultadoIngestao {
  readonly documentoId: string;
  readonly novo: boolean;
  readonly trechos: number;
}

/**
 * Normaliza, deduplica pelo hash do conteúdo, divide, gera embeddings e grava. O
 * título entra no texto do embedding (não no trecho gravado) para o trecho "saber"
 * de que documento veio.
 */
export async function ingerir(
  entrada: NovoDocumento,
  deps: DependenciasIngestao,
): Promise<ResultadoIngestao> {
  const lido = NovoDocumentoEsquema.safeParse(entrada);
  if (!lido.success) throw new ErroConhecimento(`Documento inválido para o RAG: ${mensagemZod(lido.error)}`);
  const doc = lido.data;
  const texto = normalizarTexto(doc.texto);
  const hash = hashConteudo(texto);

  const existente = await deps.repositorio.documentoPorHash(doc.usuarioId, hash);
  if (existente) return { documentoId: existente, novo: false, trechos: 0 };

  const gerarId = deps.gerarId ?? randomUUID;
  const pedacos = dividirTexto(texto, deps.divisor ?? OPCOES_DIVISOR_PADRAO);
  const vetores = await deps.embeddings.gerar(
    pedacos.map((p) => `${doc.titulo}\n${p}`),
    "documento",
  );
  const trechos: TrechoParaGravar[] = pedacos.map((p, ordem) => ({
    id: gerarId(),
    ordem,
    texto: p,
    embedding: vetores[ordem] ?? [],
  }));
  const gravado = await deps.repositorio.gravarDocumento(
    {
      id: gerarId(),
      usuarioId: doc.usuarioId,
      fonte: doc.fonte,
      titulo: doc.titulo,
      url: doc.url ?? null,
      publicadoEm: doc.publicadoEm,
      hashConteudo: hash,
    },
    trechos,
  );
  return { ...gravado, trechos: gravado.novo ? trechos.length : 0 };
}
