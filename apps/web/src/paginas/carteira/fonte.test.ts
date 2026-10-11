import { CarteiraEsquema } from "@zentrade/contratos/esquemas";
import { describe, expect, it, vi } from "vitest";
import { criarCliente } from "../../api/cliente";
import { carteiraDemo } from "./demo";
import { criarFonteCarteira, criarFonteCarteiraDemo } from "./fonte";

const resposta = (corpo: unknown) =>
  new Response(JSON.stringify(corpo), { status: 200, headers: { "content-type": "application/json" } });

describe("fonte da carteira", () => {
  it("fala com as rotas do contrato e manda o CSRF na sincronização", async () => {
    const chamadas: { url: string; init: RequestInit }[] = [];
    const fetch = vi.fn(async (url: RequestInfo | URL, init: RequestInit = {}) => {
      chamadas.push({ url: String(url), init });
      const caminho = new URL(String(url), "http://x").pathname;
      if (caminho.endsWith("/sincronizar"))
        return resposta({
          rede: "real",
          em: 1,
          negociacoesNovas: 0,
          simbolos: [],
          saldos: 0,
          parcial: false,
          avisos: [],
        });
      if (caminho.endsWith("/binance/status")) return resposta({ contas: [] });
      return resposta(carteiraDemo());
    });
    const fonte = criarFonteCarteira(criarCliente({ base: "/api/v1", fetch, lerCsrf: () => "csrf-x" }));
    await fonte.carteira("real");
    await fonte.sincronizar("real");
    await fonte.sincronizar();
    await fonte.status();
    expect(chamadas.map((c) => c.url)).toEqual([
      "/api/v1/carteira?rede=real",
      "/api/v1/carteira/sincronizar",
      "/api/v1/carteira/sincronizar",
      "/api/v1/binance/status",
    ]);
    expect(new Headers(chamadas[1]!.init.headers).get("X-CSRF-Token")).toBe("csrf-x");
    expect(chamadas[1]!.init.body).toBe(JSON.stringify({ rede: "real" }));
    expect(chamadas[2]!.init.body).toBe("{}");
  });

  it("detalhe pede a moeda no caminho", async () => {
    const fetch = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) =>
      resposta({ rede: "real", precosEm: null, moeda: carteiraDemo().moedas[0], negociacoes: [] }),
    );
    const fonte = criarFonteCarteira(criarCliente({ base: "/api/v1", fetch }));
    expect((await fonte.ativo("BTC")).rede).toBe("real");
    expect(String(fetch.mock.calls[0]![0])).toBe("/api/v1/carteira/BTC");
  });

  it("demonstração: carteira válida pelo contrato, moeda desconhecida dá 404", async () => {
    const demo = criarFonteCarteiraDemo();
    expect(CarteiraEsquema.safeParse(await demo.carteira()).success).toBe(true);
    await expect(demo.ativo("XYZ")).rejects.toMatchObject({ status: 404 });
    expect((await demo.sincronizar()).parcial).toBe(false);
    expect((await demo.status()).contas).toHaveLength(1);
  });
});
