import type { ResultadoTesteClaude } from "@zentrade/contratos";
import type { ResultadoTesteGravado } from "@zentrade/banco";
import type { ExecutorClaude } from "../executor.js";

/** Teto do teste: uma pergunta de uma palavra, sem ferramentas (gasta quase nada do plano). */
export const TETO_TESTE_USD = 0.1;
const PRAZO_TESTE_MS = 60_000;
const INSTRUCOES = "Você confere uma conexão. Responda só com a palavra: ok";

export interface OpcoesTesteToken {
  readonly executor: Pick<ExecutorClaude, "executar">;
  readonly registrar: (usuarioId: string, r: ResultadoTesteGravado) => Promise<unknown>;
  readonly tempoMs?: number;
}

/**
 * O botão Testar: uma chamada mínima e real ao modelo com o token da pessoa (nunca a
 * conta do servidor). Deu resposta = o token vale; grava validada_em ou ultimo_erro.
 * Parar no teto de voltas ou de custo também prova que o token entrou.
 */
export function criarTesteToken(o: OpcoesTesteToken) {
  return async (usuarioId: string): Promise<ResultadoTesteClaude> => {
    const exec = await o.executor.executar({
      usuarioId,
      ferramentas: [],
      instrucoes: INSTRUCOES,
      entrada: "Conexão ok?",
      modelo: null,
      contaId: null,
      tempoMs: o.tempoMs ?? PRAZO_TESTE_MS,
      modo: { tipo: "teste", tetoUsd: TETO_TESTE_USD },
    });
    const r = exec.resultado;
    const respondeu = r !== null && (!r.is_error || r.subtype.startsWith("error_max"));
    const ok = exec.falha === null && respondeu;
    const mensagem = ok
      ? null
      : (exec.falha?.mensagem ??
        `O Claude respondeu com erro (${r?.subtype ?? "sem resultado"}). Tente de novo; se continuar, reconecte o seu Claude.`);
    await o.registrar(usuarioId, mensagem === null ? { ok: true } : { ok: false, erro: mensagem });
    return { ok, mensagem };
  };
}
