import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ClienteApi } from "../api/cliente-api.js";
import { subirApiFalsa, TOKEN_TESTE, type ApiFalsa } from "../teste/api-falsa.js";
import { criarServidorMcp } from "./servidor-mcp.js";

let api: ApiFalsa;
let cliente: Client;

beforeAll(async () => {
  api = await subirApiFalsa();
  const servidor = criarServidorMcp(new ClienteApi({ url: api.url, token: TOKEN_TESTE }));
  const [lado1, lado2] = InMemoryTransport.createLinkedPair();
  cliente = new Client({ name: "teste", version: "0.0.0" });
  await Promise.all([servidor.connect(lado1), cliente.connect(lado2)]);
});
afterAll(async () => {
  await cliente.close();
  await api.fechar();
});

const textoDe = (r: Awaited<ReturnType<Client["callTool"]>>): string =>
  (r.content as { type: string; text: string }[]).map((c) => c.text).join("\n");

describe("servidor MCP do ZenTrade", () => {
  it("oferece só as quatro ferramentas, e nenhuma desliga a parada total", async () => {
    const { tools } = await cliente.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      "zentrade_decisoes",
      "zentrade_explicar_decisao",
      "zentrade_parada_total",
      "zentrade_resumo",
    ]);
    const parada = tools.find((t) => t.name === "zentrade_parada_total")!;
    expect(Object.keys(parada.inputSchema.properties ?? {})).not.toContain("ligada");
  });

  it("zentrade_resumo devolve o resumo legível", async () => {
    const r = await cliente.callTool({ name: "zentrade_resumo", arguments: {} });
    expect(textoDe(r)).toMatch(/Robôs ativos: 2/);
  });

  it("zentrade_decisoes filtra por robô e limite", async () => {
    const r = await cliente.callTool({
      name: "zentrade_decisoes",
      arguments: { roboId: "robo-1", limite: 3 },
    });
    expect(textoDe(r)).toMatch(/dec-2/);
    expect(api.pedidos.at(-1)!.caminho).toBe("/api/v1/decisoes?roboId=robo-1&limite=3");
  });

  it("zentrade_explicar_decisao explica e devolve erro legível quando não existe", async () => {
    const ok = await cliente.callTool({
      name: "zentrade_explicar_decisao",
      arguments: { decisaoId: "dec-2" },
    });
    expect(textoDe(ok)).toMatch(/Motor de risco: barrou/);
    const falta = await cliente.callTool({
      name: "zentrade_explicar_decisao",
      arguments: { decisaoId: "x" },
    });
    expect(falta.isError).toBe(true);
    expect(textoDe(falta)).toMatch(/não existe/);
  });

  it("zentrade_parada_total só liga a parada", async () => {
    const r = await cliente.callTool({
      name: "zentrade_parada_total",
      arguments: { motivo: "volatilidade" },
    });
    expect(api.pedidos.at(-1)).toMatchObject({ caminho: "/api/v1/parada-total", corpo: { ligada: true } });
    expect(textoDe(r)).toMatch(/LIGADA/);
    expect(textoDe(r)).toMatch(/tela/);
  });
});
