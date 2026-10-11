import { desc, eq } from "drizzle-orm";
import { comoUsuario, type Db } from "../cliente.js";
import { ms } from "../conversao.js";
import { umaLinha } from "../erros.js";
import { tokensApi } from "../esquema/index.js";
import { auditar } from "./auditoria.js";

export type Escopo = "leitura" | "operar";

export interface TokenApi {
  readonly id: string;
  readonly nome: string;
  readonly escopo: Escopo;
  readonly criadoEm: number;
  readonly ultimoUsoEm: number | null;
}

const colunas = {
  id: tokensApi.id,
  nome: tokensApi.nome,
  escopo: tokensApi.escopo,
  criadoEm: tokensApi.criadoEm,
  ultimoUsoEm: tokensApi.ultimoUsoEm,
};

const paraToken = (t: {
  id: string;
  nome: string;
  escopo: Escopo;
  criadoEm: Date;
  ultimoUsoEm: Date | null;
}): TokenApi => ({ ...t, criadoEm: ms(t.criadoEm), ultimoUsoEm: t.ultimoUsoEm ? ms(t.ultimoUsoEm) : null });

/** Tokens Bearer para CLI e MCP. Só o hash fica no banco. */
export function repositorioTokens(db: Db) {
  return {
    listar: (usuarioId: string): Promise<TokenApi[]> =>
      comoUsuario(db, usuarioId, async (tx) =>
        (await tx.select(colunas).from(tokensApi).orderBy(desc(tokensApi.criadoEm))).map(paraToken),
      ),

    criar: (usuarioId: string, t: { nome: string; escopo: Escopo; hash: string }): Promise<TokenApi> =>
      comoUsuario(db, usuarioId, async (tx) => {
        const token = paraToken(
          umaLinha(
            await tx
              .insert(tokensApi)
              .values({ ...t, usuarioId })
              .returning(colunas),
          ),
        );
        await auditar(tx, usuarioId, "token_criado", token.id, { nome: t.nome, escopo: t.escopo });
        return token;
      }),

    remover: (usuarioId: string, id: string): Promise<boolean> =>
      comoUsuario(db, usuarioId, async (tx) => {
        const removidos = await tx
          .delete(tokensApi)
          .where(eq(tokensApi.id, id))
          .returning({ id: tokensApi.id });
        if (removidos.length > 0) await auditar(tx, usuarioId, "token_removido", id);
        return removidos.length > 0;
      }),

    /** Acesso de sistema: o token ainda existe (não foi revogado)? Não marca uso. */
    async existe(id: string): Promise<boolean> {
      const [t] = await db.select({ id: tokensApi.id }).from(tokensApi).where(eq(tokensApi.id, id));
      return t !== undefined;
    },

    /** Acesso de sistema: o token é o que diz quem é a pessoa. Marca o último uso. */
    async porHash(hash: string): Promise<{ id: string; usuarioId: string; escopo: Escopo } | null> {
      const [t] = await db
        .update(tokensApi)
        .set({ ultimoUsoEm: new Date() })
        .where(eq(tokensApi.hash, hash))
        .returning({ id: tokensApi.id, usuarioId: tokensApi.usuarioId, escopo: tokensApi.escopo });
      return t ?? null;
    },
  };
}

export type RepositorioTokens = ReturnType<typeof repositorioTokens>;
