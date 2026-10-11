import { PatrimonioEsquema } from "@zentrade/contratos";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { usuarioIdDe } from "../autenticacao/plugin.js";
import type { Dependencias } from "../dependencias.js";
import { servicoCarteiraDe } from "../integracoes/binance-carteira.js";
import { patrimonioDe } from "./patrimonio-servico.js";

/**
 * Patrimônio consolidado da pessoa (RLS no banco): cripto, renda fixa e imobiliário
 * somados em reais, pelas mesmas contas das rotas de cada classe. Só leitura.
 * Fica em /patrimonio/consolidado porque GET /patrimonio já é a curva do resultado
 * realizado dos robôs (rotas do mercado), usada pela Visão geral.
 */
export const rotasPatrimonio: FastifyPluginAsyncZod<{ deps: Dependencias }> = async (app, { deps }) => {
  // O mesmo serviço da carteira: divide o cache de preços (o câmbio sai da mesma tabela).
  const servico = servicoCarteiraDe(deps, app.log);
  app.get(
    "/patrimonio/consolidado",
    { config: { acesso: "leitura" }, schema: { response: { 200: PatrimonioEsquema } } },
    async (req) => patrimonioDe(deps, servico, usuarioIdDe(req), req.log),
  );
};
