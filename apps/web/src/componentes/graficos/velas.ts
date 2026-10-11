import type { DecisaoDTO } from "@zentrade/contratos";
import { MS_POR_INTERVALO, type Intervalo } from "@zentrade/contratos";
import type { CandlestickData, SeriesMarker, UTCTimestamp } from "lightweight-charts";
import type { CandleApi } from "../../api/esquemas";
import type { CoresGrafico } from "./cores";

/**
 * Conversões para o gráfico de candles. O gráfico precisa de número: a conversão
 * acontece só aqui, para desenhar — nenhuma conta de dinheiro sai daqui.
 */
export const segundos = (ms: number): UTCTimestamp => Math.floor(ms / 1000) as UTCTimestamp;

export function paraVela(c: CandleApi): CandlestickData<UTCTimestamp> {
  return {
    time: segundos(c.abertura),
    open: Number(c.abre),
    high: Number(c.maxima),
    low: Number(c.minima),
    close: Number(c.fecha),
  };
}

/** Atualiza a última vela com o preço novo ou abre a próxima, se o intervalo virou. */
export function velaComPreco(
  ultima: CandlestickData<UTCTimestamp>,
  preco: number,
  em: number,
  intervalo: Intervalo,
): CandlestickData<UTCTimestamp> {
  const passo = MS_POR_INTERVALO[intervalo];
  const abertura = segundos(Math.floor(em / passo) * passo);
  if (abertura > ultima.time)
    return {
      time: abertura,
      open: ultima.close,
      high: Math.max(ultima.close, preco),
      low: Math.min(ultima.close, preco),
      close: preco,
    };
  return { ...ultima, high: Math.max(ultima.high, preco), low: Math.min(ultima.low, preco), close: preco };
}

export interface EstiloMarcador {
  readonly rotulo: string;
  readonly forma: SeriesMarker<UTCTimestamp>["shape"];
  readonly posicao: "aboveBar" | "belowBar";
  readonly cor: keyof CoresGrafico;
}

/** Como cada decisão aparece no gráfico (a legenda abaixo usa os mesmos rótulos). */
export function estiloDecisao(d: DecisaoDTO): EstiloMarcador {
  const compra = d.sinal.acao !== "VENDER";
  const posicao = compra ? "belowBar" : "aboveBar";
  switch (d.estado) {
    case "executada":
    case "aprovada":
      return {
        rotulo: compra ? "Compra" : "Venda",
        forma: compra ? "arrowUp" : "arrowDown",
        posicao,
        cor: compra ? "marca" : "texto",
      };
    case "barrada":
      return { rotulo: "Barrada", forma: "circle", posicao, cor: "atencao" };
    case "aguardando_aprovacao":
      return { rotulo: "Aguarda você", forma: "square", posicao, cor: "atencao" };
    case "falhou":
      return { rotulo: "Falhou", forma: "circle", posicao, cor: "perda" };
    default:
      return { rotulo: "Só registro", forma: "circle", posicao, cor: "apagado" };
  }
}

export function marcadores(
  decisoes: readonly DecisaoDTO[],
  intervalo: Intervalo,
  cores: CoresGrafico,
  inicio: number,
): SeriesMarker<UTCTimestamp>[] {
  const passo = MS_POR_INTERVALO[intervalo];
  return decisoes
    .filter((d) => d.em >= inicio)
    .map((d) => {
      const e = estiloDecisao(d);
      // "Só registro" fica sem texto para não poluir: o círculo cinza e a legenda bastam.
      const texto = e.cor === "apagado" ? "" : e.rotulo;
      return {
        time: segundos(Math.floor(d.em / passo) * passo),
        position: e.posicao,
        shape: e.forma,
        color: cores[e.cor],
        text: texto,
      };
    })
    .sort((a, b) => a.time - b.time);
}
