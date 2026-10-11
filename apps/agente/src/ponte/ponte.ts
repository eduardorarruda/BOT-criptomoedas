import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

/**
 * A ponte MCP do ZenTrade. O Claude Code a inicia como servidor MCP por stdio; ela não
 * sabe nada de trading — só repassa cada chamada para o agente (na mesma máquina) com o
 * token desta execução. Todas as ferramentas são de leitura: nenhuma envia ordem.
 */
export interface ConfigPonte {
  readonly url: string;
  readonly acesso: string;
  readonly buscar?: (url: string, init: RequestInit) => Promise<Response>;
  readonly tempoMs?: number;
}

const TEMPO_PADRAO_MS = 30_000;
const CAMINHO = "/ponte/ferramentas";

const FerramentaRemota = z.object({
  nome: z.string().min(1).max(64),
  descricao: z.string().max(2000),
  inputSchema: z.object({ type: z.literal("object") }).loose(),
});
const Resultado = z.object({ ok: z.boolean(), texto: z.string() });

/** Só o agente nesta mesma máquina: o token nunca sai dela. */
export function urlPermitida(bruta: string): boolean {
  try {
    const url = new URL(bruta);
    return (
      url.protocol === "http:" &&
      ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) &&
      url.pathname === CAMINHO
    );
  } catch {
    return false;
  }
}

const cabecalhos = (c: ConfigPonte) => ({ "x-zentrade-ponte": c.acesso, "content-type": "application/json" });

async function listar(c: ConfigPonte) {
  const buscar = c.buscar ?? fetch;
  const r = await buscar(c.url, {
    headers: cabecalhos(c),
    signal: AbortSignal.timeout(c.tempoMs ?? TEMPO_PADRAO_MS),
  });
  if (!r.ok) throw new Error(`O agente recusou a lista de ferramentas (${r.status}).`);
  return z.array(FerramentaRemota).parse(await r.json());
}

async function chamar(c: ConfigPonte, nome: string, entrada: unknown): Promise<z.infer<typeof Resultado>> {
  const buscar = c.buscar ?? fetch;
  try {
    const r = await buscar(`${c.url}/${encodeURIComponent(nome)}`, {
      method: "POST",
      headers: cabecalhos(c),
      body: JSON.stringify({ entrada }),
      signal: AbortSignal.timeout(c.tempoMs ?? TEMPO_PADRAO_MS),
    });
    if (!r.ok) return { ok: false, texto: `O agente recusou a chamada (${r.status}).` };
    const lido = Resultado.safeParse(await r.json());
    return lido.success ? lido.data : { ok: false, texto: "Resposta do agente fora do formato." };
  } catch (e) {
    return {
      ok: false,
      texto: `Não consegui falar com o agente: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

export function criarPonte(c: ConfigPonte): Server {
  const servidor = new Server(
    { name: "zentrade", version: "0.1.0" },
    {
      capabilities: { tools: {} },
      instructions:
        "Dados do ZenTrade da pessoa (mercado, posição, decisões, conhecimento). Tudo só de leitura; nada aqui envia ordem.",
    },
  );
  servidor.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: (await listar(c)).map((f) => ({
      name: f.nome,
      description: f.descricao,
      inputSchema: f.inputSchema,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    })),
  }));
  servidor.setRequestHandler(CallToolRequestSchema, async (pedido) => {
    const r = await chamar(c, pedido.params.name, pedido.params.arguments ?? {});
    return { content: [{ type: "text" as const, text: r.texto }], isError: !r.ok };
  });
  return servidor;
}
