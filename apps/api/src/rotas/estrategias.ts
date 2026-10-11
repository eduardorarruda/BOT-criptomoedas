import { EstrategiaEsquema } from "@zentrade/contratos";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { usuarioIdDe } from "../autenticacao/plugin.js";
import type { Dependencias } from "../dependencias.js";
import { exigirUuid, ouNaoEncontrado, ParamId } from "./comum.js";

const NovaEstrategia = EstrategiaEsquema.omit({ id: true, versao: true });

export const rotasEstrategias: FastifyPluginAsyncZod<{ deps: Dependencias }> = async (app, { deps }) => {
  const { estrategias } = deps.banco;

  app.get("/estrategias", { config: { acesso: "leitura" } }, async (req) =>
    estrategias.listar(usuarioIdDe(req)),
  );

  app.post(
    "/estrategias",
    { config: { acesso: "operar" }, schema: { body: NovaEstrategia } },
    async (req, reply) => reply.code(201).send(await estrategias.criar(usuarioIdDe(req), req.body)),
  );

  app.get("/estrategias/:id", { config: { acesso: "leitura" }, schema: { params: ParamId } }, async (req) =>
    ouNaoEncontrado(
      await estrategias.obter(usuarioIdDe(req), exigirUuid(req.params.id, "estratégia")),
      "estratégia",
    ),
  );

  app.post(
    "/estrategias/:id/versoes",
    { config: { acesso: "operar" }, schema: { params: ParamId, body: NovaEstrategia } },
    async (req, reply) => {
      const id = exigirUuid(req.params.id, "estratégia");
      return reply.code(201).send(await estrategias.novaVersao(usuarioIdDe(req), id, req.body));
    },
  );
};
