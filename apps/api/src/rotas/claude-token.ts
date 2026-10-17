import {
  CodigoConexaoClaudeEsquema,
  ConexaoClaudeEsquema,
  EstadoTokenClaudeEsquema,
  NovoTokenClaudeEsquema,
  TesteTokenClaudeEsquema,
} from "@zentrade/contratos";
import type { FastifyRequest } from "fastify";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { exigirReautenticacao, usuarioIdDe } from "../autenticacao/plugin.js";
import { chaveDoCliente } from "../chave-cliente.js";
import type { Dependencias } from "../dependencias.js";
import { ErroApi, naoEncontrado, proibido } from "../erros.js";
import { ErroAgenteTokenClaude, type ClienteTokenClaude } from "../integracoes/claude-token.js";

/** Os limites contam por pessoa (a sessão), não por IP: duas pessoas atrás do mesmo NAT não dividem. */
const porPessoa = (req: FastifyRequest): string =>
  req.autenticacao?.via === "sessao" ? `pessoa:${req.autenticacao.usuario.id}` : chaveDoCliente(req);
const LIMITE_TESTE = { max: 3, timeWindow: "1 minute", keyGenerator: porPessoa } as const;
const LIMITE_CONEXAO = { max: 5, timeWindow: "1 hour", keyGenerator: porPessoa } as const;
const LIMITE_CODIGO = { max: 10, timeWindow: "1 minute", keyGenerator: porPessoa } as const;

const ParamConexao = z.object({ id: z.uuid("conexão não encontrada; comece de novo") });

/**
 * Guardar o Claude da pessoa é como cadastrar chave de dinheiro real: só pela tela, com
 * 2FA ligado e identidade confirmada nos últimos 5 minutos. O 2FA vem antes, para não
 * pedir a senha à toa.
 */
function exigirSegurancaForte(req: FastifyRequest, agora: number, exige2fa: boolean): void {
  const a = req.autenticacao;
  if (exige2fa && a?.via === "sessao" && !a.usuario.doisFatores) {
    throw proibido(
      "2fa_obrigatorio",
      "para conectar o seu Claude, ligue antes a verificação em duas etapas (2FA) em Contas e chaves",
    );
  }
  exigirReautenticacao(req, agora);
}

function agenteDe(deps: Dependencias): ClienteTokenClaude {
  if (!deps.assistente) {
    throw new ErroApi(
      503,
      "assistente_indisponivel",
      "o assistente está desligado: configure AGENTE_URL e AGENTE_SEGREDO na API",
    );
  }
  return deps.assistente.tokenClaude;
}

/** O erro do agente sai com o status e o código dele; a mensagem já vem em frase, sem token. */
async function noAgente<T>(acao: () => Promise<T>): Promise<T> {
  try {
    return await acao();
  } catch (e) {
    if (e instanceof ErroAgenteTokenClaude) throw new ErroApi(e.status, e.codigo, e.message);
    throw e;
  }
}

type App = Parameters<FastifyPluginAsyncZod<{ deps: Dependencias }>>[0];

/** GET, PUT (colar o token) e DELETE: o token nunca volta, só o final. */
function registrarToken(app: App, deps: Dependencias): void {
  const repo = deps.banco.credenciaisClaude;
  app.get(
    "/assistente/claude-token",
    { config: { acesso: "sessao" }, schema: { response: { 200: EstadoTokenClaudeEsquema } } },
    async (req) => repo.estado(usuarioIdDe(req)),
  );

  app.put(
    "/assistente/claude-token",
    {
      config: { acesso: "sessao" },
      schema: { body: NovoTokenClaudeEsquema, response: { 200: EstadoTokenClaudeEsquema } },
    },
    async (req) => {
      exigirSegurancaForte(req, deps.agora(), deps.config.CLAUDE_EXIGE_2FA);
      return repo.salvar(usuarioIdDe(req), req.body.token, "colado");
    },
  );

  app.delete("/assistente/claude-token", { config: { acesso: "sessao" } }, async (req, reply) => {
    if (!(await repo.remover(usuarioIdDe(req)))) throw naoEncontrado("token do Claude");
    return reply.code(204).send();
  });

  app.post(
    "/assistente/claude-token/testar",
    {
      config: { acesso: "sessao", rateLimit: LIMITE_TESTE },
      schema: { response: { 200: TesteTokenClaudeEsquema } },
    },
    async (req) => {
      const usuarioId = usuarioIdDe(req);
      const resultado = await noAgente(() => agenteDe(deps).testar(usuarioId));
      return { ...resultado, estado: await repo.estado(usuarioId) };
    },
  );
}

/** Conectar pelo botão: o agente roda o setup-token; a tela só vê o link e manda o código. */
function registrarConexao(app: App, deps: Dependencias): void {
  app.post(
    "/assistente/claude-token/conexao",
    {
      config: { acesso: "sessao", rateLimit: LIMITE_CONEXAO },
      schema: { response: { 201: ConexaoClaudeEsquema } },
    },
    async (req, reply) => {
      exigirSegurancaForte(req, deps.agora(), deps.config.CLAUDE_EXIGE_2FA);
      const usuarioId = usuarioIdDe(req);
      return reply.code(201).send(await noAgente(() => agenteDe(deps).conectar(usuarioId)));
    },
  );

  app.post(
    "/assistente/claude-token/conexao/:id/codigo",
    {
      config: { acesso: "sessao", rateLimit: LIMITE_CODIGO },
      schema: {
        params: ParamConexao,
        body: CodigoConexaoClaudeEsquema,
        response: { 200: EstadoTokenClaudeEsquema },
      },
    },
    async (req) => {
      // É este passo que grava o token: a mesma barreira do começo (senão uma sessão roubada
      // terminaria a conexão com o código de outra conta do Claude).
      exigirSegurancaForte(req, deps.agora(), deps.config.CLAUDE_EXIGE_2FA);
      const usuarioId = usuarioIdDe(req);
      return noAgente(() => agenteDe(deps).enviarCodigo(usuarioId, req.params.id, req.body.codigo));
    },
  );

  app.delete(
    "/assistente/claude-token/conexao/:id",
    { config: { acesso: "sessao" }, schema: { params: ParamConexao } },
    async (req, reply) => {
      const usuarioId = usuarioIdDe(req);
      await noAgente(() => agenteDe(deps).cancelar(usuarioId, req.params.id));
      return reply.code(204).send();
    },
  );
}

/**
 * O Claude da própria pessoa (provedor "cli" com o plano dela): ver, colar, remover,
 * testar e conectar pelo navegador. O usuarioId vem sempre da sessão.
 */
export const rotasClaudeToken: FastifyPluginAsyncZod<{ deps: Dependencias }> = async (app, { deps }) => {
  registrarToken(app, deps);
  registrarConexao(app, deps);
};
