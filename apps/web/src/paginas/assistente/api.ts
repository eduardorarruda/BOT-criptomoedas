import {
  ConexaoClaudeEsquema,
  ConversaEsquema,
  ConversaResumoEsquema,
  EstadoAssistenteEsquema,
  EstadoTokenClaudeEsquema,
  EventoChatEsquema,
  TesteTokenClaudeEsquema,
  type ConexaoClaude,
  type Conversa,
  type ConversaResumo,
  type EstadoAssistente,
  type EstadoTokenClaude,
  type EventoChat,
  type MudancaConfigAssistente,
  type TesteTokenClaude,
} from "@zentrade/contratos/esquemas";
import { z } from "zod";
import { CABECALHO_CSRF, criarCliente, lerCookieCsrf, type ClienteApi } from "../../api/cliente";
import { ERRO_SEM_CONEXAO, erroPorStatus, ErroApi } from "../../api/erros";
import { ErroRespostaEsquema } from "../../api/esquemas";

/** O que a tela do assistente usa da API (injetável nos testes). */
export interface ApiAssistente {
  estado(): Promise<EstadoAssistente>;
  mudarConfig(m: MudancaConfigAssistente): Promise<EstadoAssistente>;
  conversas(): Promise<ConversaResumo[]>;
  conversa(id: string): Promise<Conversa>;
  criarConversa(): Promise<ConversaResumo>;
  renomear(id: string, titulo: string): Promise<ConversaResumo>;
  apagar(id: string): Promise<void>;
  /** Envia a pergunta e devolve os eventos da resposta conforme chegam (SSE). */
  enviar(conversaId: string, texto: string, sinal: AbortSignal): AsyncIterable<EventoChat>;
  /** O Claude da pessoa: o estado (só o final do token), colar, remover e testar. */
  tokenClaude(): Promise<EstadoTokenClaude>;
  salvarTokenClaude(token: string): Promise<EstadoTokenClaude>;
  removerTokenClaude(): Promise<void>;
  testarTokenClaude(): Promise<TesteTokenClaude>;
  /** Conectar pelo navegador: o agente abre a conexão e devolve o link de autorização. */
  iniciarConexaoClaude(): Promise<ConexaoClaude>;
  enviarCodigoClaude(conexaoId: string, codigo: string): Promise<EstadoTokenClaude>;
  cancelarConexaoClaude(conexaoId: string): Promise<void>;
}

/** Conectar e testar esperam o Claude Code no agente (até ~90 s): prazo maior que o padrão. */
const PRAZO_CLAUDE_MS = 150_000;

/** Lê um corpo `text/event-stream` (`data: <json>` separados por linha em branco). */
export async function* lerEventos(corpo: ReadableStream<Uint8Array>): AsyncGenerator<EventoChat> {
  const leitor = corpo.getReader();
  const decodificador = new TextDecoder();
  let resto = "";
  for (;;) {
    const { value, done } = await leitor.read();
    resto += done ? decodificador.decode() : decodificador.decode(value, { stream: true });
    const blocos = resto.split("\n\n");
    resto = done ? "" : (blocos.pop() ?? "");
    for (const bloco of blocos) {
      const dados = bloco
        .split("\n")
        .filter((l) => l.startsWith("data: "))
        .map((l) => l.slice(6))
        .join("\n");
      if (!dados) continue;
      const lido = EventoChatEsquema.safeParse(jsonOuNulo(dados));
      if (lido.success) yield lido.data;
    }
    if (done) return;
  }
}

function jsonOuNulo(texto: string): unknown {
  try {
    return JSON.parse(texto);
  } catch {
    return null;
  }
}

async function erroDe(r: Response): Promise<ErroApi> {
  const corpo = ErroRespostaEsquema.safeParse(await r.json().catch(() => null));
  return corpo.success
    ? new ErroApi(corpo.data.erro.codigo, corpo.data.erro.mensagem, r.status)
    : erroPorStatus(r.status);
}

export function criarApiAssistente(
  cliente: ClienteApi = criarCliente(),
  buscar: typeof fetch = (...a) => fetch(...a),
  lerCsrf: () => string | null = () => lerCookieCsrf(),
  lento: ClienteApi = criarCliente({ tempoLimiteMs: PRAZO_CLAUDE_MS }),
): ApiAssistente {
  const { pedir } = cliente;
  const conexao = (id: string) => `/assistente/claude-token/conexao/${encodeURIComponent(id)}`;
  return {
    tokenClaude: () => pedir("GET", "/assistente/claude-token", EstadoTokenClaudeEsquema),
    salvarTokenClaude: (token) =>
      pedir("PUT", "/assistente/claude-token", EstadoTokenClaudeEsquema, { token }),
    removerTokenClaude: async () => {
      await pedir("DELETE", "/assistente/claude-token", null);
    },
    testarTokenClaude: () =>
      lento.pedir("POST", "/assistente/claude-token/testar", TesteTokenClaudeEsquema, {}),
    iniciarConexaoClaude: () =>
      lento.pedir("POST", "/assistente/claude-token/conexao", ConexaoClaudeEsquema, {}),
    enviarCodigoClaude: (id, codigo) =>
      lento.pedir("POST", `${conexao(id)}/codigo`, EstadoTokenClaudeEsquema, { codigo }),
    cancelarConexaoClaude: async (id) => {
      await pedir("DELETE", conexao(id), null);
    },
    estado: () => pedir("GET", "/assistente/config", EstadoAssistenteEsquema),
    mudarConfig: (m) => pedir("PATCH", "/assistente/config", EstadoAssistenteEsquema, m),
    conversas: () => pedir("GET", "/assistente/conversas", z.array(ConversaResumoEsquema)),
    conversa: (id) => pedir("GET", `/assistente/conversas/${encodeURIComponent(id)}`, ConversaEsquema),
    criarConversa: () => pedir("POST", "/assistente/conversas", ConversaResumoEsquema, {}),
    renomear: (id, titulo) =>
      pedir("PATCH", `/assistente/conversas/${encodeURIComponent(id)}`, ConversaResumoEsquema, { titulo }),
    apagar: async (id) => {
      await pedir("DELETE", `/assistente/conversas/${encodeURIComponent(id)}`, null);
    },
    async *enviar(conversaId, texto, sinal) {
      const csrf = lerCsrf();
      let r: Response;
      try {
        r = await buscar(`/api/v1/assistente/conversas/${encodeURIComponent(conversaId)}/mensagens`, {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "content-type": "application/json",
            accept: "text/event-stream",
            ...(csrf ? { [CABECALHO_CSRF]: csrf } : {}),
          },
          body: JSON.stringify({ texto }),
          signal: sinal,
        });
      } catch (e) {
        if (sinal.aborted) return;
        throw e instanceof ErroApi ? e : ERRO_SEM_CONEXAO();
      }
      if (!r.ok || !r.body) throw await erroDe(r);
      yield* lerEventos(r.body);
    },
  };
}
