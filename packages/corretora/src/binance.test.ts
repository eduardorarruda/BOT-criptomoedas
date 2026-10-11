import type { Candle } from "@zentrade/dominio";
import { dec } from "@zentrade/dominio";
import { afterEach, describe, expect, it } from "vitest";
import { WebSocketServer } from "ws";
import { BinanceCorretora } from "./binance.js";
import { ErroCorretora, ErroOrdemIncerta } from "./erros.js";
import { esperarAte } from "./teste/esperar.js";
import { fetchFalso, json, type Rota } from "./teste/fetch.js";

const AGORA = 1_700_000_100_000;
const INFO = {
  symbols: [
    {
      symbol: "BTCUSDT",
      status: "TRADING",
      baseAsset: "BTC",
      quoteAsset: "USDT",
      filters: [
        { filterType: "PRICE_FILTER", tickSize: "0.01" },
        { filterType: "LOT_SIZE", minQty: "0.00001", maxQty: "9000", stepSize: "0.00001" },
        { filterType: "NOTIONAL", minNotional: "5" },
      ],
    },
  ],
};

function criar(rotas: Record<string, Rota | Rota[]>) {
  const fetch = fetchFalso({
    "GET /api/v3/time": () => json({ serverTime: AGORA }),
    "GET /api/v3/exchangeInfo": () => json(INFO),
    ...rotas,
  });
  const corretora = new BinanceCorretora({
    rede: "testnet",
    apiKey: "k",
    apiSecret: "s",
    fetch,
    agora: () => AGORA,
    taxaEstimada: 0.001,
    dormir: async () => undefined,
  });
  return { corretora, fetch };
}

const chamadas = (fetch: ReturnType<typeof fetchFalso>, trecho: string) =>
  fetch.mock.calls.filter(([u, init]) => `${init?.method ?? "GET"} ${String(u)}`.includes(trecho));

const ordemCheia = {
  orderId: 42,
  clientOrderId: "zt-abc",
  transactTime: AGORA,
  status: "FILLED",
  executedQty: "0.01",
  fills: [{ price: "50000", qty: "0.01", commission: "0.00001", commissionAsset: "BTC" }],
};

describe("BinanceCorretora", () => {
  it("é sempre de uma rede só e recusa rede inválida", () => {
    expect(criar({}).corretora.rede).toBe("testnet");
    expect(() => new BinanceCorretora({ rede: "papel" as "testnet" })).toThrow(/testnet/);
  });

  it("filtros vêm do exchangeInfo e ficam em cache", async () => {
    const { corretora, fetch } = criar({});
    const f = await corretora.filtros("BTCUSDT");
    await corretora.filtros("BTCUSDT");
    expect(f.valorMinimo.equals(dec(5))).toBe(true);
    expect(chamadas(fetch, "exchangeInfo")).toHaveLength(1);
    expect(String(chamadas(fetch, "exchangeInfo")[0]![0])).toContain("symbol=BTCUSDT");
  });

  it("símbolo inexistente explica o problema", async () => {
    const { corretora } = criar({ "GET /api/v3/exchangeInfo": () => json({ symbols: [] }) });
    await expect(corretora.filtros("XXXUSDT")).rejects.toThrow(/XXXUSDT/);
  });

  it("candles: só os fechados, fim exclusivo", async () => {
    const { corretora, fetch } = criar({
      "GET /api/v3/klines": () =>
        json([
          [AGORA - 180_000, "1", "2", "0.5", "1.5", "10", AGORA - 120_001],
          [AGORA - 120_000, "1.5", "2", "1", "1.8", "11", AGORA - 60_001],
          [AGORA - 60_000, "1.8", "2", "1", "1.9", "3", AGORA - 1 + 60_000], // ainda aberto
        ]),
    });
    const candles = await corretora.candles("BTCUSDT", "1m", 3, AGORA + 60_000);
    expect(candles.map((c) => c.fecha.toFixed())).toEqual(["1.5", "1.8"]);
    const url = new URL(String(chamadas(fetch, "klines")[0]![0]));
    expect(url.searchParams.get("endTime")).toBe(String(AGORA + 59_999));
    expect(url.searchParams.get("interval")).toBe("1m");
    expect(url.searchParams.get("limit")).toBe("3");
  });

  it("candles: limite fora de 1..1000 é recusado antes da rede", async () => {
    const { corretora } = criar({});
    await expect(corretora.candles("BTCUSDT", "1m", 0)).rejects.toThrow(/1 e 1000/);
    await expect(corretora.candles("BTCUSDT", "1m", 1001)).rejects.toThrow(/1 e 1000/);
  });

  it("livro de ofertas em decimais exatos", async () => {
    const { corretora } = criar({
      "GET /api/v3/depth": () => json({ bids: [["99.5", "2"]], asks: [["100.5", "1.25"]] }),
    });
    const livro = await corretora.livro("BTCUSDT", 5);
    expect(livro.compras[0]!.preco.equals(dec("99.5"))).toBe(true);
    expect(livro.vendas[0]!.quantidade.equals(dec("1.25"))).toBe(true);
  });

  it("saldo livre do ativo (zero se a conta não tem)", async () => {
    const { corretora } = criar({
      "GET /api/v3/account": () => json({ balances: [{ asset: "USDT", free: "123.45", locked: "1" }] }),
    });
    expect((await corretora.saldoLivre("USDT")).equals(dec("123.45"))).toBe(true);
    expect((await corretora.saldoLivre("BTC")).isZero()).toBe(true);
  });

  it("ordem a mercado: MARKET, FULL, idCliente e fills convertidos", async () => {
    const { corretora, fetch } = criar({ "POST /api/v3/order": () => json(ordemCheia) });
    const r = await corretora.enviarOrdemMercado({
      simbolo: "BTCUSDT",
      lado: "COMPRA",
      quantidade: dec("0.01"),
      idCliente: "zt-abc",
    });
    const url = new URL(String(chamadas(fetch, "POST")[0]![0]));
    expect(url.searchParams.get("type")).toBe("MARKET");
    expect(url.searchParams.get("side")).toBe("BUY");
    expect(url.searchParams.get("quantity")).toBe("0.01");
    expect(url.searchParams.get("newClientOrderId")).toBe("zt-abc");
    expect(url.searchParams.get("newOrderRespType")).toBe("FULL");
    expect(r.estado).toBe("PREENCHIDA");
    expect(r.idCorretora).toBe("42");
    expect(r.execucoes[0]!.quantidade.equals(dec("0.00999"))).toBe(true);
    expect(r.execucoes[0]!.taxaCotacao.equals(dec("0.5"))).toBe(true);
  });

  it("saldo insuficiente: ordem REJEITADA com o motivo em português, sem lançar", async () => {
    const { corretora } = criar({
      "POST /api/v3/order": () => json({ code: -2010, msg: "Account has insufficient balance" }, 400),
    });
    const r = await corretora.enviarOrdemMercado({
      simbolo: "BTCUSDT",
      lado: "VENDA",
      quantidade: dec("1"),
      idCliente: "zt-x",
    });
    expect(r.estado).toBe("REJEITADA");
    expect(r.motivo).toMatch(/saldo/i);
    expect(r.execucoes).toHaveLength(0);
  });

  it("falha de rede no envio: consulta pelo idCliente em vez de reenviar", async () => {
    const { corretora, fetch } = criar({
      "POST /api/v3/order": () => {
        throw new TypeError("fetch failed");
      },
      "GET /api/v3/order": () =>
        json({
          orderId: 42,
          clientOrderId: "zt-abc",
          status: "FILLED",
          executedQty: "0.01",
          updateTime: AGORA,
          side: "BUY",
        }),
      "GET /api/v3/myTrades": () =>
        json([
          {
            orderId: 42,
            time: AGORA,
            price: "50000",
            qty: "0.01",
            commission: "0.5",
            commissionAsset: "USDT",
          },
        ]),
    });
    const r = await corretora.enviarOrdemMercado({
      simbolo: "BTCUSDT",
      lado: "COMPRA",
      quantidade: dec("0.01"),
      idCliente: "zt-abc",
    });
    expect(chamadas(fetch, "POST")).toHaveLength(1);
    expect(
      new URL(
        String(chamadas(fetch, "GET https://testnet.binance.vision/api/v3/order")[0]![0]),
      ).searchParams.get("origClientOrderId"),
    ).toBe("zt-abc");
    expect(r.estado).toBe("PREENCHIDA");
    expect(r.execucoes[0]!.taxaCotacao.equals(dec("0.5"))).toBe(true);
  });

  it("falha de rede e a ordem não consta: REJEITADA, não reenviada", async () => {
    const { corretora, fetch } = criar({
      "POST /api/v3/order": () => {
        throw new DOMException("t", "TimeoutError");
      },
      "GET /api/v3/order": () => json({ code: -2013, msg: "Order does not exist." }, 400),
    });
    const r = await corretora.enviarOrdemMercado({
      simbolo: "BTCUSDT",
      lado: "COMPRA",
      quantidade: dec("0.01"),
      idCliente: "zt-abc",
    });
    expect(r.estado).toBe("REJEITADA");
    expect(r.motivo).toMatch(/não foi reenviada/);
    expect(chamadas(fetch, "POST")).toHaveLength(1);
    expect(chamadas(fetch, "GET https://testnet.binance.vision/api/v3/order?")).toHaveLength(3);
  });

  it("falha de rede no envio e na consulta: ErroOrdemIncerta, nunca reenvio às cegas", async () => {
    const falha = () => {
      throw new TypeError("fetch failed");
    };
    const { corretora, fetch } = criar({ "POST /api/v3/order": falha, "GET /api/v3/order": falha });
    const erro = await corretora
      .enviarOrdemMercado({
        simbolo: "BTCUSDT",
        lado: "COMPRA",
        quantidade: dec("0.01"),
        idCliente: "zt-abc",
      })
      .catch((e: unknown) => e);
    expect(erro).toBeInstanceOf(ErroOrdemIncerta);
    expect((erro as ErroOrdemIncerta).idCliente).toBe("zt-abc");
    expect((erro as Error).message).toMatch(/confira/i);
    expect(chamadas(fetch, "POST")).toHaveLength(1);
  });

  it("erro inesperado no envio (resposta torta) propaga, não é engolido", async () => {
    const { corretora } = criar({ "POST /api/v3/order": () => json({ estranho: true }) });
    await expect(
      corretora.enviarOrdemMercado({
        simbolo: "BTCUSDT",
        lado: "COMPRA",
        quantidade: dec("0.01"),
        idCliente: "a",
      }),
    ).rejects.toBeInstanceOf(ErroCorretora);
  });

  it("consultarOrdem: null se não existe; sem execução não busca negócios", async () => {
    const { corretora, fetch } = criar({
      "GET /api/v3/order": [
        () => json({ code: -2013, msg: "Order does not exist." }, 400),
        () =>
          json({
            orderId: 7,
            clientOrderId: "b",
            status: "NEW",
            executedQty: "0",
            updateTime: AGORA,
            side: "SELL",
          }),
      ],
    });
    expect(await corretora.consultarOrdem("BTCUSDT", "a")).toBeNull();
    const r = await corretora.consultarOrdem("BTCUSDT", "b");
    expect(r?.estado).toBe("PENDENTE");
    expect(r?.execucoes).toHaveLength(0);
    expect(chamadas(fetch, "myTrades")).toHaveLength(0);
  });

  it("consultarOrdem propaga outros erros da Binance", async () => {
    const { corretora } = criar({
      "GET /api/v3/order": () => json({ code: -1121, msg: "Invalid symbol." }, 400),
    });
    await expect(corretora.consultarOrdem("BTCUSDT", "a")).rejects.toThrow(/Invalid symbol/);
  });

  describe("assinarCandles", () => {
    let servidor: WebSocketServer | undefined;
    afterEach(async () => {
      await new Promise<void>((r) => (servidor ? servidor.close(() => r()) : r()));
    });

    it("usa o stream <símbolo>@kline_<intervalo> da rede configurada", async () => {
      servidor = new WebSocketServer({ port: 0 });
      const caminhos: string[] = [];
      servidor.on("connection", (ws, req) => {
        caminhos.push(req.url ?? "");
        ws.send(
          JSON.stringify({
            e: "kline",
            k: { t: 0, T: 299_999, o: "1", h: "1", l: "1", c: "1", v: "1", x: true },
          }),
        );
      });
      await new Promise<void>((r) => servidor!.once("listening", () => r()));
      const { port } = servidor.address() as { port: number };
      const corretora = new BinanceCorretora({ rede: "testnet", urlWebSocket: `ws://127.0.0.1:${port}` });
      const candles: Candle[] = [];
      const parar = corretora.assinarCandles("BTCUSDT", "5m", (c) => candles.push(c));
      await esperarAte(() => candles.length === 1);
      parar();
      expect(caminhos[0]).toBe("/ws/btcusdt@kline_5m");
    });
  });
});
