/**
 * Uma Binance simulada, por rota HTTP, para os testes da carteira: nada sai para a
 * internet. Guarda o estado (saldos, negociações, ordens, preços) e conta as chamadas.
 */
export interface NegociacaoFalsa {
  readonly id: number;
  readonly orderId: number;
  readonly price: string;
  readonly qty: string;
  readonly commission: string;
  readonly commissionAsset: string;
  readonly time: number;
  readonly isBuyer: boolean;
}

export interface EstadoBinanceFalsa {
  agora: number;
  saldos: { asset: string; free: string; locked: string }[];
  pares: { symbol: string; baseAsset: string; quoteAsset: string }[];
  negociacoes: Record<string, NegociacaoFalsa[]>;
  /** orderId → clientOrderId. */
  ordens: Record<number, string>;
  precos: Record<string, string>;
  /** Preço de fechamento das velas de 1 min, por par (o mesmo em todo minuto). */
  velas: Record<string, string>;
  restricoes: {
    ipRestrict: boolean;
    enableReading: boolean;
    enableWithdrawals: boolean;
    enableSpotAndMarginTrading: boolean;
  };
  /** Pares em que myTrades responde 429. */
  limiteEm: Set<string>;
  /** Chave recusada (código -2015). */
  chaveInvalida: boolean;
  chamadas: string[];
}

const resposta = (corpo: unknown, status = 200, cabecalhos: Record<string, string> = {}) =>
  new Response(JSON.stringify(corpo), {
    status,
    headers: { "content-type": "application/json", ...cabecalhos },
  });

export function estadoInicial(agora: number): EstadoBinanceFalsa {
  return {
    agora,
    saldos: [],
    pares: [
      { symbol: "BTCUSDT", baseAsset: "BTC", quoteAsset: "USDT" },
      { symbol: "ETHUSDT", baseAsset: "ETH", quoteAsset: "USDT" },
      { symbol: "BNBUSDT", baseAsset: "BNB", quoteAsset: "USDT" },
      { symbol: "ETHBTC", baseAsset: "ETH", quoteAsset: "BTC" },
    ],
    negociacoes: {},
    ordens: {},
    precos: {},
    velas: {},
    restricoes: {
      ipRestrict: true,
      enableReading: true,
      enableWithdrawals: false,
      enableSpotAndMarginTrading: true,
    },
    limiteEm: new Set(),
    chaveInvalida: false,
    chamadas: [],
  };
}

type Rota = (url: URL, e: EstadoBinanceFalsa) => Response;

function minhasNegociacoes(url: URL, e: EstadoBinanceFalsa): Response {
  const simbolo = url.searchParams.get("symbol") ?? "";
  if (e.limiteEm.has(simbolo))
    return resposta({ code: -1003, msg: "Too many requests" }, 429, { "Retry-After": "7" });
  const desde = Number(url.searchParams.get("fromId") ?? 0);
  const limite = Number(url.searchParams.get("limit") ?? 500);
  const linhas = (e.negociacoes[simbolo] ?? []).filter((n) => n.id >= desde).slice(0, limite);
  return resposta(
    linhas.map((n) => ({
      symbol: simbolo,
      ...n,
      quoteQty: (Number(n.price) * Number(n.qty)).toString(),
      orderListId: -1,
      isMaker: false,
      isBestMatch: true,
    })),
  );
}

function todasOrdens(url: URL, e: EstadoBinanceFalsa): Response {
  const desde = Number(url.searchParams.get("orderId") ?? 0);
  const ordens = Object.entries(e.ordens)
    .map(([id, cliente]) => ({ orderId: Number(id), clientOrderId: cliente, status: "FILLED" }))
    .filter((o) => o.orderId >= desde)
    .sort((a, b) => a.orderId - b.orderId);
  return resposta(ordens);
}

function velas(url: URL, e: EstadoBinanceFalsa): Response {
  const fecha = e.velas[url.searchParams.get("symbol") ?? ""];
  const inicio = Number(url.searchParams.get("startTime"));
  if (!fecha) return resposta([]);
  return resposta(
    Array.from({ length: 5 }, (_, i) => {
      const abertura = inicio + i * 60_000;
      return [abertura, fecha, fecha, fecha, fecha, "1", abertura + 59_999, "1", 1, "1", "1", "0"];
    }),
  );
}

const ROTAS: Record<string, Rota> = {
  "/api/v3/time": (_u, e) => resposta({ serverTime: e.agora }),
  "/api/v3/account": (_u, e) =>
    e.chaveInvalida
      ? resposta({ code: -2015, msg: "Invalid API-key, IP, or permissions for action." }, 401)
      : resposta({ canTrade: true, canWithdraw: true, balances: e.saldos }),
  "/api/v3/exchangeInfo": (_u, e) => resposta({ symbols: e.pares }),
  "/api/v3/myTrades": minhasNegociacoes,
  "/api/v3/allOrders": todasOrdens,
  "/api/v3/ticker/price": (_u, e) =>
    resposta(Object.entries(e.precos).map(([symbol, price]) => ({ symbol, price }))),
  "/api/v3/klines": velas,
  "/sapi/v1/account/apiRestrictions": (_u, e) => resposta({ ...e.restricoes, createTime: 1 }),
};

export function fetchDaBinanceFalsa(e: EstadoBinanceFalsa): typeof fetch {
  return async (entrada) => {
    const url = new URL(String(entrada));
    e.chamadas.push(url.pathname);
    const rota = ROTAS[url.pathname];
    if (!rota) return resposta({ code: -1, msg: `rota não simulada: ${url.pathname}` }, 404);
    return rota(url, e);
  };
}
