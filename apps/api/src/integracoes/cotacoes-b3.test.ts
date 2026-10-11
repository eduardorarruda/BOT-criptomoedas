import { describe, expect, it, vi } from "vitest";
import { criarClienteCotacoesB3 } from "./cotacoes-b3.js";

const resposta = (status: number, corpo: unknown) =>
  new Response(JSON.stringify(corpo), { status, headers: { "content-type": "application/json" } });

const cotacao = (symbol: string, preco: number) => ({
  results: [
    { symbol, regularMarketPrice: preco, currency: "BRL", regularMarketTime: "2026-10-09T20:07:00.000Z" },
  ],
});

function montar(fetchFalso: typeof fetch, agora = { t: 1_000_000 }) {
  return criarClienteCotacoesB3({ token: "token-de-teste-123", fetch: fetchFalso, agora: () => agora.t });
}

describe("cotações da B3 pela brapi", () => {
  it("sem token não chama a rede e explica como ligar", async () => {
    const f = vi.fn<typeof fetch>();
    const c = criarClienteCotacoesB3({ fetch: f });
    const r = await c.cotar(["HGLG11"]);
    expect(c.configurado).toBe(false);
    expect(f).not.toHaveBeenCalled();
    expect(r.indisponiveis[0]!.motivo).toMatch(/BRAPI_TOKEN/);
  });

  it("um pedido por ticker, token no cabeçalho (não na URL), preço em decimal exato", async () => {
    const f = vi.fn<typeof fetch>(async () => resposta(200, cotacao("HGLG11", 158.3)));
    const r = await montar(f).cotar(["hglg11"]);
    const [url, init] = f.mock.calls[0]!;
    expect(String(url)).toBe("https://brapi.dev/api/quote/HGLG11");
    expect(String(url)).not.toContain("token");
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer token-de-teste-123");
    expect(r.cotacoes).toEqual([
      {
        ticker: "HGLG11",
        preco: expect.anything(),
        moeda: "BRL",
        em: Date.parse("2026-10-09T20:07:00.000Z"),
      },
    ]);
    expect(r.cotacoes[0]!.preco.toString()).toBe("158.3");
  });

  it("guarda em cache por 30 minutos", async () => {
    const agora = { t: 1_000_000 };
    const f = vi.fn<typeof fetch>(async () => resposta(200, cotacao("KNRI11", 140)));
    const c = montar(f, agora);
    await c.cotar(["KNRI11"]);
    await c.cotar(["KNRI11", "KNRI11"]);
    expect(f).toHaveBeenCalledTimes(1);
    agora.t += 31 * 60_000;
    await c.cotar(["KNRI11"]);
    expect(f).toHaveBeenCalledTimes(2);
  });

  it("traduz os erros da brapi em motivos para a pessoa", async () => {
    const porTicker: Record<string, Response | Error> = {
      AAAA11: resposta(401, { error: true }),
      BBBB11: resposta(404, { error: true, message: "não encontrado" }),
      CCCC11: resposta(429, {}),
      DDDD11: resposta(500, {}),
      EEEE11: new TypeError("fetch failed"),
      FFFF11: resposta(200, { results: [{ symbol: "FFFF11", regularMarketPrice: 0 }] }),
      GGGG11: resposta(200, { resultados: [] }),
    };
    const f = vi.fn<typeof fetch>(async (url) => {
      const r = porTicker[String(url).split("/").pop()!]!;
      if (r instanceof Error) throw r;
      return r;
    });
    const r = await montar(f).cotar(Object.keys(porTicker));
    const motivo = Object.fromEntries(r.indisponiveis.map((i) => [i.ticker, i.motivo]));
    expect(motivo.AAAA11).toMatch(/token/);
    expect(motivo.BBBB11).toMatch(/não encontrado/);
    expect(motivo.CCCC11).toMatch(/limite/);
    expect(motivo.DDDD11).toMatch(/500/);
    expect(motivo.EEEE11).toMatch(/falar com a brapi/);
    expect(motivo.FFFF11).toMatch(/preço/);
    expect(motivo.GGGG11).toMatch(/formato/);
    expect(r.cotacoes).toEqual([]);
  });

  it("recusa ticker estranho sem chamar a rede e limita a quantidade", async () => {
    const f = vi.fn<typeof fetch>(async () => resposta(200, cotacao("X", 1)));
    const c = montar(f);
    const r = await c.cotar(["../admin", "PETR4?token=x"]);
    expect(f).not.toHaveBeenCalled();
    expect(r.indisponiveis.map((i) => i.motivo)).toEqual([
      expect.stringMatching(/ticker inválido/),
      expect.stringMatching(/ticker inválido/),
    ]);
    const muitos = Array.from({ length: 30 }, (_, i) => `TK${String(i).padStart(2, "0")}11`);
    expect((await c.cotar(muitos)).indisponiveis.length + f.mock.calls.length).toBe(30);
    expect(f.mock.calls.length).toBeLessThanOrEqual(20);
  });

  it("guarda o erro por pouco tempo para não martelar a brapi", async () => {
    const agora = { t: 0 };
    const f = vi.fn<typeof fetch>(async () => resposta(500, {}));
    const c = montar(f, agora);
    await c.cotar(["HGLG11"]);
    await c.cotar(["HGLG11"]);
    expect(f).toHaveBeenCalledTimes(1);
    agora.t += 6 * 60_000;
    await c.cotar(["HGLG11"]);
    expect(f).toHaveBeenCalledTimes(2);
  });
});

describe("teto do cache", () => {
  it("o ticker mais antigo sai quando passa de 500", async () => {
    const f = vi.fn<typeof fetch>(async (url) => resposta(200, cotacao(String(url).split("/").pop()!, 10)));
    const c = montar(f);
    for (let lote = 0; lote < 26; lote++) {
      await c.cotar(Array.from({ length: 20 }, (_, i) => `T${String(lote * 20 + i).padStart(4, "0")}`));
    }
    expect(f).toHaveBeenCalledTimes(520);
    await c.cotar(["T0000"]);
    expect(f).toHaveBeenCalledTimes(521);
    await c.cotar(["T0519"]);
    expect(f).toHaveBeenCalledTimes(521);
  });
});
