import { z } from "zod";

/** Respostas da API spot da Binance, só com os campos usados. Validadas na borda. */
export const RespostaErro = z.object({ code: z.number(), msg: z.string() });
export const RespostaTempo = z.object({ serverTime: z.number() });

const Filtro = z.object({
  filterType: z.string(),
  minQty: z.string().optional(),
  maxQty: z.string().optional(),
  stepSize: z.string().optional(),
  minNotional: z.string().optional(),
  tickSize: z.string().optional(),
});

export const RespostaExchangeInfo = z.object({
  symbols: z.array(
    z.object({
      symbol: z.string(),
      status: z.string(),
      baseAsset: z.string(),
      quoteAsset: z.string(),
      filters: z.array(Filtro),
    }),
  ),
});

export const RespostaKlines = z.array(
  z
    .tuple([z.number(), z.string(), z.string(), z.string(), z.string(), z.string(), z.number()])
    .rest(z.unknown()),
);

const Nivel = z.tuple([z.string(), z.string()]);
export const RespostaLivro = z.object({ bids: z.array(Nivel), asks: z.array(Nivel) });

export const RespostaConta = z.object({
  balances: z.array(z.object({ asset: z.string(), free: z.string(), locked: z.string() })),
});

const Fill = z.object({
  price: z.string(),
  qty: z.string(),
  commission: z.string(),
  commissionAsset: z.string(),
});

export const RespostaOrdemFull = z.object({
  orderId: z.number(),
  clientOrderId: z.string(),
  transactTime: z.number(),
  status: z.string(),
  executedQty: z.string(),
  fills: z.array(Fill),
});

export const RespostaConsultaOrdem = z.object({
  orderId: z.number(),
  clientOrderId: z.string(),
  status: z.string(),
  executedQty: z.string(),
  updateTime: z.number(),
  side: z.enum(["BUY", "SELL"]),
});

export const RespostaNegocios = z.array(Fill.extend({ orderId: z.number(), time: z.number() }));

/** /api/v3/account com o que a carteira e o status usam. */
export const RespostaContaCompleta = RespostaConta.extend({
  canTrade: z.boolean(),
  canWithdraw: z.boolean().optional(),
});

/** /api/v3/myTrades: um fill por linha. */
export const RespostaMinhasNegociacoes = z.array(
  z.object({
    symbol: z.string(),
    id: z.number().int(),
    orderId: z.number().int(),
    price: z.string(),
    qty: z.string(),
    quoteQty: z.string(),
    commission: z.string(),
    commissionAsset: z.string(),
    time: z.number().int(),
    isBuyer: z.boolean(),
  }),
);

/** /api/v3/allOrders: só o que liga a ordem ao clientOrderId. */
export const RespostaTodasOrdens = z.array(
  z.object({ orderId: z.number().int(), clientOrderId: z.string() }),
);

/** /api/v3/ticker/price sem símbolo: todos os pares. */
export const RespostaPrecos = z.array(z.object({ symbol: z.string(), price: z.string() }));

/** /api/v3/exchangeInfo de todos os pares, só nomes (o completo tem filtros que a carteira não usa). */
export const RespostaPares = z.object({
  symbols: z.array(z.object({ symbol: z.string(), baseAsset: z.string(), quoteAsset: z.string() })),
});

/** /sapi/v1/account/apiRestrictions: permissões da chave (só na rede real). */
export const RespostaRestricoes = z.object({
  ipRestrict: z.boolean(),
  enableReading: z.boolean(),
  enableWithdrawals: z.boolean(),
  enableSpotAndMarginTrading: z.boolean(),
});
