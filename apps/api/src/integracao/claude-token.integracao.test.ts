import type { EstadoAgenteAssistente } from "@zentrade/contratos";
import Fastify, { type FastifyInstance } from "fastify";
import { generate } from "otplib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { criarClienteAssistente } from "../integracoes/assistente.js";
import { comSessao, montarApi, type Api, type Pessoa } from "./ajuda.js";

const SEGREDO = "a".repeat(40);
const TOKEN = `sk-ant-oat01-${"Q".repeat(86)}wxyz`;
const CONEXAO = "0f3e2d1c-4b5a-4968-8776-655443322110";
const LINK = "https://claude.ai/oauth/authorize?code=true&client_id=x&state=y";
const ESTADO: EstadoAgenteAssistente = {
  provedores: { api: false, cli: true },
  provedorPadrao: "cli",
  contasCli: [],
  modelos: { api: [], cli: [] },
  tokenClaude: { usar: true, conectar: true },
};

/** Um agente de mentira para o token: registra quem pediu e responde como o de verdade. */
interface AgenteFalso {
  readonly url: string;
  readonly pedidos: { rota: string; corpo: Record<string, unknown> }[];
  codigoErrado: boolean;
  fechar(): Promise<void>;
}

async function subirAgenteFalso(): Promise<AgenteFalso> {
  const app: FastifyInstance = Fastify({ logger: false });
  const agente = { pedidos: [] as AgenteFalso["pedidos"], codigoErrado: false };
  const registrar = (rota: string, corpo: unknown) =>
    agente.pedidos.push({ rota, corpo: corpo as Record<string, unknown> });
  app.addHook("onRequest", async (req, reply) => {
    if (req.headers.authorization !== `Bearer ${SEGREDO}`) return reply.code(401).send({});
  });
  app.get("/assistente/estado", async () => ESTADO);
  app.post("/assistente/claude-token/conexao", async (req, reply) => {
    registrar("conexao", req.body);
    return reply.code(201).send({ conexaoId: CONEXAO, urlAutorizacao: LINK, expiraEm: Date.now() + 600_000 });
  });
  app.post("/assistente/claude-token/conexao/:id/codigo", async (req, reply) => {
    registrar("codigo", req.body);
    if (agente.codigoErrado) {
      return reply
        .code(422)
        .send({ erro: { codigo: "codigo_recusado", mensagem: "O Claude não aceitou esse código." } });
    }
    return {
      configurado: true,
      final: "…wxyz",
      origem: "conexao",
      criadaEm: 1,
      validoAte: 2,
      validadaEm: null,
      ultimoErro: null,
    };
  });
  app.post("/assistente/claude-token/conexao/:id/cancelar", async (req, reply) => {
    registrar("cancelar", req.body);
    return reply.code(204).send();
  });
  app.post("/assistente/claude-token/testar", async (req) => {
    registrar("testar", req.body);
    return { ok: false, mensagem: "O Claude recusou o token que você conectou." };
  });
  const url = await app.listen({ host: "127.0.0.1", port: 0 });
  return Object.assign(agente, { url, fechar: () => app.close() });
}

describe("o Claude da pessoa pela API", () => {
  let api: Api;
  let agente: AgenteFalso;
  let ana: Pessoa;
  let beto: Pessoa;
  let segredoAna: string;

  beforeAll(async () => {
    agente = await subirAgenteFalso();
    api = await montarApi({
      extras: () => ({ assistente: criarClienteAssistente({ url: agente.url, segredo: SEGREDO }) }),
    });
    ana = await api.pessoa("ana@exemplo.com");
    beto = await api.pessoa("beto@exemplo.com");
  });
  afterAll(async () => {
    await api.encerrar();
    await agente.fechar();
  });

  const pedir = (p: Pessoa, method: "GET" | "PUT" | "POST" | "DELETE", url: string, payload?: unknown) =>
    api.app.inject({ method, url: `/api/v1${url}`, headers: comSessao(p), ...(payload ? { payload } : {}) });
  const confirmar = async (p: Pessoa, segredo: string) =>
    api.app.inject({
      method: "POST",
      url: "/api/v1/sessao/confirmar",
      headers: comSessao(p),
      payload: { codigo2fa: await generate({ secret: segredo }) },
    });

  it("começa sem token", async () => {
    const r = await pedir(ana, "GET", "/assistente/claude-token");
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ configurado: false, final: null });
  });

  it("colar exige 2FA ligado e identidade confirmada há pouco", async () => {
    const sem2fa = await pedir(ana, "PUT", "/assistente/claude-token", { token: TOKEN });
    expect(sem2fa.statusCode).toBe(403);
    expect(sem2fa.json().erro.codigo).toBe("2fa_obrigatorio");
    segredoAna = await api.ativar2fa(ana);
    api.relogio.t += 6 * 60_000;
    const semConfirmar = await pedir(ana, "PUT", "/assistente/claude-token", { token: TOKEN });
    expect(semConfirmar.json().erro.codigo).toBe("reautenticacao_necessaria");
    expect((await confirmar(ana, segredoAna)).statusCode).toBe(204);
    const salvo = await pedir(ana, "PUT", "/assistente/claude-token", { token: `  ${TOKEN}\n` });
    expect(salvo.statusCode).toBe(200);
    expect(salvo.json()).toMatchObject({ configurado: true, final: "…wxyz", origem: "colado" });
    expect(salvo.body).not.toContain("sk-ant");
    expect((await pedir(ana, "GET", "/assistente/claude-token")).body).not.toContain("sk-ant");
    const config = (await pedir(ana, "GET", "/assistente/config")).json();
    expect(config).toMatchObject({ tokenClaudeFinal: "…wxyz", tokenClaude: { usar: true, conectar: true } });
    expect((await pedir(beto, "GET", "/assistente/config")).json().tokenClaudeFinal).toBeNull();
  });

  it("formato: chave da API recusada com explicação; nada de token no erro", async () => {
    const chaveApi = TOKEN.replace("oat01", "api03");
    const r = await pedir(ana, "PUT", "/assistente/claude-token", { token: chaveApi });
    expect(r.statusCode).toBe(400);
    expect(r.json().erro.mensagem).toMatch(/chave da API/);
    expect(r.body).not.toContain(chaveApi.slice(14));
    expect((await pedir(ana, "PUT", "/assistente/claude-token", { token: "curto" })).statusCode).toBe(400);
  });

  it("token de API (Bearer) não serve: só a tela, com sessão", async () => {
    const criado = await pedir(ana, "POST", "/tokens", { nome: "cli", escopo: "operar" });
    const bearer = { authorization: `Bearer ${criado.json().token}` };
    for (const [method, url] of [
      ["GET", "/api/v1/assistente/claude-token"],
      ["PUT", "/api/v1/assistente/claude-token"],
      ["POST", "/api/v1/assistente/claude-token/conexao"],
      ["POST", "/api/v1/assistente/claude-token/testar"],
    ] as const) {
      const r = await api.app.inject({ method, url, headers: bearer, payload: { token: TOKEN } });
      expect(r.statusCode, url).toBe(403);
    }
  });

  it("RLS: outra pessoa não vê nem apaga o token", async () => {
    expect((await pedir(beto, "GET", "/assistente/claude-token")).json().configurado).toBe(false);
    expect((await pedir(beto, "DELETE", "/assistente/claude-token")).statusCode).toBe(404);
    expect((await pedir(ana, "GET", "/assistente/claude-token")).json().configurado).toBe(true);
  });

  it("testar: o usuarioId vai da sessão, o estado volta com o erro; 3 por minuto por pessoa", async () => {
    agente.pedidos.length = 0;
    const r = await pedir(ana, "POST", "/assistente/claude-token/testar", { usuarioId: beto.id });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toMatchObject({ ok: false, estado: { configurado: true, final: "…wxyz" } });
    expect(agente.pedidos).toEqual([{ rota: "testar", corpo: { usuarioId: ana.id } }]);
    await pedir(ana, "POST", "/assistente/claude-token/testar");
    await pedir(ana, "POST", "/assistente/claude-token/testar");
    const quarto = await pedir(ana, "POST", "/assistente/claude-token/testar");
    expect(quarto.statusCode).toBe(429);
    expect((await pedir(beto, "POST", "/assistente/claude-token/testar")).statusCode).toBe(200);
  });

  it("conectar pelo botão: 2FA, identidade, usuarioId da sessão, código validado", async () => {
    agente.pedidos.length = 0;
    const betoSem2fa = await pedir(beto, "POST", "/assistente/claude-token/conexao");
    expect(betoSem2fa.json().erro.codigo).toBe("2fa_obrigatorio");
    api.relogio.t += 6 * 60_000;
    const semConfirmar = await pedir(ana, "POST", "/assistente/claude-token/conexao");
    expect(semConfirmar.json().erro.codigo).toBe("reautenticacao_necessaria");
    await confirmar(ana, segredoAna);
    const inicio = await pedir(ana, "POST", "/assistente/claude-token/conexao", { usuarioId: beto.id });
    expect(inicio.statusCode).toBe(201);
    expect(inicio.json()).toMatchObject({ conexaoId: CONEXAO, urlAutorizacao: LINK });
    const ruim = await pedir(ana, "POST", `/assistente/claude-token/conexao/${CONEXAO}/codigo`, {
      codigo: "abc\r\nexit",
    });
    expect(ruim.statusCode).toBe(400);
    const fim = await pedir(ana, "POST", `/assistente/claude-token/conexao/${CONEXAO}/codigo`, {
      codigo: "codigo-certo#estado",
    });
    expect(fim.statusCode).toBe(200);
    expect(fim.json()).toMatchObject({ configurado: true, final: "…wxyz" });
    expect((await pedir(ana, "DELETE", `/assistente/claude-token/conexao/${CONEXAO}`)).statusCode).toBe(204);
    expect(agente.pedidos).toEqual([
      { rota: "conexao", corpo: { usuarioId: ana.id } },
      { rota: "codigo", corpo: { usuarioId: ana.id, codigo: "codigo-certo#estado" } },
      { rota: "cancelar", corpo: { usuarioId: ana.id } },
    ]);
  });

  it("o erro do agente chega à tela com o código dele", async () => {
    agente.codigoErrado = true;
    const r = await pedir(ana, "POST", `/assistente/claude-token/conexao/${CONEXAO}/codigo`, {
      codigo: "codigo-errado#estado",
    });
    expect(r.statusCode).toBe(422);
    expect(r.json().erro).toEqual({
      codigo: "codigo_recusado",
      mensagem: "O Claude não aceitou esse código.",
    });
    agente.codigoErrado = false;
  });

  it("começar conexões: 5 por hora por pessoa", async () => {
    await confirmar(ana, segredoAna);
    const codigos = [];
    for (let i = 0; i < 5; i++) {
      codigos.push((await pedir(ana, "POST", "/assistente/claude-token/conexao")).statusCode);
    }
    // As duas do teste anterior (a recusada sem confirmar também conta) já entraram na hora.
    expect(codigos).toEqual([201, 201, 201, 429, 429]);
    expect((await pedir(beto, "POST", "/assistente/claude-token/conexao")).json().erro.codigo).toBe(
      "2fa_obrigatorio",
    );
  });

  it("remover: some e a trilha registra", async () => {
    expect((await pedir(ana, "DELETE", "/assistente/claude-token")).statusCode).toBe(204);
    expect((await pedir(ana, "GET", "/assistente/claude-token")).json().configurado).toBe(false);
    const linhas = await api.banco.conexao.sql<{ acao: string }[]>`
      select acao from auditoria where usuario_id = ${ana.id} and acao like 'token_claude%' order by sequencia`;
    expect(linhas.map((l) => l.acao)).toEqual(["token_claude_salvo", "token_claude_removido"]);
  });
});
