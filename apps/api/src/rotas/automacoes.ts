import { AutomacaoEsquema } from "@zentrade/contratos";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import type { Dependencias } from "../dependencias.js";

/**
 * Status dos fluxos do n8n, derivado dos sinais que a API viu (webhooks assinados
 * recebidos e avisos enviados). Lista vazia = nenhum fluxo deu sinal ainda.
 */
export const rotasAutomacoes: FastifyPluginAsyncZod<{ deps: Dependencias }> = async (app, { deps }) => {
  app.get(
    "/automacoes",
    { config: { acesso: "leitura" }, schema: { response: { 200: z.array(AutomacaoEsquema) } } },
    async () => deps.automacoes.listar(),
  );
};
