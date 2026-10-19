import {
  ResumoImportacaoB3Esquema,
  type EstadoImportacaoB3,
  type ResumoImportacaoB3,
} from "@zentrade/contratos";
import { desc, eq } from "drizzle-orm";
import { comoUsuario, type Db } from "../cliente.js";
import { ms } from "../conversao.js";
import { umaLinha } from "../erros.js";
import { importacoesB3 } from "../esquema/index.js";
import { limitar } from "./lista.js";

export interface ImportacaoB3 {
  readonly id: string;
  readonly nomeArquivo: string;
  readonly estado: EstadoImportacaoB3;
  readonly resumo: ResumoImportacaoB3 | null;
  readonly erro: string | null;
  readonly criadoEm: number;
  readonly concluidoEm: number | null;
}

/** Só para o motor (acesso de sistema): de onde ler o arquivo temporário. */
export interface ImportacaoB3ParaProcessar extends ImportacaoB3 {
  readonly caminho: string;
  readonly usuarioId: string;
}

const RESUMO_FORA_DO_CONTRATO =
  "o motor gravou um resumo fora do contrato (ResumoImportacaoB3Esquema); importe de novo";

function resumoLido(b: typeof importacoesB3.$inferSelect): {
  resumo: ResumoImportacaoB3 | null;
  erro: string | null;
} {
  if (b.resumo === null) return { resumo: null, erro: b.erro };
  const lido = ResumoImportacaoB3Esquema.safeParse(b.resumo);
  return {
    resumo: lido.success ? lido.data : null,
    erro: b.erro ?? (lido.success ? null : RESUMO_FORA_DO_CONTRATO),
  };
}

const paraDTO = (b: typeof importacoesB3.$inferSelect): ImportacaoB3 => ({
  id: b.id,
  nomeArquivo: b.nomeArquivo,
  estado: b.estado as EstadoImportacaoB3,
  ...resumoLido(b),
  criadoEm: ms(b.criadoEm),
  concluidoEm: b.concluidoEm ? ms(b.concluidoEm) : null,
});

const paraProcessar = (b: typeof importacoesB3.$inferSelect): ImportacaoB3ParaProcessar => ({
  ...paraDTO(b),
  caminho: b.caminho,
  usuarioId: b.usuarioId,
});

/**
 * Upload dos .zip da B3: a pessoa só vê (e lista) as próprias importações (RLS); o
 * motor lê e grava qualquer uma (job genérico, sem usuarioId no payload).
 */
export function repositorioImportacoesB3(db: Db) {
  return {
    async criar(usuarioId: string, nomeArquivo: string, caminho: string): Promise<ImportacaoB3> {
      return comoUsuario(db, usuarioId, async (tx) =>
        paraDTO(
          umaLinha(await tx.insert(importacoesB3).values({ usuarioId, nomeArquivo, caminho }).returning()),
        ),
      );
    },

    /** Mais recentes primeiro. */
    listar: (usuarioId: string, limite?: number): Promise<ImportacaoB3[]> =>
      comoUsuario(db, usuarioId, async (tx) =>
        (
          await tx.select().from(importacoesB3).orderBy(desc(importacoesB3.criadoEm)).limit(limitar(limite))
        ).map(paraDTO),
      ),

    obter: (usuarioId: string, id: string): Promise<ImportacaoB3 | null> =>
      comoUsuario(db, usuarioId, async (tx) => {
        const [b] = await tx.select().from(importacoesB3).where(eq(importacoesB3.id, id));
        return b ? paraDTO(b) : null;
      }),

    /** Para o motor (sistema): o caminho do arquivo temporário e o nome original. */
    async obterParaProcessar(id: string): Promise<ImportacaoB3ParaProcessar | null> {
      const [b] = await db.select().from(importacoesB3).where(eq(importacoesB3.id, id));
      return b ? paraProcessar(b) : null;
    },

    /** Para o motor (sistema): marca o início da leitura do arquivo. */
    async marcarLendo(id: string): Promise<void> {
      await db.update(importacoesB3).set({ estado: "lendo" }).where(eq(importacoesB3.id, id));
    },

    /** Para o motor (sistema): grava o resumo e marca como concluída. */
    async concluir(id: string, resumo: ResumoImportacaoB3): Promise<void> {
      await db
        .update(importacoesB3)
        .set({ estado: "concluida", resumo, erro: null, concluidoEm: new Date() })
        .where(eq(importacoesB3.id, id));
    },

    /** Para o motor (sistema): grava o erro legível e marca como falha. */
    async falhar(id: string, erro: string): Promise<void> {
      await db
        .update(importacoesB3)
        .set({ estado: "falhou", erro, concluidoEm: new Date() })
        .where(eq(importacoesB3.id, id));
    },
  };
}

export type RepositorioImportacoesB3 = ReturnType<typeof repositorioImportacoesB3>;
