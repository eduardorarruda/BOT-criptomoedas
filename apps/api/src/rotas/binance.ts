import { StatusBinanceEsquema } from "@zentrade/contratos";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { usuarioIdDe } from "../autenticacao/plugin.js";
import type { Dependencias } from "../dependencias.js";
import { servicoCarteiraDe } from "../integracoes/binance-carteira.js";

/**
 * Status das contas da Binance: conectada, permissões da chave (só a rede real informa)
 * e a última sincronização. Como as contas, só pela tela, com sessão.
 */
export const rotasBinance: FastifyPluginAsyncZod<{ deps: Dependencias }> = async (app, { deps }) => {
  const servico = servicoCarteiraDe(deps);
  app.get(
    "/binance/status",
    { config: { acesso: "sessao" }, schema: { response: { 200: StatusBinanceEsquema } } },
    async (req) => servico.status(usuarioIdDe(req)),
  );
};
