import { and, desc, eq } from "drizzle-orm";
import { comoUsuario, type Db, type Tx } from "../cliente.js";
import { ms } from "../conversao.js";
import { ErroDados } from "../erros.js";
import { DIMENSOES_EMBEDDING, documentos, FONTES, trechos } from "../esquema/index.js";
import { limitar } from "./lista.js";

export type Fonte = (typeof FONTES)[number];

export interface Documento {
  readonly id: string;
  readonly fonte: Fonte;
  readonly titulo: string;
  readonly url: string | null;
  readonly publicadoEm: number;
  readonly criadoEm: number;
}

/**
 * Documento pronto para gravar, no formato da porta `RepositorioConhecimento` de
 * @zentrade/conhecimento (que normaliza o texto, calcula o hash e gera os ids).
 */
export interface DocumentoParaGravar {
  readonly id: string;
  readonly usuarioId: string;
  readonly fonte: Fonte;
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

function validarTrechos(lista: readonly TrechoParaGravar[]): void {
  if (lista.length === 0) throw new ErroDados("invalido", "o documento precisa de pelo menos um trecho");
  const errado = lista.find((t) => t.embedding.length !== DIMENSOES_EMBEDDING);
  if (errado) {
    throw new ErroDados(
      "invalido",
      `cada embedding precisa de ${DIMENSOES_EMBEDDING} dimensões (veio um com ${errado.embedding.length}); confira o modelo de embeddings`,
    );
  }
}

const paraDocumento = (d: typeof documentos.$inferSelect): Documento => ({
  id: d.id,
  fonte: d.fonte,
  titulo: d.titulo,
  url: d.url,
  publicadoEm: ms(d.publicadoEm),
  criadoEm: ms(d.criadoEm),
});

async function idPorHash(tx: Tx, usuarioId: string, hash: string): Promise<string | null> {
  const [linha] = await tx
    .select({ id: documentos.id })
    .from(documentos)
    .where(and(eq(documentos.usuarioId, usuarioId), eq(documentos.hashConteudo, hash)));
  return linha?.id ?? null;
}

/**
 * O RAG visto pela API. A gravação segue a porta de @zentrade/conhecimento (a API
 * usa a mesma ingestão do agente: mesmo divisor, mesmo hash), mas roda sob RLS.
 */
export function repositorioConhecimento(db: Db) {
  return {
    listar: (usuarioId: string, limite?: number): Promise<Documento[]> =>
      comoUsuario(db, usuarioId, async (tx) => {
        const linhas = await tx
          .select()
          .from(documentos)
          .orderBy(desc(documentos.publicadoEm))
          .limit(limitar(limite));
        return linhas.map(paraDocumento);
      }),

    obter: (usuarioId: string, id: string): Promise<Documento | null> =>
      comoUsuario(db, usuarioId, async (tx) => {
        const [d] = await tx.select().from(documentos).where(eq(documentos.id, id));
        return d ? paraDocumento(d) : null;
      }),

    documentoPorHash: (usuarioId: string, hash: string): Promise<string | null> =>
      comoUsuario(db, usuarioId, (tx) => idPorHash(tx, usuarioId, hash)),

    /** Grava documento e trechos juntos. Conteúdo repetido não duplica: devolve o documento que já existe. */
    async gravarDocumento(
      doc: DocumentoParaGravar,
      lista: readonly TrechoParaGravar[],
    ): Promise<{ documentoId: string; novo: boolean }> {
      validarTrechos(lista);
      return comoUsuario(db, doc.usuarioId, async (tx) => {
        const [criado] = await tx
          .insert(documentos)
          .values(doc)
          .onConflictDoNothing({ target: [documentos.usuarioId, documentos.hashConteudo] })
          .returning({ id: documentos.id });
        if (!criado) {
          const existente = await idPorHash(tx, doc.usuarioId, doc.hashConteudo);
          if (!existente) throw new Error("documento repetido sumiu durante a ingestão");
          return { documentoId: existente, novo: false };
        }
        await tx.insert(trechos).values(
          lista.map((t) => ({
            id: t.id,
            documentoId: criado.id,
            usuarioId: doc.usuarioId,
            ordem: t.ordem,
            texto: t.texto,
            embedding: [...t.embedding],
          })),
        );
        return { documentoId: criado.id, novo: true };
      });
    },
  };
}

export type RepositorioConhecimento = ReturnType<typeof repositorioConhecimento>;
