import type Anthropic from "@anthropic-ai/sdk";
import type { BetaMessage } from "@anthropic-ai/sdk/resources/beta/messages/messages";
import type { PedidoRespostaAgente } from "@zentrade/contratos";
import { FUSO_PADRAO, type Valor } from "@zentrade/dominio";
import { MODELO_PADRAO } from "../analista.js";
import { custoUsd } from "../custo.js";
import { paraAnthropic, type AoFalharFerramenta, type FerramentaLeitura } from "../ferramentas/index.js";
import { SYSTEM_CHAT, turnosAlternados } from "./prompt-chat.js";

const BETA_FALLBACK = "server-side-fallback-2026-07-01";

export interface PedidoChat extends Pick<PedidoRespostaAgente, "historico" | "pergunta"> {
  readonly ferramentas: readonly FerramentaLeitura[];
  readonly modelo: string | null;
  readonly sinal: AbortSignal;
  readonly aoTexto: (delta: string) => void;
  /** Ferramenta que lançou: o detalhe vai para o log; o modelo lê só uma frase curta. */
  readonly aoFalharFerramenta?: AoFalharFerramenta;
}

/** Como a resposta terminou, quando não terminou do jeito normal: vira aviso no fim do texto. */
function avisoDaParada(final: BetaMessage | undefined): string | null {
  switch (final?.stop_reason) {
    case "end_turn":
    case "stop_sequence":
      return null;
    case "refusal":
      return "O modelo recusou responder a este pedido.";
    case "max_tokens":
      return "A resposta passou do tamanho máximo e foi cortada.";
    case "tool_use":
      return "A resposta não terminou dentro do limite de consultas às ferramentas.";
    default:
      return "A resposta parou antes do fim.";
  }
}

/**
 * O assistente pela API da Anthropic: Tool Runner do SDK em streaming, com as mesmas
 * ferramentas de leitura. Os pedaços de texto saem conforme chegam.
 */
export class ChatApi {
  readonly #cliente: Anthropic;
  readonly #modeloPadrao: string;
  readonly #maxIteracoes: number;
  readonly #agora: () => Date;
  readonly #fuso: string;

  constructor(o: {
    readonly cliente: Anthropic;
    readonly modeloPadrao?: string;
    readonly maxIteracoes?: number;
    readonly agora?: () => Date;
    /** O fuso da instância: o "agora" vai ao modelo na hora local (padrão: Brasília). */
    readonly fuso?: string;
  }) {
    this.#cliente = o.cliente;
    this.#modeloPadrao = o.modeloPadrao ?? MODELO_PADRAO;
    this.#maxIteracoes = o.maxIteracoes ?? 10;
    this.#agora = o.agora ?? (() => new Date());
    this.#fuso = o.fuso ?? FUSO_PADRAO;
  }

  /** Transmite a resposta e devolve quanto ela custou (US$, todas as voltas do laço). */
  async responder(p: PedidoChat): Promise<Valor> {
    const runner = this.#cliente.beta.messages.toolRunner(
      {
        model: p.modelo ?? this.#modeloPadrao,
        max_tokens: 32_000,
        max_iterations: this.#maxIteracoes,
        thinking: { type: "adaptive" },
        betas: [BETA_FALLBACK],
        fallbacks: "default",
        system: [{ type: "text", text: SYSTEM_CHAT, cache_control: { type: "ephemeral" } }],
        tools: p.ferramentas.map((f) => ({
          ...paraAnthropic(f, p.aoFalharFerramenta),
          eager_input_streaming: true,
        })),
        messages: turnosAlternados(p, this.#agora(), this.#fuso),
        stream: true,
      },
      { signal: p.sinal },
    );
    let jaEscreveu = false;
    let final: BetaMessage | undefined;
    const mensagens: BetaMessage[] = [];
    for await (const stream of runner) {
      let novoBloco = jaEscreveu;
      stream.on("text", (delta) => {
        p.aoTexto(novoBloco ? `\n\n${delta}` : delta);
        novoBloco = false;
        jaEscreveu = true;
      });
      final = await stream.finalMessage();
      mensagens.push(final);
    }
    const aviso = avisoDaParada(final);
    if (aviso) p.aoTexto(`${jaEscreveu ? "\n\n" : ""}_${aviso}_`);
    return custoUsd(mensagens);
  }
}
