import {
  ConexaoClaudeEsquema,
  ErroRespostaEsquema,
  EstadoTokenClaudeEsquema,
  ResultadoTesteClaudeEsquema,
  type ConexaoClaude,
  type EstadoTokenClaude,
  type ResultadoTesteClaude,
} from "@zentrade/contratos";
import type { z } from "zod";
import type { Buscar } from "./tipos.js";

/**
 * O Claude de cada pessoa, visto pela API: a conexão pelo botão e o teste rodam no agente
 * (é lá que o CLI está e onde o token é decifrado). A API manda só o usuarioId da sessão;
 * o token nunca passa por aqui na conexão pelo botão.
 */
export interface ClienteTokenClaude {
  conectar(usuarioId: string): Promise<ConexaoClaude>;
  enviarCodigo(usuarioId: string, conexaoId: string, codigo: string): Promise<EstadoTokenClaude>;
  cancelar(usuarioId: string, conexaoId: string): Promise<void>;
  testar(usuarioId: string): Promise<ResultadoTesteClaude>;
}

/** O agente recusou ou falhou: status e código vêm dele (mensagem em frase, sem token). */
export class ErroAgenteTokenClaude extends Error {
  override name = "ErroAgenteTokenClaude";
  constructor(
    readonly status: number,
    readonly codigo: string,
    mensagem: string,
  ) {
    super(mensagem);
  }
}

/** A conexão espera o link (até 45 s) e o token (até 90 s); o teste roda uma chamada ao modelo. */
const PRAZO_MS = 120_000;

async function erroDe(r: Response): Promise<ErroAgenteTokenClaude> {
  if (r.status === 401) {
    return new ErroAgenteTokenClaude(
      503,
      "agente_fora_do_ar",
      "o agente recusou o segredo da API; confira se o AGENTE_SEGREDO é o mesmo nos dois",
    );
  }
  const corpo = ErroRespostaEsquema.safeParse(await r.json().catch(() => null));
  return corpo.success
    ? new ErroAgenteTokenClaude(r.status, corpo.data.erro.codigo, corpo.data.erro.mensagem)
    : new ErroAgenteTokenClaude(502, "falha_agente", `o agente respondeu ${r.status}; veja o log do agente`);
}

export function criarClienteTokenClaude(o: {
  readonly url: string;
  readonly segredo: string;
  readonly buscar?: Buscar;
}): ClienteTokenClaude {
  const buscar = o.buscar ?? fetch;
  const cabecalhos = { authorization: `Bearer ${o.segredo}`, "content-type": "application/json" };

  async function pedir<T>(caminho: string, corpo: object, esquema: z.ZodType<T> | null): Promise<T> {
    let r: Response;
    try {
      r = await buscar(`${o.url}/assistente/claude-token${caminho}`, {
        method: "POST",
        headers: cabecalhos,
        body: JSON.stringify(corpo),
        signal: AbortSignal.timeout(PRAZO_MS),
      });
    } catch {
      throw new ErroAgenteTokenClaude(
        503,
        "agente_fora_do_ar",
        "o agente de IA não respondeu; tente de novo quando ele voltar",
      );
    }
    if (!r.ok) throw await erroDe(r);
    if (!esquema) return undefined as T;
    const lido = esquema.safeParse(await r.json().catch(() => null));
    if (!lido.success) {
      throw new ErroAgenteTokenClaude(502, "falha_agente", "o agente respondeu fora do contrato");
    }
    return lido.data;
  }

  const conexao = (id: string) => `/conexao/${encodeURIComponent(id)}`;
  return {
    conectar: (usuarioId) => pedir("/conexao", { usuarioId }, ConexaoClaudeEsquema),
    enviarCodigo: (usuarioId, id, codigo) =>
      pedir(`${conexao(id)}/codigo`, { usuarioId, codigo }, EstadoTokenClaudeEsquema),
    cancelar: (usuarioId, id) => pedir(`${conexao(id)}/cancelar`, { usuarioId }, null),
    testar: (usuarioId) => pedir("/testar", { usuarioId }, ResultadoTesteClaudeEsquema),
  };
}
