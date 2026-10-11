import { asc, count, eq, sql } from "drizzle-orm";
import { cifrar, decifrar } from "../cifra.js";
import type { Db } from "../cliente.js";
import { codigoPostgres, ErroDados, umaLinha, VIOLACAO_UNICA } from "../erros.js";
import { usuarios } from "../esquema/index.js";

export interface Usuario {
  readonly id: string;
  readonly email: string;
  readonly nome: string;
  readonly doisFatores: boolean;
}

export interface UsuarioComSenha extends Usuario {
  readonly senhaHash: string;
}

const colunas = {
  id: usuarios.id,
  email: usuarios.email,
  nome: usuarios.nome,
  doisFatores: usuarios.doisFatores,
};

const contexto2fa = (id: string): string => `usuarios:${id}:segredo_2fa`;

/**
 * Pessoas. Acesso de sistema (sem RLS): o login procura pelo e-mail antes de saber
 * quem é. O e-mail é guardado em minúsculas.
 */
export function repositorioUsuarios(db: Db, chaveMestra: Buffer) {
  return {
    async criar(dados: { email: string; nome: string; senhaHash: string }): Promise<Usuario> {
      try {
        return umaLinha(
          await db
            .insert(usuarios)
            .values({ ...dados, email: dados.email.trim().toLowerCase() })
            .returning(colunas),
        );
      } catch (erro) {
        if (codigoPostgres(erro) === VIOLACAO_UNICA) {
          throw new ErroDados("conflito", "já existe uma pessoa com este e-mail; use outro ou entre com ele");
        }
        throw erro;
      }
    },

    async porEmail(email: string): Promise<UsuarioComSenha | null> {
      const [u] = await db
        .select({ ...colunas, senhaHash: usuarios.senhaHash })
        .from(usuarios)
        .where(eq(usuarios.email, email.trim().toLowerCase()));
      return u ?? null;
    },

    async porId(id: string): Promise<Usuario | null> {
      const [u] = await db.select(colunas).from(usuarios).where(eq(usuarios.id, id));
      return u ?? null;
    },

    async senhaHash(id: string): Promise<string | null> {
      const [u] = await db.select({ h: usuarios.senhaHash }).from(usuarios).where(eq(usuarios.id, id));
      return u?.h ?? null;
    },

    /** Guarda um segredo TOTP novo (cifrado). O 2FA só passa a valer depois de `ativar2fa`. */
    async definirSegredo2fa(id: string, segredo: string): Promise<void> {
      await db
        .update(usuarios)
        .set({ segredo2fa: cifrar(segredo, chaveMestra, contexto2fa(id)), doisFatores: false })
        .where(eq(usuarios.id, id));
    },

    async segredo2fa(id: string): Promise<string | null> {
      const [u] = await db.select({ s: usuarios.segredo2fa }).from(usuarios).where(eq(usuarios.id, id));
      return u?.s ? decifrar(u.s, chaveMestra, contexto2fa(id)) : null;
    },

    async ativar2fa(id: string): Promise<void> {
      await db
        .update(usuarios)
        .set({ doisFatores: true })
        .where(sql`${usuarios.id} = ${id} and ${usuarios.segredo2fa} is not null`);
    },

    /** Quantas pessoas estão cadastradas (decide se o dono do n8n pode ser deduzido). */
    async contar(): Promise<number> {
      const [linha] = await db.select({ n: count() }).from(usuarios);
      return linha?.n ?? 0;
    },

    /** A primeira pessoa cadastrada: dona padrão do que chega pelo n8n numa instalação de uma pessoa só. */
    async primeiro(): Promise<Usuario | null> {
      const [u] = await db.select(colunas).from(usuarios).orderBy(asc(usuarios.criadoEm)).limit(1);
      return u ?? null;
    },
  };
}

export type RepositorioUsuarios = ReturnType<typeof repositorioUsuarios>;
