import { LIMITE_HISTORICO_PENSAMENTO } from "@zentrade/contratos";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { usuarioIdDe } from "../autenticacao/plugin.js";
import type { Dependencias } from "../dependencias.js";
import { exigirUuid, ouNaoEncontrado, ParamId } from "./comum.js";

const Limite = z.object({
  limite: z.coerce.number().int().min(1).max(LIMITE_HISTORICO_PENSAMENTO).optional(),
});

/**
 * O que a estratégia está pensando: a última leitura de cada robô (cenário, condições da
 * regra e conclusão), o histórico curto de um robô e o cenário atual por ativo. Só os
 * robôs da pessoa (RLS); quem lê não gasta IA nenhuma.
 */
export const rotasPensamentos: FastifyPluginAsyncZod<{ deps: Dependencias }> = async (app, { deps }) => {
  const { pensamentos, robos } = deps.banco;

  app.get("/pensamentos", { config: { acesso: "leitura" } }, async (req) =>
    pensamentos.atuais(usuarioIdDe(req)),
  );

  app.get("/cenarios", { config: { acesso: "leitura" } }, async (req) =>
    pensamentos.cenarios(usuarioIdDe(req)),
  );

  app.get(
    "/robos/:id/pensamentos",
    { config: { acesso: "leitura" }, schema: { params: ParamId, querystring: Limite } },
    async (req) => {
      const usuarioId = usuarioIdDe(req);
      const id = exigirUuid(req.params.id, "robô");
      ouNaoEncontrado(await robos.obter(usuarioId, id), "robô");
      return pensamentos.historico(usuarioId, id, req.query.limite);
    },
  );
};
