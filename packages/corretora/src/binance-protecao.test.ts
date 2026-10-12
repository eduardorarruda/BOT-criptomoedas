import type { PedidoProtecao } from "@zentrade/contratos";
import { dec } from "@zentrade/dominio";
import { describe, expect, it } from "vitest";
import { BinanceCorretora } from "./binance.js";
import { ErroOrdemIncerta, ErroRede } from "./erros.js";
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

const chamadas = (fetch: ReturnType<typeof fetchFalso>, metodoECaminho: string) =>
  fetch.mock.calls.filter(
    ([u, init]) => `${init?.method ?? "GET"} ${new URL(String(u)).pathname}` === metodoECaminho,
  );

const parametros = (fetch: ReturnType<typeof fetchFalso>, metodoECaminho: string, i = 0) =>
  new URL(String(chamadas(fetch, metodoECaminho)[i]![0])).searchParams;

const IDS = { lista: "zt-lista", stop: "zt-stop", alvo: "zt-alvo" };
const OCO: PedidoProtecao = {
  simbolo: "BTCUSDT",
  quantidade: dec("0.01"),
  stop: dec("58800"),
  limite: dec("58212"),
  alvo: dec("61200.5"),
  ids: IDS,
};
const { alvo: _alvo, ...SEM_ALVO } = OCO;
const STOP: PedidoProtecao = { ...SEM_ALVO, ids: { lista: "zt-stop", stop: "zt-stop" } };

const relatorio = (
  orderId: number,
  clientOrderId: string,
  type: string,
  status = "NEW",
  executedQty = "0",
) => ({
  symbol: "BTCUSDT",
  orderId,
  orderListId: 7,
  clientOrderId,
  transactTime: AGORA,
  price: "0",
  origQty: "0.01",
  executedQty,
  status,
  type,
  side: "SELL",
});

const respostaOco = {
  orderListId: 7,
  contingencyType: "OCO",
  listStatusType: "EXEC_STARTED",
  listOrderStatus: "EXECUTING",
  listClientOrderId: "zt-lista",
  transactionTime: AGORA,
  symbol: "BTCUSDT",
  orders: [
    { symbol: "BTCUSDT", orderId: 11, clientOrderId: "zt-stop" },
    { symbol: "BTCUSDT", orderId: 12, clientOrderId: "zt-alvo" },
  ],
  orderReports: [relatorio(11, "zt-stop", "STOP_LOSS_LIMIT"), relatorio(12, "zt-alvo", "LIMIT_MAKER")],
};

const consulta = (
  orderId: number,
  clientOrderId: string,
  status: string,
  executedQty = "0",
  orderListId = 7,
) => ({
  orderId,
  orderListId,
  clientOrderId,
  status,
  executedQty,
  updateTime: AGORA,
  side: "SELL",
});

/** GET /api/v3/order respondendo por origClientOrderId. */
const porId =
  (respostas: Record<string, unknown>): Rota =>
  (url) => {
    const r = respostas[url.searchParams.get("origClientOrderId") ?? ""];
    return r ? json(r) : json({ code: -2013, msg: "Order does not exist." }, 400);
  };

const negocio = {
  price: "58790",
  qty: "0.01",
  commission: "0.5879",
  commissionAsset: "USDT",
  orderId: 11,
  time: AGORA,
};

describe("BinanceCorretora: proteção na corretora", () => {
  it("com alvo: OCO pelo endpoint novo (alvo LIMIT_MAKER acima, stop-limit abaixo) e ids nossos", async () => {
    const { corretora, fetch } = criar({ "POST /api/v3/orderList/oco": () => json(respostaOco) });
    const r = await corretora.colocarProtecao(OCO);
    const p = parametros(fetch, "POST /api/v3/orderList/oco");
    expect(
      Object.fromEntries([...p].filter(([k]) => !["timestamp", "recvWindow", "signature"].includes(k))),
    ).toEqual({
      symbol: "BTCUSDT",
      side: "SELL",
      quantity: "0.01",
      listClientOrderId: "zt-lista",
      aboveType: "LIMIT_MAKER",
      abovePrice: "61200.5",
      aboveClientOrderId: "zt-alvo",
      belowType: "STOP_LOSS_LIMIT",
      belowStopPrice: "58800",
      belowPrice: "58212",
      belowTimeInForce: "GTC",
      belowClientOrderId: "zt-stop",
      newOrderRespType: "RESULT",
    });
    expect(r.estado).toBe("ATIVA");
    expect(r.idCorretora).toBe("7");
    expect(r.pernas.map((x) => [x.perna, x.ordem.idCliente, x.ordem.idCorretora, x.ordem.estado])).toEqual([
      ["stop", "zt-stop", "11", "PENDENTE"],
      ["alvo", "zt-alvo", "12", "PENDENTE"],
    ]);
  });

  it("sem alvo: STOP_LOSS_LIMIT GTC com stopPrice e price (limite)", async () => {
    const { corretora, fetch } = criar({
      "POST /api/v3/order": () =>
        json({ ...relatorio(21, "zt-stop", "STOP_LOSS_LIMIT"), orderListId: -1, timeInForce: "GTC" }),
    });
    const r = await corretora.colocarProtecao(STOP);
    const p = parametros(fetch, "POST /api/v3/order");
    expect(p.get("type")).toBe("STOP_LOSS_LIMIT");
    expect(p.get("side")).toBe("SELL");
    expect(p.get("timeInForce")).toBe("GTC");
    expect(p.get("stopPrice")).toBe("58800");
    expect(p.get("price")).toBe("58212");
    expect(p.get("quantity")).toBe("0.01");
    expect(p.get("newClientOrderId")).toBe("zt-stop");
    expect(r.estado).toBe("ATIVA");
    expect(r.idCorretora).toBe("21");
    expect(r.pernas.map((x) => x.perna)).toEqual(["stop"]);
  });

  it("recusa da Binance (dispararia na hora): REJEITADA com o motivo, sem lançar", async () => {
    const { corretora } = criar({
      "POST /api/v3/orderList/oco": () => json({ code: -2010, msg: "Order would trigger immediately." }, 400),
    });
    const r = await corretora.colocarProtecao(OCO);
    expect(r.estado).toBe("REJEITADA");
    expect(r.motivo).toMatch(/trigger immediately/);
    expect(r.idCorretora).toBeNull();
  });

  it("falha de rede ao colocar: confere pelos ids em vez de colocar de novo", async () => {
    const { corretora, fetch } = criar({
      "POST /api/v3/orderList/oco": () => Promise.reject(new TypeError("fetch failed")),
      "GET /api/v3/order": porId({
        "zt-stop": consulta(11, "zt-stop", "NEW"),
        "zt-alvo": consulta(12, "zt-alvo", "NEW"),
      }),
    });
    const r = await corretora.colocarProtecao(OCO);
    expect(r.estado).toBe("ATIVA");
    expect(r.idCorretora).toBe("7");
    expect(chamadas(fetch, "POST /api/v3/orderList/oco")).toHaveLength(1);
  });

  it("falha de rede e a proteção não consta: REJEITADA, não recolocada", async () => {
    const { corretora, fetch } = criar({
      "POST /api/v3/orderList/oco": () => Promise.reject(new TypeError("fetch failed")),
      "GET /api/v3/order": porId({}),
    });
    const r = await corretora.colocarProtecao(OCO);
    expect(r.estado).toBe("REJEITADA");
    expect(r.motivo).toMatch(/não consta/);
    expect(chamadas(fetch, "POST /api/v3/orderList/oco")).toHaveLength(1);
  });

  it("falha de rede ao colocar e ao conferir: ErroOrdemIncerta", async () => {
    const { corretora } = criar({
      "POST /api/v3/orderList/oco": () => Promise.reject(new TypeError("fetch failed")),
      "GET /api/v3/order": () => Promise.reject(new TypeError("fetch failed")),
    });
    await expect(corretora.colocarProtecao(OCO)).rejects.toBeInstanceOf(ErroOrdemIncerta);
  });

  it("consultar: stop executado e alvo expirado = EXECUTADA, com as execuções do stop", async () => {
    const { corretora, fetch } = criar({
      "GET /api/v3/order": porId({
        "zt-stop": consulta(11, "zt-stop", "FILLED", "0.01"),
        "zt-alvo": consulta(12, "zt-alvo", "EXPIRED"),
      }),
      "GET /api/v3/myTrades": () => json([negocio]),
    });
    const r = await corretora.consultarProtecao("BTCUSDT", IDS);
    expect(r?.estado).toBe("EXECUTADA");
    expect(r?.idCorretora).toBe("7");
    const [stop, alvo] = r!.pernas;
    expect(stop?.ordem.estado).toBe("PREENCHIDA");
    expect(stop?.ordem.execucoes).toHaveLength(1);
    expect(stop?.ordem.execucoes[0]?.lado).toBe("VENDA");
    expect(stop?.ordem.execucoes[0]?.preco.equals(dec(58790))).toBe(true);
    expect(alvo?.ordem.estado).toBe("CANCELADA");
    expect(parametros(fetch, "GET /api/v3/myTrades").get("orderId")).toBe("11");
  });

  it("consultar: stop executado em parte e ainda no livro = ATIVA, com a parte executada", async () => {
    const { corretora } = criar({
      "GET /api/v3/order": porId({
        "zt-stop": consulta(11, "zt-stop", "PARTIALLY_FILLED", "0.004"),
        "zt-alvo": consulta(12, "zt-alvo", "EXPIRED"),
      }),
      "GET /api/v3/myTrades": () => json([{ ...negocio, qty: "0.004", commission: "0.23" }]),
    });
    const r = await corretora.consultarProtecao("BTCUSDT", IDS);
    expect(r?.estado).toBe("ATIVA");
    expect(r?.pernas[0]?.ordem.estado).toBe("PARCIAL");
    expect(r?.pernas[0]?.ordem.execucoes[0]?.quantidade.equals(dec("0.004"))).toBe(true);
  });

  it("consultar: as duas pernas canceladas = CANCELADA; nenhuma perna conhecida = null", async () => {
    const canceladas = criar({
      "GET /api/v3/order": porId({
        "zt-stop": consulta(11, "zt-stop", "CANCELED"),
        "zt-alvo": consulta(12, "zt-alvo", "CANCELED"),
      }),
    });
    expect((await canceladas.corretora.consultarProtecao("BTCUSDT", IDS))?.estado).toBe("CANCELADA");
    const nenhuma = criar({ "GET /api/v3/order": porId({}) });
    expect(await nenhuma.corretora.consultarProtecao("BTCUSDT", IDS)).toBeNull();
  });

  it("stop sozinho: consulta uma perna só e o id da corretora é o da ordem", async () => {
    const { corretora, fetch } = criar({
      "GET /api/v3/order": porId({ "zt-stop": consulta(21, "zt-stop", "NEW", "0", -1) }),
    });
    const r = await corretora.consultarProtecao("BTCUSDT", STOP.ids);
    expect(r?.idCorretora).toBe("21");
    expect(chamadas(fetch, "GET /api/v3/order")).toHaveLength(1);
  });

  it("cancelar OCO: DELETE /api/v3/orderList pelo listClientOrderId e devolve o estado final", async () => {
    const { corretora, fetch } = criar({
      "DELETE /api/v3/orderList": () => json({ ...respostaOco, listStatusType: "ALL_DONE" }),
      "GET /api/v3/order": porId({
        "zt-stop": consulta(11, "zt-stop", "CANCELED"),
        "zt-alvo": consulta(12, "zt-alvo", "CANCELED"),
      }),
    });
    const r = await corretora.cancelarProtecao("BTCUSDT", IDS);
    const p = parametros(fetch, "DELETE /api/v3/orderList");
    expect(p.get("listClientOrderId")).toBe("zt-lista");
    expect(p.get("symbol")).toBe("BTCUSDT");
    expect(r?.estado).toBe("CANCELADA");
  });

  it("cancelar stop sozinho: DELETE /api/v3/order pelo origClientOrderId", async () => {
    const { corretora, fetch } = criar({
      "DELETE /api/v3/order": () => json({ orderId: 21, status: "CANCELED" }),
      "GET /api/v3/order": porId({ "zt-stop": consulta(21, "zt-stop", "CANCELED", "0", -1) }),
    });
    const r = await corretora.cancelarProtecao("BTCUSDT", STOP.ids);
    expect(parametros(fetch, "DELETE /api/v3/order").get("origClientOrderId")).toBe("zt-stop");
    expect(r?.estado).toBe("CANCELADA");
  });

  it("cancelar o que já executou (-2011): devolve EXECUTADA com as execuções, sem erro", async () => {
    const { corretora } = criar({
      "DELETE /api/v3/orderList": () => json({ code: -2011, msg: "Unknown order sent." }, 400),
      "GET /api/v3/order": porId({
        "zt-stop": consulta(11, "zt-stop", "FILLED", "0.01"),
        "zt-alvo": consulta(12, "zt-alvo", "EXPIRED"),
      }),
      "GET /api/v3/myTrades": () => json([negocio]),
    });
    const r = await corretora.cancelarProtecao("BTCUSDT", IDS);
    expect(r?.estado).toBe("EXECUTADA");
    expect(r?.pernas[0]?.ordem.execucoes).toHaveLength(1);
  });

  it("cancelar sem resposta da Binance: lança (não dá para saber se saiu do livro)", async () => {
    const { corretora } = criar({
      "DELETE /api/v3/orderList": () => Promise.reject(new TypeError("fetch failed")),
    });
    await expect(corretora.cancelarProtecao("BTCUSDT", IDS)).rejects.toBeInstanceOf(ErroRede);
  });
});
