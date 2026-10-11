import { createHash } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { comoUsuario, type Db } from "../cliente.js";
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

export interface NovoDocumento {
  readonly fonte: Fonte;
  readonly titulo: string;
  readonly url?: string;
  readonly publicadoEm: number;
  /** Texto completo: define o hash que evita ingerir o mesmo conteúdo duas vezes. */
  readonly texto: string;
  readonly trechos: readonly { readonly texto: string; readonly embedding: readonly number[] }[];
}

export const hashConteudo = (texto: string): string =>
  createHash("sha256").update(texto, "utf8").digest("hex");

function validarTrechos(lista: NovoDocumento["trechos"]): void {
  if (lista.length === 0) throw new ErroDados("invalido", "o documento precisa de pelo menos um trecho");
  const errado = lista.find((t) => t.embedding.length !== DIMENSOES_EMBEDDING);
  if (errado) {
    throw new ErroDados(
      "invalido",
      `cada embedding precisa de ${DIMENSOES_EMBEDDING} dimensões (veio um com ${errado.embedding.length}); confira o modelo de embeddings`,
    );
  }
}

export function repositorioConhecimento(db: Db) {
  return {
    listar: (usuarioId: string, limite?: number): Promise<Documento[]> =>
      comoUsuario(db, usuarioId, async (tx) => {
        const linhas = await tx
          .select()
          .from(documentos)
          .orderBy(desc(documentos.publicadoEm))
          .limit(limitar(limite));
        return linhas.map((d) => ({
          id: d.id,
          fonte: d.fonte,
          titulo: d.titulo,
          url: d.url,
          publicadoEm: ms(d.publicadoEm),
          criadoEm: ms(d.criadoEm),
        }));
      }),

    /** Grava documento e trechos juntos. Conteúdo repetido não duplica: devolve o documento que já existe. */
    async ingerir(usuarioId: string, doc: NovoDocumento): Promise<{ id: string; novo: boolean }> {
      validarTrechos(doc.trechos);
      const hash = hashConteudo(doc.texto);
      return comoUsuario(db, usuarioId, async (tx) => {
        const [criado] = await tx
          .insert(documentos)
          .values({
            usuarioId,
            fonte: doc.fonte,
            titulo: doc.titulo,
            url: doc.url ?? null,
            publicadoEm: new Date(doc.publicadoEm),
            hashConteudo: hash,
          })
          .onConflictDoNothing({ target: [documentos.usuarioId, documentos.hashConteudo] })
          .returning({ id: documentos.id });
        if (!criado) {
          const [existente] = await tx
            .select({ id: documentos.id })
            .from(documentos)
            .where(and(eq(documentos.usuarioId, usuarioId), eq(documentos.hashConteudo, hash)));
          if (!existente) throw new Error("documento repetido sumiu durante a ingestão");
          return { id: existente.id, novo: false };
        }
        await tx.insert(trechos).values(
          doc.trechos.map((t, ordem) => ({
            documentoId: criado.id,
            usuarioId,
            ordem,
            texto: t.texto,
            embedding: [...t.embedding],
          })),
        );
        return { id: criado.id, novo: true };
      });
    },
  };
}

export type RepositorioConhecimento = ReturnType<typeof repositorioConhecimento>;
