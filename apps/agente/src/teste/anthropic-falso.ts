import Anthropic from "@anthropic-ai/sdk";

export interface PedidoRegistrado {
  readonly url: string;
  readonly cabecalhos: Headers;
  readonly corpo: Record<string, unknown> & { messages: { role: string; content: unknown }[] };
}

type Resposta = { readonly status?: number; readonly corpo: unknown; readonly sse?: boolean };

/**
 * Cliente da Anthropic de verdade com `fetch` falso: o Tool Runner do SDK roda inteiro,
 * mas nenhuma chamada sai da máquina e nenhuma chave real é usada.
 */
export function anthropicFalso(respostas: readonly Resposta[]) {
  const pedidos: PedidoRegistrado[] = [];
  const fetch = async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
    pedidos.push({
      url: String(url),
      cabecalhos: new Headers(init?.headers),
      corpo: JSON.parse(String(init?.body)),
    });
    const r = respostas[pedidos.length - 1];
    if (!r) throw new Error(`o teste não previu a chamada nº ${pedidos.length} à Anthropic`);
    if (r.sse) {
      return new Response(eventosSse(r.corpo as MensagemFalsa), {
        status: 200,
        headers: { "content-type": "text/event-stream", "request-id": "req_teste" },
      });
    }
    return new Response(JSON.stringify(r.corpo), {
      status: r.status ?? 200,
      headers: { "content-type": "application/json", "request-id": "req_teste" },
    });
  };
  const cliente = new Anthropic({ apiKey: "chave-de-teste-nao-real", fetch, maxRetries: 0 });
  return { cliente, pedidos };
}

let contador = 0;

export function mensagemFalsa(o: {
  content: unknown[];
  stop_reason: string;
  usage?: Record<string, unknown>;
  stop_details?: unknown;
  model?: string;
}) {
  contador += 1;
  return {
    corpo: {
      id: `msg_${contador}`,
      type: "message",
      role: "assistant",
      model: o.model ?? "claude-opus-5",
      content: o.content,
      stop_reason: o.stop_reason,
      stop_sequence: null,
      stop_details: o.stop_details ?? null,
      container: null,
      context_management: null,
      usage: {
        input_tokens: 1000,
        output_tokens: 200,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
        ...o.usage,
      },
    },
  };
}

export const usoFerramenta = (nome: string, entrada: unknown, id = `toolu_${nome}`) => ({
  type: "tool_use",
  id,
  name: nome,
  input: entrada,
});

export const texto = (t: string) => ({ type: "text", text: t });

type Bloco = { type: string; text?: string; id?: string; name?: string; input?: unknown };
type MensagemFalsa = { content: Bloco[]; stop_reason: string; usage: Record<string, unknown> } & Record<
  string,
  unknown
>;

const sse = (tipo: string, dados: unknown) =>
  `event: ${tipo}\ndata: ${JSON.stringify({ type: tipo, ...(dados as object) })}\n\n`;

function eventosBloco(b: Bloco, index: number): string[] {
  if (b.type === "text") {
    const texto = b.text ?? "";
    const meio = Math.ceil(texto.length / 2);
    return [
      sse("content_block_start", { index, content_block: { type: "text", text: "" } }),
      ...[texto.slice(0, meio), texto.slice(meio)]
        .filter((t) => t !== "")
        .map((t) => sse("content_block_delta", { index, delta: { type: "text_delta", text: t } })),
      sse("content_block_stop", { index }),
    ];
  }
  return [
    sse("content_block_start", {
      index,
      content_block: { type: "tool_use", id: b.id, name: b.name, input: {} },
    }),
    sse("content_block_delta", {
      index,
      delta: { type: "input_json_delta", partial_json: JSON.stringify(b.input) },
    }),
    sse("content_block_stop", { index }),
  ];
}

/** A mesma mensagem que `mensagemFalsa` monta, em eventos de streaming (SSE) da API. */
function eventosSse(m: MensagemFalsa): string {
  const { content, stop_reason, usage, ...resto } = m;
  return [
    sse("message_start", {
      message: { ...resto, content: [], stop_reason: null, usage: { ...usage, output_tokens: 1 } },
    }),
    ...content.flatMap(eventosBloco),
    sse("message_delta", {
      delta: { stop_reason, stop_sequence: null },
      usage: { output_tokens: usage["output_tokens"] },
    }),
    sse("message_stop", {}),
  ].join("");
}

/** Resposta em streaming (para o Tool Runner com `stream: true`). */
export const emStreaming = (r: { corpo: unknown }) => ({ ...r, sse: true });
