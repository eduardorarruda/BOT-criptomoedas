import type { DecisaoDTO, Intervalo } from "@zentrade/contratos/esquemas";
import {
  CandlestickSeries,
  createChart,
  createSeriesMarkers,
  type CandlestickData,
  type IChartApi,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type Time,
  type UTCTimestamp,
  type WhitespaceData,
} from "lightweight-charts";
import { useEffect, useRef } from "react";
import type { CandleApi } from "../../api/esquemas";
import { useMenosMovimento } from "../../ganchos/movimento";
import { useCoresGrafico } from "./cores";
import { opcoesBase } from "./opcoes";
import { marcadores, paraVela, velaComPreco } from "./velas";

/**
 * Candles com as decisões marcadas. Ao abrir, as velas entram da esquerda para a
 * direita (a escala de tempo já fica no lugar, então nada pula). Depois, cada
 * preço ao vivo estica a última vela.
 */
interface Props {
  readonly velas: readonly CandleApi[];
  readonly intervalo: Intervalo;
  readonly decisoes: readonly DecisaoDTO[];
  readonly precoAoVivo: { readonly preco: string; readonly em: number } | undefined;
  readonly rotulo: string;
  readonly altura?: number;
}

type Vela = CandlestickData<UTCTimestamp>;
const DURACAO_ENTRADA_MS = 900;

function entrarDesenhando(
  serie: ISeriesApi<"Candlestick">,
  dados: readonly Vela[],
  aoTerminar: () => void,
): () => void {
  const inicio = performance.now();
  let quadro = 0;
  const passo = (agora: number): void => {
    const t = Math.min(1, (agora - inicio) / DURACAO_ENTRADA_MS);
    const n = Math.max(1, Math.ceil(dados.length * (1 - (1 - t) ** 2)));
    const vazias: WhitespaceData<UTCTimestamp>[] = dados.slice(n).map((d) => ({ time: d.time }));
    serie.setData([...dados.slice(0, n), ...vazias]);
    if (t < 1) quadro = requestAnimationFrame(passo);
    else aoTerminar();
  };
  quadro = requestAnimationFrame(passo);
  return () => cancelAnimationFrame(quadro);
}

export function GraficoCandles({ velas, intervalo, decisoes, precoAoVivo, rotulo, altura = 420 }: Props) {
  const caixa = useRef<HTMLDivElement>(null);
  const cores = useCoresGrafico();
  const menos = useMenosMovimento();
  const refs = useRef<{
    chart: IChartApi;
    serie: ISeriesApi<"Candlestick">;
    marcas: ISeriesMarkersPluginApi<Time>;
    ultima: Vela | null;
    pronto: boolean;
  } | null>(null);

  useEffect(() => {
    const el = caixa.current;
    if (!el) return;
    const chart = createChart(el, opcoesBase(cores, intervalo !== "1d"));
    const serie = chart.addSeries(CandlestickSeries, {
      upColor: cores.ganho,
      downColor: cores.perda,
      wickUpColor: cores.ganho,
      wickDownColor: cores.perda,
      borderVisible: false,
      priceLineColor: cores.apagado,
    });
    const dados = velas.map(paraVela);
    const marcas = createSeriesMarkers(serie, []);
    const estado = { chart, serie, marcas, ultima: dados.at(-1) ?? null, pronto: false };
    refs.current = estado;
    const terminar = (): void => {
      estado.pronto = true;
      chart.timeScale().fitContent();
    };
    let cancelar = (): void => undefined;
    if (menos || dados.length === 0) {
      serie.setData(dados);
      terminar();
    } else {
      serie.setData(dados.map((d) => ({ time: d.time })));
      cancelar = entrarDesenhando(serie, dados, terminar);
    }
    chart.timeScale().fitContent();
    return () => {
      cancelar();
      chart.remove();
      refs.current = null;
    };
  }, [velas, intervalo, cores, menos]);

  useEffect(() => {
    const r = refs.current;
    const primeira = velas[0];
    if (!r || !primeira) return;
    r.marcas.setMarkers(marcadores(decisoes, intervalo, cores, primeira.abertura));
  }, [decisoes, intervalo, cores, velas]);

  useEffect(() => {
    const r = refs.current;
    if (!r?.pronto || !r.ultima || !precoAoVivo) return;
    const nova = velaComPreco(r.ultima, Number(precoAoVivo.preco), precoAoVivo.em, intervalo);
    r.serie.update(nova);
    r.ultima = nova;
  }, [precoAoVivo, intervalo]);

  return (
    <div
      ref={caixa}
      className="grafico grafico--candles"
      style={{ height: altura }}
      role="img"
      aria-label={rotulo}
    />
  );
}
