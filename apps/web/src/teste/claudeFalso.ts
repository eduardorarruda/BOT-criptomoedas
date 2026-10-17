import {
  ESTADO_TOKEN_CLAUDE_VAZIO,
  type ConexaoClaude,
  type EstadoTokenClaude,
} from "@zentrade/contratos/esquemas";
import { vi } from "vitest";

export const CONEXAO_FALSA: ConexaoClaude = {
  conexaoId: "0f3e2d1c-4b5a-4968-8776-655443322110",
  urlAutorizacao: "https://claude.ai/oauth/authorize?code=true&state=teste",
  expiraEm: Date.now() + 600_000,
};

export const CLAUDE_CONECTADO: EstadoTokenClaude = {
  configurado: true,
  final: "…wxyz",
  origem: "conexao",
  criadaEm: Date.now() - 86_400_000,
  validoAte: Date.now() + 364 * 86_400_000,
  validadaEm: null,
  ultimoErro: null,
};

/** Os métodos do Claude da pessoa na API do assistente, de mentira (para os testes da tela). */
export function metodosClaudeFalsos(inicial: EstadoTokenClaude = ESTADO_TOKEN_CLAUDE_VAZIO) {
  let estado = inicial;
  return {
    tokenClaude: vi.fn(async () => estado),
    salvarTokenClaude: vi.fn(async (token: string) => {
      estado = { ...CLAUDE_CONECTADO, origem: "colado", validoAte: null, final: `…${token.slice(-4)}` };
      return estado;
    }),
    removerTokenClaude: vi.fn(async () => {
      estado = ESTADO_TOKEN_CLAUDE_VAZIO;
    }),
    testarTokenClaude: vi.fn(async () => {
      estado = { ...estado, validadaEm: Date.now() };
      return { ok: true, mensagem: null, estado };
    }),
    iniciarConexaoClaude: vi.fn(async () => ({ ...CONEXAO_FALSA, expiraEm: Date.now() + 600_000 })),
    enviarCodigoClaude: vi.fn(async (_id: string, _codigo: string) => {
      estado = CLAUDE_CONECTADO;
      return estado;
    }),
    cancelarConexaoClaude: vi.fn(async (_id: string) => undefined),
  };
}
