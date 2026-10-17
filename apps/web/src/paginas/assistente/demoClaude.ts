import {
  ESTADO_TOKEN_CLAUDE_VAZIO,
  finalDoToken,
  VALIDADE_TOKEN_CLAUDE_MS,
  type EstadoTokenClaude,
} from "@zentrade/contratos/esquemas";
import { ErroApi } from "../../api/erros";
import type { ApiAssistente } from "./api";

/**
 * O Claude da pessoa no modo de demonstração: a conexão é de mentira (nenhum CLI roda,
 * nada sai do navegador). O link leva à página de entrada do Claude e qualquer código com
 * 8 caracteres ou mais "conecta". Serve para ver a tela inteira, passo a passo.
 */
type MetodosClaude = Pick<
  ApiAssistente,
  | "tokenClaude"
  | "salvarTokenClaude"
  | "removerTokenClaude"
  | "testarTokenClaude"
  | "iniciarConexaoClaude"
  | "enviarCodigoClaude"
  | "cancelarConexaoClaude"
>;

export interface OpcoesClaudeDemo {
  readonly agora: () => number;
  readonly atrasoMs: number;
  /** Começa conectado (o exemplo cheio) ou não (instalação nova). */
  readonly conectado: boolean;
  /** Avisado quando o final do token muda (o estado do assistente mostra). */
  readonly aoMudar: (final: string | null) => void;
}

export const LINK_DEMO = "https://claude.ai/login";
const FINAL_DEMO = "…7Q2c";
const DIA = 86_400_000;
const CONEXAO_DEMO = "5d1c7a2e-8b3f-4c6d-9e0a-1f2b3c4d5e6f";

const pausa = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function criarClaudeDemo(o: OpcoesClaudeDemo): MetodosClaude {
  const conectado = (origem: "conexao" | "colado", final: string, criadaEm: number): EstadoTokenClaude => ({
    configurado: true,
    final,
    origem,
    criadaEm,
    validoAte: origem === "conexao" ? criadaEm + VALIDADE_TOKEN_CLAUDE_MS : null,
    validadaEm: null,
    ultimoErro: null,
  });
  let estado: EstadoTokenClaude = o.conectado
    ? { ...conectado("conexao", FINAL_DEMO, o.agora() - 12 * DIA), validadaEm: o.agora() - 2 * 3_600_000 }
    : ESTADO_TOKEN_CLAUDE_VAZIO;
  let conexao: string | null = null;
  const trocar = (novo: EstadoTokenClaude) => {
    estado = novo;
    o.aoMudar(novo.final);
    return novo;
  };

  return {
    tokenClaude: async () => estado,
    salvarTokenClaude: async (token) => trocar(conectado("colado", finalDoToken(token), o.agora())),
    removerTokenClaude: async () => {
      trocar(ESTADO_TOKEN_CLAUDE_VAZIO);
    },
    testarTokenClaude: async () => {
      await pausa(o.atrasoMs * 40);
      if (!estado.configurado) {
        throw new ErroApi("sem_token", "Você ainda não conectou o seu Claude.", 404);
      }
      return {
        ok: true,
        mensagem: null,
        estado: trocar({ ...estado, validadaEm: o.agora(), ultimoErro: null }),
      };
    },
    iniciarConexaoClaude: async () => {
      await pausa(o.atrasoMs * 30);
      conexao = CONEXAO_DEMO;
      return { conexaoId: conexao, urlAutorizacao: LINK_DEMO, expiraEm: o.agora() + 600_000 };
    },
    enviarCodigoClaude: async (id, codigo) => {
      await pausa(o.atrasoMs * 40);
      if (id !== conexao) {
        throw new ErroApi("conexao_nao_encontrada", "Essa conexão não existe mais. Comece de novo.", 404);
      }
      conexao = null;
      if (codigo.trim().length < 8) {
        throw new ErroApi(
          "codigo_recusado",
          "O Claude não aceitou esse código (errado, incompleto ou vencido). Comece a conexão de novo e cole o código assim que ele aparecer.",
          422,
        );
      }
      return trocar(conectado("conexao", FINAL_DEMO, o.agora()));
    },
    cancelarConexaoClaude: async () => {
      conexao = null;
    },
  };
}
