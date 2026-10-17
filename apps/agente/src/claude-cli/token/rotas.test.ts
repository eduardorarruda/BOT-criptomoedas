import { Writable } from "node:stream";
import { ESTADO_TOKEN_CLAUDE_VAZIO, type EstadoTokenClaude } from "@zentrade/contratos";
import Fastify, { type FastifyBaseLogger, type FastifyInstance } from "fastify";
import pino from "pino";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { registrarRotasPonte } from "../../ponte/rotas.js";
import { SessoesPonte } from "../../ponte/sessoes.js";
import { criarClaudeFalso, resultadoCli, type ClaudeFalso } from "../../teste/claude-falso.js";
import {
  CODIGO_CERTO,
  criarSetupTokenFalso,
  LINK_FALSO,
  TOKEN_FALSO,
  type SetupTokenFalso,
} from "../../teste/setup-token-falso.js";
import { ExecutorClaude, MENSAGEM_TOKEN_RECUSADO } from "../executor.js";
import { ConexoesClaude } from "./conexoes.js";
import { registrarRotasTokenClaude, type OpcoesRotasTokenClaude } from "./rotas.js";
import { criarTesteToken } from "./testar.js";

const SEGREDO = "s".repeat(40);
const auth = { authorization: `Bearer ${SEGREDO}` };
const ANA = "7b0c8a52-1d2e-4c3b-9a8f-0e1d2c3b4a59";
const BETO = "0f3e2d1c-4b5a-4968-8776-655443322110";
const CONECTADO: EstadoTokenClaude = { ...ESTADO_TOKEN_CLAUDE_VAZIO, configurado: true, final: "…AbCd" };

let app: FastifyInstance | undefined;
let logs: string[] = [];
const limpar: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  await app?.close();
  app = undefined;
  await Promise.all(limpar.splice(0).map((f) => f()));
});

/** O agente com o log de verdade (pino, nível trace) gravando numa lista. */
function montar(o: Partial<OpcoesRotasTokenClaude>) {
  logs = [];
  const destino = new Writable({
    write(pedaco, _cod, pronto) {
      logs.push(String(pedaco));
      pronto();
    },
  });
  app = Fastify({ loggerInstance: pino({ level: "trace" }, destino) as FastifyBaseLogger });
  registrarRotasTokenClaude(app, { segredo: SEGREDO, conexoes: null, testar: null, ...o });
  return app;
}

async function conexoesFalsas() {
  const falso: SetupTokenFalso = await criarSetupTokenFalso();
  const salvar = vi.fn(async () => CONECTADO);
  const conexoes = new ConexoesClaude({
    claude: falso.caminho,
    script: null,
    env: { PATH: process.env["PATH"] },
    salvar,
    atrasoEnterMs: 5,
  });
  limpar.push(
    () => conexoes.encerrarTodas(),
    () => falso.apagar(),
  );
  return { conexoes, salvar };
}

describe("rotas do token do Claude no agente", () => {
  it("sem o segredo, nada", async () => {
    const a = montar({});
    for (const url of [
      "/assistente/claude-token/conexao",
      "/assistente/claude-token/testar",
      `/assistente/claude-token/conexao/${ANA}/codigo`,
      `/assistente/claude-token/conexao/${ANA}/cancelar`,
    ]) {
      const r = await a.inject({ method: "POST", url, payload: { usuarioId: ANA, codigo: CODIGO_CERTO } });
      expect(r.statusCode, url).toBe(401);
    }
  });

  it("agente sem o que precisa: 503 com explicação", async () => {
    const a = montar({});
    const c = await a.inject({
      method: "POST",
      url: "/assistente/claude-token/conexao",
      headers: auth,
      payload: { usuarioId: ANA },
    });
    expect(c.statusCode).toBe(503);
    expect(c.json().erro.mensagem).toMatch(/colar o token/);
    const t = await a.inject({
      method: "POST",
      url: "/assistente/claude-token/testar",
      headers: auth,
      payload: { usuarioId: ANA },
    });
    expect(t.statusCode).toBe(503);
  });

  it("conecta de ponta a ponta sem o token aparecer em resposta nem em log", async () => {
    const { conexoes, salvar } = await conexoesFalsas();
    const a = montar({ conexoes });
    const inicio = await a.inject({
      method: "POST",
      url: "/assistente/claude-token/conexao",
      headers: auth,
      payload: { usuarioId: ANA },
    });
    expect(inicio.statusCode).toBe(201);
    const { conexaoId, urlAutorizacao } = inicio.json();
    expect(urlAutorizacao).toBe(LINK_FALSO);
    const deOutro = await a.inject({
      method: "POST",
      url: `/assistente/claude-token/conexao/${conexaoId}/codigo`,
      headers: auth,
      payload: { usuarioId: BETO, codigo: CODIGO_CERTO },
    });
    expect(deOutro.statusCode).toBe(404);
    const fim = await a.inject({
      method: "POST",
      url: `/assistente/claude-token/conexao/${conexaoId}/codigo`,
      headers: auth,
      payload: { usuarioId: ANA, codigo: CODIGO_CERTO },
    });
    expect(fim.statusCode).toBe(200);
    expect(fim.json()).toEqual(CONECTADO);
    expect(salvar).toHaveBeenCalledWith(ANA, TOKEN_FALSO);
    const tudo = [inicio.body, fim.body, ...logs].join("\n");
    expect(tudo).not.toContain("sk-ant-oat");
    expect(logs.join("\n")).not.toContain(CODIGO_CERTO);
    expect(logs.length).toBeGreaterThan(0);
  });

  it("código com tecla de controle é recusado antes de chegar ao terminal", async () => {
    const { conexoes } = await conexoesFalsas();
    const enviar = vi.spyOn(conexoes, "enviarCodigo");
    const a = montar({ conexoes });
    const r = await a.inject({
      method: "POST",
      url: `/assistente/claude-token/conexao/${ANA}/codigo`,
      headers: auth,
      payload: { usuarioId: ANA, codigo: "abc\r\nexit\u001b[A" },
    });
    expect(r.statusCode).toBe(400);
    expect(enviar).not.toHaveBeenCalled();
  });

  it("cancelar: só a própria conexão", async () => {
    const { conexoes } = await conexoesFalsas();
    const a = montar({ conexoes });
    const { conexaoId } = (
      await a.inject({
        method: "POST",
        url: "/assistente/claude-token/conexao",
        headers: auth,
        payload: { usuarioId: ANA },
      })
    ).json();
    const cancelar = (usuarioId: string) =>
      a.inject({
        method: "POST",
        url: `/assistente/claude-token/conexao/${conexaoId}/cancelar`,
        headers: auth,
        payload: { usuarioId },
      });
    expect((await cancelar(BETO)).statusCode).toBe(404);
    expect((await cancelar(ANA)).statusCode).toBe(204);
    expect((await cancelar(ANA)).statusCode).toBe(404);
  });
});

describe("testar o token (claude -p de mentira)", () => {
  const TOKEN = `sk-ant-oat01-${"z".repeat(90)}`;
  let ponte: FastifyInstance;
  let url: string;
  const sessoes = new SessoesPonte();
  beforeAll(async () => {
    ponte = Fastify({ logger: false });
    registrarRotasPonte(ponte, sessoes, ponte.log);
    url = await ponte.listen({ host: "127.0.0.1", port: 0 });
  });
  afterAll(async () => ponte.close());

  async function teste(corpo: string, token: string | null = TOKEN) {
    const falso: ClaudeFalso = await criarClaudeFalso(corpo);
    limpar.push(() => falso.apagar());
    const registrar = vi.fn(async () => undefined);
    const executor = new ExecutorClaude(
      {
        caminho: falso.caminho,
        contas: [{ id: "principal", nome: "principal", pasta: "/dados/claude/principal" }],
        urlAgente: url,
        caminhoPonte: "/x.js",
        maxTurnos: 8,
        tetoUsd: 1,
        env: { PATH: process.env["PATH"] },
        tokens: { token: async () => token, registrarErro: async () => undefined },
      },
      sessoes,
    );
    return { falso, registrar, testar: criarTesteToken({ executor, registrar }) };
  }

  it("respondeu: grava validada e o CLI rodou com o token, 1 volta e teto baixo", async () => {
    const { falso, registrar, testar } = await teste(
      `sair(${JSON.stringify(resultadoCli({ result: "ok" }))});`,
    );
    expect(await testar(ANA)).toEqual({ ok: true, mensagem: null });
    expect(registrar).toHaveBeenCalledWith(ANA, { ok: true });
    const { env, args } = await falso.recebido();
    expect(env["CLAUDE_CODE_OAUTH_TOKEN"]).toBe(TOKEN);
    expect(args[args.indexOf("--max-turns") + 1]).toBe("1");
    expect(Number(args[args.indexOf("--max-budget-usd") + 1])).toBeLessThanOrEqual(0.1);
  });

  it("token recusado: mensagem de reconectar, gravada como último erro", async () => {
    const { registrar, testar } = await teste(
      `process.stderr.write("Invalid API key · Please run /login\\n"); process.exitCode = 1;`,
    );
    expect(await testar(ANA)).toEqual({ ok: false, mensagem: MENSAGEM_TOKEN_RECUSADO });
    expect(registrar).toHaveBeenCalledWith(ANA, { ok: false, erro: MENSAGEM_TOKEN_RECUSADO });
  });

  it("pela rota: sem token guardado, 404 com explicação", async () => {
    const { testar } = await teste(`sair(${JSON.stringify(resultadoCli())});`, null);
    const a = montar({ testar });
    const r = await a.inject({
      method: "POST",
      url: "/assistente/claude-token/testar",
      headers: auth,
      payload: { usuarioId: ANA },
    });
    expect(r.statusCode).toBe(404);
    expect(r.json().erro.codigo).toBe("sem_token");
  });
});
