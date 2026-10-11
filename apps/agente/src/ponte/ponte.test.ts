import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import Fastify, { type FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { definirFerramenta } from "../ferramentas/index.js";
import { criarPonte, urlPermitida } from "./ponte.js";
import { CABECALHO_PONTE, CAMINHO_PONTE, registrarRotasPonte } from "./rotas.js";
import { SessoesPonte } from "./sessoes.js";

const eco = definirFerramenta({
  nome: "eco",
  descricao: "Devolve o texto",
  entrada: z.object({ texto: z.string().max(20), vezes: z.number().int().min(1).default(1) }),
  rodar: (e) => e.texto.repeat(e.vezes),
});
const quebrada = definirFerramenta({
  nome: "quebrada",
  descricao: "Sempre falha",
  entrada: z.object({}),
  rodar: () => {
    throw new Error("detalhe interno: senha=123");
  },
});

let app: FastifyInstance;
let url: string;
let agora = 1_000;
const sessoes = new SessoesPonte(() => agora);

beforeAll(async () => {
  app = Fastify({ logger: false });
  registrarRotasPonte(app, sessoes, app.log);
  url = `${await app.listen({ host: "127.0.0.1", port: 0 })}${CAMINHO_PONTE}`;
});
afterAll(async () => app.close());

describe("rotas da ponte no agente", () => {
  it("lista as ferramentas da sessão com o esquema JSON da entrada", async () => {
    const s = sessoes.abrir([eco], 60_000);
    const r = await fetch(url, { headers: { [CABECALHO_PONTE]: s.acesso } });
    const [f] = (await r.json()) as { nome: string; inputSchema: { type: string; required?: string[] } }[];
    expect(f).toMatchObject({ nome: "eco", inputSchema: { type: "object", required: ["texto"] } });
    s.fechar();
  });

  it("roda a ferramenta validando a entrada; erro interno não vaza", async () => {
    const s = sessoes.abrir([eco, quebrada], 60_000);
    const chamar = async (nome: string, entrada: unknown) =>
      (
        await fetch(`${url}/${nome}`, {
          method: "POST",
          headers: { [CABECALHO_PONTE]: s.acesso, "content-type": "application/json" },
          body: JSON.stringify({ entrada }),
        })
      ).json();
    expect(await chamar("eco", { texto: "ab", vezes: 2 })).toEqual({ ok: true, texto: "abab" });
    expect(await chamar("eco", { texto: 1 })).toMatchObject({
      ok: false,
      texto: expect.stringMatching(/inválida/),
    });
    const falha = (await chamar("quebrada", {})) as { ok: boolean; texto: string };
    expect(falha.ok).toBe(false);
    expect(falha.texto).not.toMatch(/senha/);
    expect(await chamar("enviar_ordem", {})).toMatchObject({
      ok: false,
      texto: expect.stringMatching(/desconhecida/),
    });
    s.fechar();
  });

  it("sem token, token fechado ou vencido: 401", async () => {
    const s = sessoes.abrir([eco], 1_000);
    expect((await fetch(url)).status).toBe(401);
    expect((await fetch(url, { headers: { [CABECALHO_PONTE]: "x".repeat(43) } })).status).toBe(401);
    agora += 2_000;
    expect((await fetch(url, { headers: { [CABECALHO_PONTE]: s.acesso } })).status).toBe(401);
    expect(sessoes.abertas).toBe(0);
    const t = sessoes.abrir([eco], 60_000);
    t.fechar();
    expect((await fetch(url, { headers: { [CABECALHO_PONTE]: t.acesso } })).status).toBe(401);
  });

  it("de fora da máquina, nem com o token certo", async () => {
    const s = sessoes.abrir([eco], 60_000);
    const r = await app.inject({
      method: "GET",
      url: CAMINHO_PONTE,
      headers: { [CABECALHO_PONTE]: s.acesso },
      remoteAddress: "10.0.0.7",
    });
    expect(r.statusCode).toBe(401);
    s.fechar();
  });
});

describe("ponte MCP (o lado que o Claude Code inicia)", () => {
  it("só aceita o agente desta máquina", () => {
    expect(urlPermitida("http://127.0.0.1:8081/ponte/ferramentas")).toBe(true);
    expect(urlPermitida("http://localhost:8081/ponte/ferramentas")).toBe(true);
    expect(urlPermitida("https://127.0.0.1:8081/ponte/ferramentas")).toBe(false);
    expect(urlPermitida("http://exemplo.com/ponte/ferramentas")).toBe(false);
    expect(urlPermitida("http://127.0.0.1:8081/outra")).toBe(false);
    expect(urlPermitida("nada")).toBe(false);
  });

  it("anuncia as ferramentas como só leitura e repassa as chamadas", async () => {
    const s = sessoes.abrir([eco], 60_000);
    const [lado1, lado2] = InMemoryTransport.createLinkedPair();
    const cliente = new Client({ name: "teste", version: "0.0.0" });
    await Promise.all([criarPonte({ url, acesso: s.acesso }).connect(lado1), cliente.connect(lado2)]);
    const { tools } = await cliente.listTools();
    expect(tools).toHaveLength(1);
    expect(tools[0]).toMatchObject({
      name: "eco",
      annotations: { readOnlyHint: true, destructiveHint: false },
    });
    const r = await cliente.callTool({ name: "eco", arguments: { texto: "oi" } });
    expect(r).toMatchObject({ content: [{ type: "text", text: "oi" }], isError: false });
    s.fechar();
    const negada = await cliente.callTool({ name: "eco", arguments: { texto: "oi" } });
    expect(negada).toMatchObject({ isError: true, content: [{ text: expect.stringMatching(/401/) }] });
    await cliente.close();
  });

  it("agente fora do ar vira resultado de erro, não exceção", async () => {
    const [lado1, lado2] = InMemoryTransport.createLinkedPair();
    const cliente = new Client({ name: "teste", version: "0.0.0" });
    const buscar = async () => {
      throw new Error("ECONNREFUSED");
    };
    await Promise.all([
      criarPonte({ url, acesso: "a".repeat(43), buscar }).connect(lado1),
      cliente.connect(lado2),
    ]);
    const r = await cliente.callTool({ name: "eco", arguments: {} });
    expect(r).toMatchObject({ isError: true, content: [{ text: expect.stringMatching(/ECONNREFUSED/) }] });
    await expect(cliente.listTools()).rejects.toThrow();
    await cliente.close();
  });
});
