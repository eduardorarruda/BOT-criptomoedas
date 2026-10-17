import {
  ESTADO_TOKEN_CLAUDE_VAZIO,
  finalDoToken,
  ocultarTokensClaude,
  VALIDADE_TOKEN_CLAUDE_MS,
  type EstadoTokenClaude,
  type OrigemTokenClaude,
} from "@zentrade/contratos";
import { eq, sql } from "drizzle-orm";
import { cifrar, decifrar } from "../cifra.js";
import { comoUsuario, type Db, type Tx } from "../cliente.js";
import { ms } from "../conversao.js";
import { credenciaisClaude } from "../esquema/index.js";
import { auditar } from "./auditoria.js";

/**
 * O token do Claude Code de cada pessoa (`claude setup-token`), cifrado em envelope com a
 * chave mestra — o mesmo cuidado das chaves da corretora. O contexto leva o id da pessoa:
 * um envelope copiado para a linha de outra pessoa não abre. Tudo sob RLS (comoUsuario).
 * O token decifrado só sai por `token()`, que só o agente usa (para rodar o CLI).
 */
const contexto = (usuarioId: string): string => `credenciais_claude:${usuarioId}:token`;
const TAMANHO_ERRO = 500;

export const cifrarTokenClaude = (token: string, chaveMestra: Buffer, usuarioId: string): string =>
  cifrar(token, chaveMestra, contexto(usuarioId));

export const decifrarTokenClaude = (envelope: string, chaveMestra: Buffer, usuarioId: string): string =>
  decifrar(envelope, chaveMestra, contexto(usuarioId));

/** O erro gravado nunca leva token (mesmo que o texto venha de fora) e tem tamanho limitado. */
const erroSeguro = (mensagem: string): string => ocultarTokensClaude(mensagem).slice(0, TAMANHO_ERRO);

const colunasEstado = {
  final: credenciaisClaude.tokenFinal,
  origem: credenciaisClaude.origem,
  criadaEm: credenciaisClaude.criadaEm,
  validadaEm: credenciaisClaude.validadaEm,
  ultimoErro: credenciaisClaude.ultimoErro,
};

async function lerEstado(tx: Tx, usuarioId: string): Promise<EstadoTokenClaude> {
  const [l] = await tx
    .select(colunasEstado)
    .from(credenciaisClaude)
    .where(eq(credenciaisClaude.usuarioId, usuarioId));
  if (!l) return ESTADO_TOKEN_CLAUDE_VAZIO;
  const criadaEm = ms(l.criadaEm);
  return {
    configurado: true,
    final: l.final,
    origem: l.origem,
    criadaEm,
    validoAte: l.origem === "conexao" ? criadaEm + VALIDADE_TOKEN_CLAUDE_MS : null,
    validadaEm: l.validadaEm ? ms(l.validadaEm) : null,
    ultimoErro: l.ultimoErro,
  };
}

export type ResultadoTesteGravado = { readonly ok: true } | { readonly ok: false; readonly erro: string };

export function repositorioCredenciaisClaude(db: Db, chaveMestra: Buffer) {
  return {
    estado: (usuarioId: string): Promise<EstadoTokenClaude> =>
      comoUsuario(db, usuarioId, (tx) => lerEstado(tx, usuarioId)),

    /** Grava (ou troca) o token da pessoa. A trilha registra só a origem, nunca o token. */
    salvar: (usuarioId: string, token: string, origem: OrigemTokenClaude): Promise<EstadoTokenClaude> =>
      comoUsuario(db, usuarioId, async (tx) => {
        const valores = {
          tokenCifrado: cifrarTokenClaude(token, chaveMestra, usuarioId),
          tokenFinal: finalDoToken(token),
          origem,
          criadaEm: sql`now()`,
          validadaEm: null,
          ultimoErro: null,
        };
        await tx
          .insert(credenciaisClaude)
          .values({ usuarioId, ...valores })
          .onConflictDoUpdate({ target: credenciaisClaude.usuarioId, set: valores });
        await auditar(tx, usuarioId, "token_claude_salvo", undefined, { origem });
        return lerEstado(tx, usuarioId);
      }),

    remover: (usuarioId: string): Promise<boolean> =>
      comoUsuario(db, usuarioId, async (tx) => {
        const removidas = await tx
          .delete(credenciaisClaude)
          .where(eq(credenciaisClaude.usuarioId, usuarioId))
          .returning({ id: credenciaisClaude.usuarioId });
        if (removidas.length > 0) await auditar(tx, usuarioId, "token_claude_removido");
        return removidas.length > 0;
      }),

    /** Só para o agente rodar o CLI. Nunca exponha isto na API. `null` = a pessoa não conectou. */
    token: (usuarioId: string): Promise<string | null> =>
      comoUsuario(db, usuarioId, async (tx) => {
        const [l] = await tx
          .select({ t: credenciaisClaude.tokenCifrado })
          .from(credenciaisClaude)
          .where(eq(credenciaisClaude.usuarioId, usuarioId));
        return l ? decifrarTokenClaude(l.t, chaveMestra, usuarioId) : null;
      }),

    /** O resultado do botão Testar (com registro na trilha). */
    registrarTeste: (usuarioId: string, r: ResultadoTesteGravado): Promise<EstadoTokenClaude> =>
      comoUsuario(db, usuarioId, async (tx) => {
        const set = r.ok ? { validadaEm: sql`now()`, ultimoErro: null } : { ultimoErro: erroSeguro(r.erro) };
        const mudou = await tx
          .update(credenciaisClaude)
          .set(set)
          .where(eq(credenciaisClaude.usuarioId, usuarioId))
          .returning({ id: credenciaisClaude.usuarioId });
        if (mudou.length > 0) await auditar(tx, usuarioId, "token_claude_testado", undefined, { ok: r.ok });
        return lerEstado(tx, usuarioId);
      }),

    /** O token falhou numa análise ou resposta (expirou, foi revogado): a tela mostra o erro. */
    registrarErro: (usuarioId: string, mensagem: string): Promise<void> =>
      comoUsuario(db, usuarioId, async (tx) => {
        await tx
          .update(credenciaisClaude)
          .set({ ultimoErro: erroSeguro(mensagem) })
          .where(eq(credenciaisClaude.usuarioId, usuarioId));
      }),
  };
}

export type RepositorioCredenciaisClaude = ReturnType<typeof repositorioCredenciaisClaude>;
