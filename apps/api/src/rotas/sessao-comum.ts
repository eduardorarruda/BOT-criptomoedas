import type { Usuario } from "@zentrade/banco";
import type { FastifyRequest } from "fastify";
import { naoAutenticado } from "../erros.js";
import type { Autenticacao } from "../autenticacao/plugin.js";
import { chaveDoCliente } from "../chave-cliente.js";

/**
 * Rotas que conferem senha ou código: 5 tentativas por minuto para cada IP + pessoa
 * (o e-mail no login). Roda no preHandler para já ter o corpo e a sessão lidos.
 */
const limitePorPessoa = (chave: (req: FastifyRequest) => string) => ({
  max: 5,
  timeWindow: "1 minute",
  hook: "preHandler" as const,
  keyGenerator: (req: FastifyRequest) => `${chaveDoCliente(req)}|${chave(req)}`,
});

export const LIMITE_LOGIN = limitePorPessoa((req) =>
  String((req.body as { email?: unknown } | undefined)?.email ?? "").toLowerCase(),
);

export const LIMITE_SESSAO = limitePorPessoa((req) =>
  req.autenticacao?.via === "sessao" ? req.autenticacao.usuario.id : "anonimo",
);

export const publico = (u: Usuario) => ({
  id: u.id,
  email: u.email,
  nome: u.nome,
  doisFatores: u.doisFatores,
});

export function sessaoDe(req: FastifyRequest): Extract<Autenticacao, { via: "sessao" }> {
  const a = req.autenticacao;
  if (a?.via !== "sessao") throw naoAutenticado();
  return a;
}
