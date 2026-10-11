import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { usuarioIdDe } from "../autenticacao/plugin.js";
import type { Dependencias } from "../dependencias.js";
import { naoEncontrado } from "../erros.js";
import { gerarToken, sha256 } from "../seguranca/tokens.js";
import { exigirUuid, ParamId } from "./comum.js";

const NovoToken = z.object({ nome: z.string().min(1).max(80), escopo: z.enum(["leitura", "operar"]) });

export const rotasTokens: FastifyPluginAsyncZod<{ deps: Dependencias }> = async (app, { deps }) => {
  const { tokens } = deps.banco;

  app.get("/tokens", { config: { acesso: "sessao" } }, async (req) => tokens.listar(usuarioIdDe(req)));

  // Token dá acesso programático (até para operar): só pela tela, com reautenticação.
  app.post(
    "/tokens",
    { config: { acesso: "sessao", critica: true }, schema: { body: NovoToken } },
    async (req, reply) => {
      const token = gerarToken("zt_");
      const criado = await tokens.criar(usuarioIdDe(req), { ...req.body, hash: sha256(token) });
      // O token em claro sai só aqui, uma vez; o banco guarda o hash.
      return reply.code(201).send({ ...criado, token });
    },
  );

  app.delete(
    "/tokens/:id",
    { config: { acesso: "sessao" }, schema: { params: ParamId } },
    async (req, reply) => {
      if (!(await tokens.remover(usuarioIdDe(req), exigirUuid(req.params.id, "token"))))
        throw naoEncontrado("token");
      return reply.code(204).send();
    },
  );
};
