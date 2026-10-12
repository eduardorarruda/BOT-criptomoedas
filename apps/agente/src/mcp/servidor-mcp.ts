import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ErroApi, type ClienteApi } from "../api/cliente-api.js";
import { explicarDecisao, formatarDecisoes, formatarResumo } from "../apresentacao/formatar.js";

type Resultado = { content: { type: "text"; text: string }[]; isError?: boolean };

const texto = (t: string): Resultado => ({ content: [{ type: "text", text: t }] });

/** Erro da API vira resposta legível para o assistente; o resto sobe (bug de verdade). */
async function responder(tarefa: () => Promise<string>): Promise<Resultado> {
  try {
    return texto(await tarefa());
  } catch (e) {
    if (e instanceof ErroApi) return { ...texto(e.message), isError: true };
    throw e;
  }
}

/**
 * Servidor MCP: deixa um assistente consultar o ZenTrade e puxar o freio de mão. Desligar
 * a parada total NÃO é possível por aqui — exige uma pessoa reautenticada na tela.
 */
export function criarServidorMcp(api: ClienteApi): McpServer {
  const servidor = new McpServer({ name: "zentrade", version: "0.1.0" });

  servidor.registerTool(
    "zentrade_resumo",
    {
      title: "Resumo do ZenTrade",
      description:
        "Resultado do dia, exposição, maior queda em 30 dias, robôs ativos, custo de IA e parada total.",
      annotations: { readOnlyHint: true },
    },
    () => responder(async () => formatarResumo(await api.resumo())),
  );

  servidor.registerTool(
    "zentrade_decisoes",
    {
      title: "Decisões recentes",
      description: "Últimas decisões dos robôs, mais recentes primeiro. Filtre por robô se quiser.",
      inputSchema: {
        roboId: z.string().min(1).max(64).optional(),
        limite: z.number().int().min(1).max(50).optional(),
      },
      annotations: { readOnlyHint: true },
    },
    ({ roboId, limite }) =>
      responder(async () =>
        formatarDecisoes(
          await api.decisoes({ ...(roboId ? { roboId } : {}), ...(limite ? { limite } : {}) }),
        ),
      ),
  );

  servidor.registerTool(
    "zentrade_explicar_decisao",
    {
      title: "Explicar decisão",
      description:
        "Explica uma decisão: sinal das regras, proposta da IA com fontes, veredito do risco e desfecho.",
      inputSchema: { decisaoId: z.string().min(1).max(64) },
      annotations: { readOnlyHint: true },
    },
    ({ decisaoId }) => responder(async () => explicarDecisao(await api.decisao(decisaoId))),
  );

  servidor.registerTool(
    "zentrade_parada_total",
    {
      title: "Ligar a parada total",
      description:
        "LIGA a parada total: nenhum robô compra nem vende pela regra até uma pessoa desligá-la pela tela (com reautenticação); o stop e o alvo das posições abertas seguem valendo. " +
        "Esta ferramenta não desliga a parada.",
      inputSchema: { motivo: z.string().max(300).optional().describe("Por que parar (fica só na conversa)") },
      annotations: { destructiveHint: false, idempotentHint: true },
    },
    () =>
      responder(async () => {
        await api.paradaTotal(true);
        return "Parada total LIGADA. Nenhuma entrada nova; stop e alvo das posições seguem valendo. Para retomar, uma pessoa precisa desligá-la pela tela.";
      }),
  );

  return servidor;
}
