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
