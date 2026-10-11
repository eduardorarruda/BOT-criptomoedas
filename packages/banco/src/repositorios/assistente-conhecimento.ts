import type {
  DocumentoComTrechos,
  DocumentoDetalhe,
  OrigemDocumento,
  TipoArquivo,
} from "@zentrade/contratos";
import { asc, desc, eq, sql } from "drizzle-orm";
import { comoUsuario, type Db, type Tx } from "../cliente.js";
import { ms } from "../conversao.js";
import { documentos, documentosOrigem, trechos } from "../esquema/index.js";
import { limitar } from "./lista.js";

/** De onde veio um documento recém-ingerido. */
export interface OrigemParaGravar {
  readonly origem: OrigemDocumento;
  readonly nomeArquivo?: string | null;
  readonly tipoArquivo?: TipoArquivo | null;
  readonly bytes?: number | null;
}

/** Trechos mostrados na tela por documento: o resto continua no RAG, só não aparece. */
const TRECHOS_NO_DETALHE = 200;

const quantosTrechos = sql<number>`(select count(*)::int from trechos t where t.documento_id = documentos.id)`;

type Linha = {
  d: typeof documentos.$inferSelect;
  o: typeof documentosOrigem.$inferSelect | null;
  trechos: number;
};

/** Sem linha de origem: notícia/regra vinda do n8n é automação; o resto foi escrito na tela. */
const origemPadrao = (fonte: string): OrigemDocumento =>
  fonte === "nota" || fonte === "diario" || fonte === "estrategia" ? "texto" : "automacao";

const paraDetalhe = ({ d, o, trechos: n }: Linha): DocumentoDetalhe => ({
  id: d.id,
  fonte: d.fonte,
  titulo: d.titulo,
  url: d.url,
  publicadoEm: ms(d.publicadoEm),
  criadoEm: ms(d.criadoEm),
  origem: o?.origem ?? origemPadrao(d.fonte),
  nomeArquivo: o?.nomeArquivo ?? null,
  tipoArquivo: o?.tipoArquivo ?? null,
  bytes: o?.bytes ?? null,
  trechos: n,
});

function consulta(tx: Tx) {
  return tx
    .select({ d: documentos, o: documentosOrigem, trechos: quantosTrechos })
    .from(documentos)
    .leftJoin(documentosOrigem, eq(documentosOrigem.documentoId, documentos.id));
}

/**
 * O RAG visto pela tela de Conhecimento: documentos com a origem, os trechos de cada
 * um e apagar. Tudo sob RLS: uma pessoa nunca vê nem apaga documento de outra.
 */
export function repositorioConhecimentoDetalhe(db: Db) {
  return {
    listar: (usuarioId: string, limite?: number): Promise<DocumentoDetalhe[]> =>
      comoUsuario(db, usuarioId, async (tx) => {
        const linhas = await consulta(tx).orderBy(desc(documentos.criadoEm)).limit(limitar(limite));
        return linhas.map(paraDetalhe);
      }),

    detalhe: (usuarioId: string, id: string): Promise<DocumentoComTrechos | null> =>
      comoUsuario(db, usuarioId, async (tx) => {
        const [linha] = await consulta(tx).where(eq(documentos.id, id));
        if (!linha) return null;
        const lista = await tx
          .select({ id: trechos.id, ordem: trechos.ordem, texto: trechos.texto })
          .from(trechos)
          .where(eq(trechos.documentoId, id))
          .orderBy(asc(trechos.ordem))
          .limit(TRECHOS_NO_DETALHE);
        return { documento: paraDetalhe(linha), trechos: lista };
      }),

    /** Grava de onde o documento veio. Conteúdo repetido mantém a origem da primeira vez. */
    gravarOrigem: (usuarioId: string, documentoId: string, o: OrigemParaGravar): Promise<void> =>
      comoUsuario(db, usuarioId, async (tx) => {
        await tx
          .insert(documentosOrigem)
          .values({
            documentoId,
            usuarioId,
            origem: o.origem,
            nomeArquivo: o.nomeArquivo ?? null,
            tipoArquivo: o.tipoArquivo ?? null,
            bytes: o.bytes ?? null,
          })
          .onConflictDoNothing({ target: documentosOrigem.documentoId });
      }),

    /** Apaga o documento, os trechos e a origem (em cascata). `false` = não existe para esta pessoa. */
    apagar: (usuarioId: string, id: string): Promise<boolean> =>
      comoUsuario(db, usuarioId, async (tx) => {
        const apagados = await tx
          .delete(documentos)
          .where(eq(documentos.id, id))
          .returning({ id: documentos.id });
        return apagados.length > 0;
      }),
  };
}

export type RepositorioConhecimentoDetalhe = ReturnType<typeof repositorioConhecimentoDetalhe>;
