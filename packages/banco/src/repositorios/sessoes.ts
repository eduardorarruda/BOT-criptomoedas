import { and, eq, gt, lte } from "drizzle-orm";
import type { Db } from "../cliente.js";
import { ms } from "../conversao.js";
import { sessoes, usuarios } from "../esquema/index.js";
import type { Usuario } from "./usuarios.js";

export interface Sessao {
  readonly usuario: Usuario;
  readonly csrf: string;
  readonly expiraEm: number;
  readonly reautenticadaEm: number;
}

/**
 * Sessões server-side. O `id` é o SHA-256 do token do cookie: quem ler o banco não
 * consegue se passar por ninguém. Acesso de sistema: a sessão é o que diz quem é a pessoa.
 */
export function repositorioSessoes(db: Db) {
  return {
    async criar(s: { id: string; usuarioId: string; csrf: string; expiraEm: number }): Promise<void> {
      await db.insert(sessoes).values({ ...s, expiraEm: new Date(s.expiraEm) });
    },

    async obter(id: string, agora: number): Promise<Sessao | null> {
      const [linha] = await db
        .select({
          csrf: sessoes.csrf,
          expiraEm: sessoes.expiraEm,
          reautenticadaEm: sessoes.reautenticadaEm,
          usuario: {
            id: usuarios.id,
            email: usuarios.email,
            nome: usuarios.nome,
            doisFatores: usuarios.doisFatores,
          },
        })
        .from(sessoes)
        .innerJoin(usuarios, eq(usuarios.id, sessoes.usuarioId))
        .where(and(eq(sessoes.id, id), gt(sessoes.expiraEm, new Date(agora))));
      if (!linha) return null;
      return { ...linha, expiraEm: ms(linha.expiraEm), reautenticadaEm: ms(linha.reautenticadaEm) };
    },

    async reautenticar(id: string, em: number): Promise<void> {
      await db
        .update(sessoes)
        .set({ reautenticadaEm: new Date(em) })
        .where(eq(sessoes.id, id));
    },

    async remover(id: string): Promise<void> {
      await db.delete(sessoes).where(eq(sessoes.id, id));
    },

    async removerExpiradas(agora: number): Promise<number> {
      const removidas = await db
        .delete(sessoes)
        .where(lte(sessoes.expiraEm, new Date(agora)))
        .returning({ id: sessoes.id });
      return removidas.length;
    },
  };
}

export type RepositorioSessoes = ReturnType<typeof repositorioSessoes>;
