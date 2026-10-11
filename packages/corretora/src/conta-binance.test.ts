import { describe, expect, it, vi } from "vitest";
import { ContaBinance } from "./conta-binance.js";
import { ErroLimiteRequisicoes } from "./erros.js";
import { fetchFalso, json, type Rota } from "./teste/fetch.js";

const AGORA = Date.UTC(2026, 9, 11, 12, 0, 30);
const PARES = {
  symbols: [
    { symbol: "BTCUSDT", baseAsset: "BTC", quoteAsset: "USDT" },
    { symbol: "BNBUSDT", baseAsset: "BNB", quoteAsset: "USDT" },
    { symbol: "ETHBTC", baseAsset: "ETH", quoteAsset: "BTC" },
    { symbol: "USDTBRL", baseAsset: "USDT", quoteAsset: "BRL" },
  ],
};

const fill = (id: number, extra: Record<string, unknown> = {}) => ({
  symbol: "BTCUSDT",
  id,
  orderId: 100 + id,
  orderListId: -1,
  price: "50000",
  qty: "0.01",
  quoteQty: "500",
  commission: "0.5",
  commissionAsset: "USDT",
  time: AGORA - 1000 * id,
  isBuyer: true,
  isMaker: false,
  isBestMatch: true,
  ...extra,
});

function criar(rotas: Record<string, Rota | Rota[]>, rede: "testnet" | "real" = "testnet") {
  const dormir = vi.fn(async (_ms: number) => undefined);
  const fetch = fetchFalso({
    "GET /api/v3/time": () => json({ serverTime: AGORA }),
    "GET /api/v3/exchangeInfo": () => json(PARES),
    ...rotas,
  });
  const conta = new ContaBinance({
    rede,
    apiKey: "chave",
    apiSecret: "segredo",
    fetch,
    agora: () => AGORA,
    dormir,
  });
  return { conta, fetch, dormir };
}

const chamadas = (fetch: ReturnType<typeof fetchFalso>, caminho: string) =>
  fetch.mock.calls.map(([u]) => new URL(String(u))).filter((u) => u.pathname === caminho);

describe("ContaBinance: leitura da conta (chave só de leitura basta)", () => {
  it("saldos e permissão de negociar vêm de /api/v3/account, sem zeros", async () => {
    const { conta, fetch } = criar({
      "GET /api/v3/account": () =>
        json({
          canTrade: false,
          canWithdraw: true,
          balances: [
            { asset: "BTC", free: "0.5", locked: "0.1" },
            { asset: "ETH", free: "0", locked: "0" },
          ],
        }),
    });
    const r = await conta.conta();
    expect(r.podeNegociar).toBe(false);
    expect(r.saldos.map((s) => [s.ativo, s.livre.toFixed(), s.bloqueado.toFixed()])).toEqual([
      ["BTC", "0.5", "0.1"],
    ]);
    expect(chamadas(fetch, "/api/v3/account")[0]!.searchParams.get("omitZeroBalances")).toBe("true");
  });

  it("myTrades pagina por fromId até vir uma página incompleta", async () => {
    const pagina1 = Array.from({ length: 1000 }, (_, i) => fill(i));
    const pagina2 = [fill(1000), fill(1001)];
    const { conta, fetch } = criar({
      "GET /api/v3/myTrades": [() => json(pagina1), () => json(pagina2)],
    });
    const ns = await conta.negociacoes("BTCUSDT", 0);
    expect(ns).toHaveLength(1002);
    const urls = chamadas(fetch, "/api/v3/myTrades");
    expect(urls.map((u) => [u.searchParams.get("fromId"), u.searchParams.get("limit")])).toEqual([
      ["0", "1000"],
      ["1000", "1000"],
    ]);
    expect(ns[0]).toMatchObject({ id: 0, orderId: 100, isBuyer: true });
    expect(ns[0]!.preco.toFixed()).toBe("50000");
  });

  it("allOrders liga cada ordem ao clientOrderId, paginando por orderId", async () => {
    const pagina1 = Array.from({ length: 1000 }, (_, i) => ({ orderId: 10 + i, clientOrderId: `web_${i}` }));
    const { conta, fetch } = criar({
      "GET /api/v3/allOrders": [
        () => json(pagina1),
        () => json([{ orderId: 1010, clientOrderId: "zt-abc" }]),
      ],
    });
    const ids = await conta.idsCliente("BTCUSDT", 10, 1010);
    expect(ids.get(1010)).toBe("zt-abc");
    expect(ids.get(10)).toBe("web_0");
    expect(chamadas(fetch, "/api/v3/allOrders").map((u) => u.searchParams.get("orderId"))).toEqual([
      "10",
      "1010",
    ]);
  });

  it("allOrders para quando passa da última ordem pedida", async () => {
    const pagina = Array.from({ length: 1000 }, (_, i) => ({ orderId: 10 + i, clientOrderId: "x" }));
    const { conta, fetch } = criar({ "GET /api/v3/allOrders": () => json(pagina) });
    await conta.idsCliente("BTCUSDT", 10, 20);
    expect(chamadas(fetch, "/api/v3/allOrders")).toHaveLength(1);
  });

  it("429 vira ErroLimiteRequisicoes com a espera pedida pela Binance", async () => {
    const { conta } = criar({
      "GET /api/v3/myTrades": () =>
        json({ code: -1003, msg: "Too many requests" }, 429, { "Retry-After": "30" }),
    });
    const erro = await conta.negociacoes("BTCUSDT", 0).catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(ErroLimiteRequisicoes);
    expect((erro as ErroLimiteRequisicoes).esperaMs).toBe(30_000);
  });

  it("perto do limite de peso do minuto, espera o próximo minuto antes de pedir de novo", async () => {
    const pagina1 = Array.from({ length: 1000 }, (_, i) => fill(i));
    const { conta, dormir } = criar({
      "GET /api/v3/myTrades": [
        () => json(pagina1, 200, { "X-MBX-USED-WEIGHT-1M": "4790" }),
        () => json([], 200, { "X-MBX-USED-WEIGHT-1M": "20" }),
      ],
    });
    await conta.negociacoes("BTCUSDT", 0);
    expect(dormir).toHaveBeenCalledTimes(1);
    // Faltavam 30 s para o minuto virar (mais 1 s de folga).
    expect(dormir.mock.calls[0]![0]).toBe(31_000);
  });

  it("preços atuais em USDT: par direto, par invertido (USDTBRL) e USDT = 1", async () => {
    const { conta, fetch } = criar({
      "GET /api/v3/ticker/price": () =>
        json([
          { symbol: "BTCUSDT", price: "60000" },
          { symbol: "USDTBRL", price: "5" },
          { symbol: "ETHBTC", price: "0.05" },
        ]),
    });
    const p = await conta.precosUsdt(["BTC", "BRL", "USDT", "ETH"]);
    expect([...p].map(([a, v]) => [a, v.toFixed()])).toEqual([
      ["BTC", "60000"],
      ["BRL", "0.2"],
      ["USDT", "1"],
    ]);
    expect(chamadas(fetch, "/api/v3/ticker/price")[0]!.searchParams.toString()).toBe("");
  });

  it("preço histórico pela vela de 1 min do instante; uma busca cobre 1000 minutos", async () => {
    const minuto = Math.floor(AGORA / 60_000) * 60_000;
    const vela = (abertura: number, fecha: string) => [
      abertura,
      "1",
      "1",
      "1",
      fecha,
      "1",
      abertura + 59_999,
    ];
    const { conta, fetch } = criar({
      "GET /api/v3/klines": () => json([vela(minuto - 60_000, "590"), vela(minuto, "600")]),
    });
    expect((await conta.precoHistoricoUsdt("BNB", AGORA - 60_000))?.toFixed()).toBe("590");
    expect((await conta.precoHistoricoUsdt("BNB", AGORA))?.toFixed()).toBe("600");
    expect((await conta.precoHistoricoUsdt("USDT", AGORA))?.toFixed()).toBe("1");
    const urls = chamadas(fetch, "/api/v3/klines");
    expect(urls).toHaveLength(1);
    expect(urls[0]!.searchParams.get("symbol")).toBe("BNBUSDT");
    expect(urls[0]!.searchParams.get("interval")).toBe("1m");
  });

  it("preço histórico pelo par invertido; moeda sem par com USDT dá null (sem chamar a Binance)", async () => {
    const minuto = Math.floor(AGORA / 60_000) * 60_000;
    const { conta, fetch } = criar({
      "GET /api/v3/klines": () => json([[minuto, "5", "5", "5", "4", "1", minuto + 59_999]]),
    });
    expect((await conta.precoHistoricoUsdt("BRL", AGORA))?.toFixed()).toBe("0.25");
    expect(await conta.precoHistoricoUsdt("XYZ", AGORA)).toBeNull();
    expect(chamadas(fetch, "/api/v3/klines")).toHaveLength(1);
  });

  it("vela ausente no instante dá null, não um preço inventado", async () => {
    const { conta } = criar({ "GET /api/v3/klines": () => json([]) });
    expect(await conta.precoHistoricoUsdt("BNB", AGORA)).toBeNull();
  });

  it("pares do exchangeInfo ficam em cache", async () => {
    const { conta, fetch } = criar({});
    expect((await conta.pares()).get("ETHBTC")).toEqual({ base: "ETH", cotacao: "BTC" });
    await conta.pares();
    expect(chamadas(fetch, "/api/v3/exchangeInfo")).toHaveLength(1);
  });

  it("permissões da chave: só na rede real (/sapi); a testnet não informa", async () => {
    const { conta: testnet } = criar({});
    expect(await testnet.restricoes()).toBeNull();
    const { conta: real, fetch } = criar(
      {
        "GET /sapi/v1/account/apiRestrictions": () =>
          json({
            ipRestrict: false,
            createTime: 1,
            enableReading: true,
            enableWithdrawals: true,
            enableSpotAndMarginTrading: false,
            enableMargin: false,
          }),
      },
      "real",
    );
    expect(await real.restricoes()).toEqual({
      podeLer: true,
      podeSacar: true,
      podeNegociar: false,
      ipRestrito: false,
    });
    expect(chamadas(fetch, "/sapi/v1/account/apiRestrictions")[0]!.searchParams.has("signature")).toBe(true);
  });
});
