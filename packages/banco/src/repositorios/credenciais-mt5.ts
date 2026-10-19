import { ESTADO_MT5_VAZIO, type EstadoMt5, type NovasCredenciaisMt5 } from "@zentrade/contratos";
import { eq, sql } from "drizzle-orm";
import { cifrar, decifrar } from "../cifra.js";
import { comoUsuario, type Db, type Tx } from "../cliente.js";
import { ms } from "../conversao.js";
import { credenciaisMt5 } from "../esquema/index.js";
import { auditar } from "./auditoria.js";

/**
 * Servidor, login e senha da conta demo do MT5 de cada pessoa, cifrados em envelope com
 * a chave mestra (o mesmo cuidado das chaves da Binance). O contexto leva o id da
 * pessoa e o campo: um envelope copiado para outra linha ou outro campo não abre. Tudo
 * sob RLS. O segredo decifrado só sai por `credenciais()`, para a API testar a conexão
 * e para o motor pedir as barras ao coletor — nunca pela API para a tela.
 */
const contexto = (usuarioId: string, campo: "servidor" | "login" | "senha"): string =>
  `credenciais_mt5:${usuarioId}:${campo}`;
const TAMANHO_ERRO = 500;

export interface CredenciaisMt5Abertas {
  readonly servidor: string;
  readonly login: string;
  readonly senha: string;
  readonly simboloContinuo: string | null;
  readonly fusoServidor: string | null;
}

const colunasEstado = {
  loginFinal: credenciaisMt5.loginFinal,
  simboloContinuo: credenciaisMt5.simboloContinuo,
  fusoServidor: credenciaisMt5.fusoServidor,
  criadaEm: credenciaisMt5.criadaEm,
  validadaEm: credenciaisMt5.validadaEm,
  ultimoErro: credenciaisMt5.ultimoErro,
};

async function lerEstado(tx: Tx, usuarioId: string): Promise<EstadoMt5> {
  const [l] = await tx
    .select(colunasEstado)
    .from(credenciaisMt5)
    .where(eq(credenciaisMt5.usuarioId, usuarioId));
  if (!l) return ESTADO_MT5_VAZIO;
  return {
    configurado: true,
    loginFinal: l.loginFinal,
    simboloContinuo: l.simboloContinuo,
    fusoServidor: l.fusoServidor,
    criadaEm: ms(l.criadaEm),
    validadaEm: l.validadaEm ? ms(l.validadaEm) : null,
    ultimoErro: l.ultimoErro,
  };
}

export type ResultadoTesteMt5Gravado = { readonly ok: true } | { readonly ok: false; readonly erro: string };

export function repositorioCredenciaisMt5(db: Db, chaveMestra: Buffer) {
  return {
    estado: (usuarioId: string): Promise<EstadoMt5> =>
      comoUsuario(db, usuarioId, (tx) => lerEstado(tx, usuarioId)),

    /** Grava (ou troca) a conta da pessoa. A trilha registra só o final do login. */
    salvar: (usuarioId: string, c: NovasCredenciaisMt5): Promise<EstadoMt5> =>
      comoUsuario(db, usuarioId, async (tx) => {
        const loginFinal = `…${c.login.slice(-4)}`;
        const valores = {
          servidorCifrado: cifrar(c.servidor, chaveMestra, contexto(usuarioId, "servidor")),
          loginCifrado: cifrar(c.login, chaveMestra, contexto(usuarioId, "login")),
          senhaCifrada: cifrar(c.senha, chaveMestra, contexto(usuarioId, "senha")),
          loginFinal,
          simboloContinuo: c.simboloContinuo ?? null,
          fusoServidor: c.fusoServidor ?? null,
          criadaEm: sql`now()`,
          validadaEm: null,
          ultimoErro: null,
        };
        await tx
          .insert(credenciaisMt5)
          .values({ usuarioId, ...valores })
          .onConflictDoUpdate({ target: credenciaisMt5.usuarioId, set: valores });
        await auditar(tx, usuarioId, "conta_mt5_salva", undefined, { loginFinal });
        return lerEstado(tx, usuarioId);
      }),

    remover: (usuarioId: string): Promise<boolean> =>
      comoUsuario(db, usuarioId, async (tx) => {
        const removidas = await tx
          .delete(credenciaisMt5)
          .where(eq(credenciaisMt5.usuarioId, usuarioId))
          .returning({ id: credenciaisMt5.usuarioId });
        if (removidas.length > 0) await auditar(tx, usuarioId, "conta_mt5_removida");
        return removidas.length > 0;
      }),

    /** Só para testar a conexão e para o motor pedir as barras. Nunca exponha isto na API. */
    credenciais: (usuarioId: string): Promise<CredenciaisMt5Abertas | null> =>
      comoUsuario(db, usuarioId, async (tx) => {
        const [l] = await tx.select().from(credenciaisMt5).where(eq(credenciaisMt5.usuarioId, usuarioId));
        if (!l) return null;
        return {
          servidor: decifrar(l.servidorCifrado, chaveMestra, contexto(usuarioId, "servidor")),
          login: decifrar(l.loginCifrado, chaveMestra, contexto(usuarioId, "login")),
          senha: decifrar(l.senhaCifrada, chaveMestra, contexto(usuarioId, "senha")),
          simboloContinuo: l.simboloContinuo,
          fusoServidor: l.fusoServidor,
        };
      }),

    /** O resultado do botão Testar conexão. O erro gravado já vem sem a senha (quem chama oculta). */
    registrarTeste: (usuarioId: string, r: ResultadoTesteMt5Gravado): Promise<EstadoMt5> =>
      comoUsuario(db, usuarioId, async (tx) => {
        const set = r.ok
          ? { validadaEm: sql`now()`, ultimoErro: null }
          : { ultimoErro: r.erro.slice(0, TAMANHO_ERRO) };
        const mudou = await tx
          .update(credenciaisMt5)
          .set(set)
          .where(eq(credenciaisMt5.usuarioId, usuarioId))
          .returning({ id: credenciaisMt5.usuarioId });
        if (mudou.length > 0) await auditar(tx, usuarioId, "conta_mt5_testada", undefined, { ok: r.ok });
        return lerEstado(tx, usuarioId);
      }),

    /** Para o agendador do motor (sistema): quem tem conta configurada. */
    async donos(): Promise<string[]> {
      return (await db.select({ id: credenciaisMt5.usuarioId }).from(credenciaisMt5)).map((l) => l.id);
    },
  };
}

export type RepositorioCredenciaisMt5 = ReturnType<typeof repositorioCredenciaisMt5>;
