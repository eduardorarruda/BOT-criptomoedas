import { ErroClaudeCli } from "../claude-cli/analista-cli.js";
import type { ExecutorClaude } from "../claude-cli/executor.js";
import { lerJson } from "../claude-cli/resultado.js";
import type { PedidoChat } from "./chat-api.js";
import { promptComHistorico, SYSTEM_CHAT } from "./prompt-chat.js";

type Objeto = Record<string, unknown>;
const objeto = (v: unknown): Objeto | null =>
  v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Objeto) : null;

/**
 * Lê o `stream-json` do Claude Code linha a linha e devolve só os pedaços de texto da
 * resposta (com uma linha em branco entre blocos). Linha que não entende é ignorada: é
 * saída de um programa de terceiros, que muda de versão para versão.
 */
export function criarLeitorTexto(aoTexto: (delta: string) => void) {
  let escreveu = false;
  let separar = false;
  const emitir = (texto: string) => {
    if (texto === "") return;
    aoTexto(separar ? `\n\n${texto}` : texto);
    separar = false;
    escreveu = true;
  };
  return {
    get escreveu() {
      return escreveu;
    },
    linha(bruta: string) {
      const o = lerJson(bruta);
      const evento = o?.["type"] === "stream_event" ? objeto(o["event"]) : null;
      if (!evento) return;
      if (evento["type"] === "content_block_start" && objeto(evento["content_block"])?.["type"] === "text") {
        separar = escreveu;
      }
      const delta = evento["type"] === "content_block_delta" ? objeto(evento["delta"]) : null;
      if (delta?.["type"] === "text_delta" && typeof delta["text"] === "string") emitir(delta["text"]);
    },
    /** Sem nenhum pedaço parcial (versão antiga do CLI), o texto final do "result" vale. */
    fim(textoFinal: string | undefined) {
      if (!escreveu && textoFinal) emitir(textoFinal);
    },
  };
}

const MOTIVOS: Readonly<Record<string, string>> = {
  error_max_turns: "A resposta passou do limite de consultas às ferramentas e foi interrompida.",
  error_max_budget_usd: "A resposta bateu no teto de custo configurado e foi interrompida.",
};

/** O assistente pelo Claude Code do plano da pessoa, com as mesmas ferramentas pela ponte MCP. */
export class ChatCli {
  readonly #executor: ExecutorClaude;
  readonly #tempoMs: number;
  readonly #agora: () => Date;

  constructor(o: {
    readonly executor: ExecutorClaude;
    readonly tempoMs: number;
    readonly agora?: () => Date;
  }) {
    this.#executor = o.executor;
    this.#tempoMs = o.tempoMs;
    this.#agora = o.agora ?? (() => new Date());
  }

  async responder(p: PedidoChat & { readonly contaId: string | null }): Promise<void> {
    const leitor = criarLeitorTexto(p.aoTexto);
    const exec = await this.#executor.executar({
      ferramentas: p.ferramentas,
      instrucoes: SYSTEM_CHAT,
      entrada: promptComHistorico(p, this.#agora()),
      modelo: p.modelo,
      contaId: p.contaId,
      tempoMs: this.#tempoMs,
      sinal: p.sinal,
      modo: { tipo: "chat" },
      aoLinha: (l) => leitor.linha(l),
    });
    if (exec.falha) throw new ErroClaudeCli(exec.falha.codigo, exec.falha.mensagem);
    const r = exec.resultado;
    if (r && (r.is_error || r.subtype !== "success")) {
      throw new ErroClaudeCli("falhou", MOTIVOS[r.subtype] ?? `O Claude Code parou com erro (${r.subtype}).`);
    }
    leitor.fim(r?.result);
  }
}
