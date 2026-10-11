import type { RoboDTO } from "@zentrade/contratos";
import { LimitesRiscoEsquema, ModoRobo, RoboEsquema } from "@zentrade/contratos";
import type { FastifyRequest } from "fastify";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { exigirReautenticacao, usuarioIdDe } from "../autenticacao/plugin.js";
import type { Dependencias } from "../dependencias.js";
import { proibido } from "../erros.js";
import { exigirUuid, ouNaoEncontrado, ParamId } from "./comum.js";

const NovoRobo = RoboEsquema.omit({ id: true, criadoEm: true, pausado: true });
const MudancaRobo = z.object({
  nome: z.string().min(1).max(80).optional(),
  modo: ModoRobo.optional(),
  limites: LimitesRiscoEsquema.optional(),
  pausado: z.boolean().optional(),
});

/**
 * Ligar dinheiro real (rede real saindo de "observar") exige 2FA ativo e
 * reautenticação recente. O contrato pede isso para `auto`; aqui vale também para
 * `sugerir`, porque a aprovação humana também manda ordem real.
 */
function conferirDinheiroReal(
  req: FastifyRequest,
  robo: RoboDTO,
  modo: string | undefined,
  agora: number,
): void {
  if (robo.rede !== "real" || modo === undefined || modo === "observar" || modo === robo.modo) return;
  const a = req.autenticacao;
  if (a?.via === "sessao" && !a.usuario.doisFatores) {
    throw proibido("2fa_obrigatorio", "para operar dinheiro real, ative o 2FA em POST /api/v1/sessao/2fa");
  }
  exigirReautenticacao(req, agora);
}

export const rotasRobos: FastifyPluginAsyncZod<{ deps: Dependencias }> = async (app, { deps }) => {
  const { robos } = deps.banco;

  app.get("/robos", { config: { acesso: "leitura" } }, async (req) => robos.listar(usuarioIdDe(req)));

  app.post("/robos", { config: { acesso: "operar" }, schema: { body: NovoRobo } }, async (req, reply) =>
    reply.code(201).send(await robos.criar(usuarioIdDe(req), req.body)),
  );

  app.get("/robos/:id", { config: { acesso: "leitura" }, schema: { params: ParamId } }, async (req) =>
    ouNaoEncontrado(await robos.obter(usuarioIdDe(req), exigirUuid(req.params.id, "robô")), "robô"),
  );

  app.patch(
    "/robos/:id",
    { config: { acesso: "operar" }, schema: { params: ParamId, body: MudancaRobo } },
    async (req) => {
      const usuarioId = usuarioIdDe(req);
      const id = exigirUuid(req.params.id, "robô");
      const atual = ouNaoEncontrado(await robos.obter(usuarioId, id), "robô");
      conferirDinheiroReal(req, atual, req.body.modo, deps.agora());
      const { nome, modo, limites, pausado } = req.body;
      const mudanca = {
        ...(nome !== undefined ? { nome } : {}),
        ...(modo !== undefined ? { modo } : {}),
        ...(limites !== undefined ? { limites } : {}),
        ...(pausado !== undefined ? { pausado } : {}),
      };
      return ouNaoEncontrado(await robos.atualizar(usuarioId, id, mudanca), "robô");
    },
  );

  app.get("/robos/:id/posicao", { config: { acesso: "leitura" }, schema: { params: ParamId } }, async (req) =>
    ouNaoEncontrado(await robos.posicao(usuarioIdDe(req), exigirUuid(req.params.id, "robô")), "robô"),
  );
};
