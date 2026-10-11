import { ContaCorretoraEsquema } from "@zentrade/contratos";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { usuarioIdDe } from "../autenticacao/plugin.js";
import type { Dependencias } from "../dependencias.js";
import { naoEncontrado, proibido } from "../erros.js";
import { exigirUuid, ParamId } from "./comum.js";

const NovaConta = z.object({
  corretora: z.literal("binance"),
  rede: z.enum(["testnet", "real"]),
  apiKey: z.string().min(8, "a chave da API parece curta demais").max(200),
  apiSecret: z.string().min(8, "o segredo da API parece curto demais").max(200),
});

export const rotasContas: FastifyPluginAsyncZod<{ deps: Dependencias }> = async (app, { deps }) => {
  const { contas } = deps.banco;

  app.get(
    "/contas-corretora",
    { config: { acesso: "sessao" }, schema: { response: { 200: z.array(ContaCorretoraEsquema) } } },
    async (req) => contas.listar(usuarioIdDe(req)),
  );

  // Cadastrar chave é crítico: reautenticação recente; chave de dinheiro real exige 2FA.
  app.post(
    "/contas-corretora",
    {
      config: { acesso: "sessao", critica: true },
      schema: { body: NovaConta, response: { 201: ContaCorretoraEsquema } },
    },
    async (req, reply) => {
      const a = req.autenticacao;
      if (req.body.rede === "real" && a?.via === "sessao" && !a.usuario.doisFatores) {
        throw proibido(
          "2fa_obrigatorio",
          "para cadastrar chave de dinheiro real, ative o 2FA em POST /api/v1/sessao/2fa",
        );
      }
      return reply.code(201).send(await contas.criar(usuarioIdDe(req), req.body));
    },
  );

  app.delete(
    "/contas-corretora/:id",
    { config: { acesso: "sessao" }, schema: { params: ParamId } },
    async (req, reply) => {
      const removida = await contas.remover(usuarioIdDe(req), exigirUuid(req.params.id, "conta"));
      if (!removida) throw naoEncontrado("conta");
      return reply.code(204).send();
    },
  );
};
