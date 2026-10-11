import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { subirApiFalsa, TOKEN_TESTE, type ApiFalsa } from "../teste/api-falsa.js";
import { ClienteApi, configDaApi, ErroApi } from "./cliente-api.js";

let api: ApiFalsa;
beforeAll(async () => {
  api = await subirApiFalsa();
});
afterAll(async () => api.fechar());

describe("ClienteApi", () => {
  it("lê o resumo e as decisões com o token no cabeçalho", async () => {
    const c = new ClienteApi({ url: api.url, token: TOKEN_TESTE });
    await expect(c.resumo()).resolves.toMatchObject({ robosAtivos: 2, paradaTotal: false });
    const lista = await c.decisoes({ roboId: "robo-1", limite: 5 });
    expect(lista.map((d) => d.id)).toEqual(["dec-2"]);
    expect(api.pedidos.at(-1)!.caminho).toBe("/api/v1/decisoes?roboId=robo-1&limite=5");
  });

  it("transforma o erro da API em ErroApi com código e mensagem", async () => {
    const c = new ClienteApi({ url: api.url, token: TOKEN_TESTE });
    const e = await c.decisao("nao-existe").catch((x: unknown) => x as ErroApi);
    expect(e).toBeInstanceOf(ErroApi);
    expect(e).toMatchObject({ status: 404, codigo: "nao_encontrado" });
    const semToken = new ClienteApi({ url: api.url, token: "errado" });
    await expect(semToken.resumo()).rejects.toThrow(/ZENTRADE_TOKEN/);
  });

  it("explica quando a API está fora do ar", async () => {
    const c = new ClienteApi({ url: "http://127.0.0.1:1", token: TOKEN_TESTE });
    await expect(c.resumo()).rejects.toThrow(/ZENTRADE_API_URL/);
  });

  it("recusa resposta fora do formato", async () => {
    const fetch = async () => new Response(JSON.stringify({ nada: 1 }));
    await expect(new ClienteApi({ url: api.url, token: TOKEN_TESTE, fetch }).resumo()).rejects.toThrow(
      /formato/,
    );
  });

  it("lê a configuração do ambiente e exige o token", () => {
    expect(() => configDaApi({})).toThrow(/ZENTRADE_TOKEN/);
    expect(configDaApi({ ZENTRADE_TOKEN: "t" })).toEqual({ url: "http://localhost:8080", token: "t" });
    expect(() => configDaApi({ ZENTRADE_TOKEN: "t", ZENTRADE_API_URL: "nao-url" })).toThrow(
      /ZENTRADE_API_URL/,
    );
  });
});
