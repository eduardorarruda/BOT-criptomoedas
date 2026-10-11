import { dec, type Candle, type Execucao, type FiltrosAtivo, type Lado, type Valor } from "@zentrade/dominio";
import type { EstadoOrdem } from "@zentrade/contratos";
import { ErroCorretora } from "./erros.js";

/** Filtro do exchangeInfo, só com os campos que o robô usa. */
export interface FiltroBinance {
  readonly filterType: string;
  readonly minQty?: string | undefined;
  readonly maxQty?: string | undefined;
  readonly stepSize?: string | undefined;
  readonly minNotional?: string | undefined;
  readonly tickSize?: string | undefined;
}

export interface FillBinance {
  readonly price: string;
  readonly qty: string;
  readonly commission: string;
  readonly commissionAsset: string;
}

export interface AtivosDoPar {
  readonly base: string;
  readonly cotacao: string;
}

const achar = (filtros: readonly FiltroBinance[], tipo: string): FiltroBinance | undefined =>
  filtros.find((f) => f.filterType === tipo);

function exigir(valor: string | undefined, filtro: string, campo: string): Valor {
  if (valor === undefined)
    throw new ErroCorretora(
      `A Binance não informou ${campo} no filtro ${filtro}; sem ele não dá para arredondar a ordem. Confira o símbolo no exchangeInfo.`,
    );
  return dec(valor);
}

/** LOT_SIZE, NOTIONAL (ou o antigo MIN_NOTIONAL) e PRICE_FILTER viram os filtros do domínio. */
export function filtrosDoSimbolo(filtros: readonly FiltroBinance[]): FiltrosAtivo {
  const lote = achar(filtros, "LOT_SIZE");
  if (!lote)
    throw new ErroCorretora(
      "O símbolo não tem filtro LOT_SIZE no exchangeInfo da Binance; sem ele não dá para dimensionar a ordem.",
    );
  const nocional = achar(filtros, "NOTIONAL") ?? achar(filtros, "MIN_NOTIONAL");
  const preco = achar(filtros, "PRICE_FILTER");
  const maxima = lote.maxQty === undefined ? null : dec(lote.maxQty);
  const base = {
    passoQuantidade: exigir(lote.stepSize, "LOT_SIZE", "stepSize"),
    quantidadeMinima: exigir(lote.minQty, "LOT_SIZE", "minQty"),
    valorMinimo: nocional?.minNotional === undefined ? dec(0) : dec(nocional.minNotional),
    passoPreco: exigir(preco?.tickSize, "PRICE_FILTER", "tickSize"),
  };
  // maxQty "0" na Binance quer dizer "sem máximo".
  return maxima && maxima.gt(0) ? { ...base, quantidadeMaxima: maxima } : base;
}

/** Linha da /api/v3/klines: [abertura, abre, máxima, mínima, fecha, volume, fechamento, ...]. */
export type LinhaKline = readonly [number, string, string, string, string, string, number, ...unknown[]];

export const candleDeKline = (k: LinhaKline): Candle => ({
  abertura: k[0],
  abre: dec(k[1]),
  maxima: dec(k[2]),
  minima: dec(k[3]),
  fecha: dec(k[4]),
  volume: dec(k[5]),
  fechamento: k[6],
});

export interface ExecucoesConvertidas {
  readonly execucoes: Execucao[];
  readonly motivo?: string;
}

function execucaoDoFill(lado: Lado, f: FillBinance, ativos: AtivosDoPar, taxa: number, em: number) {
  const preco = dec(f.price);
  const quantidade = dec(f.qty);
  const comissao = dec(f.commission);
  if (f.commissionAsset === ativos.cotacao)
    return { estimada: false, ex: { lado, preco, quantidade, taxaCotacao: comissao, em } };
  if (f.commissionAsset === ativos.base) {
    // Na compra a taxa sai do que se recebe; na venda a quantidade vendida é a do fill.
    const liquida = lado === "COMPRA" ? quantidade.minus(comissao) : quantidade;
    return {
      estimada: false,
      ex: { lado, preco, quantidade: liquida, taxaCotacao: comissao.times(preco), em },
    };
  }
  const estimativa = quantidade.times(preco).times(taxa);
  return { estimada: true, ex: { lado, preco, quantidade, taxaCotacao: estimativa, em } };
}

/**
 * Converte os fills da resposta FULL em execuções do domínio: quantidade líquida e
 * taxa em moeda de cotação. Taxa paga em terceiro ativo (BNB) não tem preço aqui;
 * é estimada pela taxa configurada e o motivo avisa.
 */
export function execucoesDosFills(
  lado: Lado,
  fills: readonly FillBinance[],
  ativos: AtivosDoPar,
  taxa: number,
  em: number,
): ExecucoesConvertidas {
  const convertidos = fills.map((f) => execucaoDoFill(lado, f, ativos, taxa, em));
  const execucoes = convertidos.map((c) => c.ex);
  const outros = [...new Set(fills.map((f) => f.commissionAsset))].filter(
    (a) => a !== ativos.base && a !== ativos.cotacao,
  );
  if (!convertidos.some((c) => c.estimada)) return { execucoes };
  return {
    execucoes,
    motivo: `Taxa paga em ${outros.join(", ")}: o valor em ${ativos.cotacao} foi estimado pela taxa configurada (${taxa * 100}%), não pelo preço real desse ativo.`,
  };
}

const ESTADOS: Record<string, EstadoOrdem> = {
  NEW: "PENDENTE",
  PENDING_NEW: "PENDENTE",
  PENDING_CANCEL: "PENDENTE",
  PARTIALLY_FILLED: "PARCIAL",
  FILLED: "PREENCHIDA",
  REJECTED: "REJEITADA",
  CANCELED: "CANCELADA",
  EXPIRED: "CANCELADA",
  EXPIRED_IN_MATCH: "CANCELADA",
};

export function estadoDaOrdem(status: string, executada: Valor): EstadoOrdem {
  const estado = ESTADOS[status];
  if (!estado)
    throw new ErroCorretora(
      `A Binance devolveu um estado de ordem desconhecido ("${status}"). Atualize o adaptador da corretora.`,
    );
  // Ordem a mercado sem liquidez para tudo: a Binance expira o resto, mas parte executou.
  return estado === "CANCELADA" && executada.gt(0) ? "PARCIAL" : estado;
}
