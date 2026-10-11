import type { Intervalo } from "@zentrade/contratos/esquemas";
import {
  CandlestickSeries,
  createChart,
  createSeriesMarkers,
  LineStyle,
  type CandlestickData,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type SeriesMarker,
  type Time,
  type UTCTimestamp,
  type WhitespaceData,
} from "lightweight-charts";
import { useEffect, useRef } from "react";
import type { CandleApi } from "../../api/esquemas";
import { useMenosMovimento } from "../../ganchos/movimento";
import { useCoresGrafico, type CoresGrafico } from "./cores";
import { opcoesBase } from "./opcoes";
import { paraVela, velaComPreco } from "./velas";

/**
 * Candles com marcas (decisões ou execuções) e, se houver, linhas de preço (stop e
 * alvo). Ao abrir, as velas entram da esquerda para a direita (a escala de tempo já
 * fica no lugar, então nada pula). Depois, cada candle fechado ao vivo entra no
 * lugar e cada preço ao vivo estica a última vela.
 */
export interface LinhaPreco {
  readonly preco: string;
  readonly rotulo: string;
  readonly cor: keyof CoresGrafico;
}

interface Props {
  readonly velas: readonly CandleApi[];
  readonly intervalo: Intervalo;
  /** Monta as marcas com as cores do tema e o início da primeira vela (memorize com useCallback). */
  readonly marcar: (cores: CoresGrafico, inicio: number) => SeriesMarker<UTCTimestamp>[];
  readonly precoAoVivo: { readonly preco: string; readonly em: number } | undefined;
  /** Candles fechados que chegaram ao vivo depois da carga (eventos "candle"). */
  readonly fechadas?: readonly CandleApi[];
  readonly linhas?: readonly LinhaPreco[];
  readonly rotulo: string;
  readonly altura?: number;
  /** Mostra só as últimas N velas ao abrir (o resto fica a um arrasto); sem isso, todas. */
  readonly janela?: number;
}

type Vela = CandlestickData<UTCTimestamp>;
interface Estado {
  readonly chart: IChartApi;
  readonly serie: ISeriesApi<"Candlestick">;
  readonly marcas: ISeriesMarkersPluginApi<Time>;
  ultima: Vela | null;
  pronto: boolean;
  linhas: IPriceLine[];
}
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

function criar(el: HTMLElement, velas: readonly CandleApi[], intervalo: Intervalo, cores: CoresGrafico) {
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
  const estado: Estado = {
    chart,
    serie,
    marcas: createSeriesMarkers(serie, []),
    ultima: dados.at(-1) ?? null,
    pronto: false,
    linhas: [],
  };
  return { estado, dados };
}

/** Preço ao vivo: estica a última vela ou abre a próxima. */
function aplicar(r: Estado, vela: Vela): void {
  if (r.ultima && vela.time < r.ultima.time) return;
  r.serie.update(vela);
  r.ultima = vela;
}

/**
 * Candle fechado que veio do motor: substitui a vela montada com os preços ao vivo
 * pelos valores oficiais, mesmo que a próxima vela já tenha começado.
 */
function aplicarFechada(r: Estado, vela: Vela): void {
  if (!r.ultima || vela.time >= r.ultima.time) {
    aplicar(r, vela);
    return;
  }
  const dados = r.serie.data();
  if (dados.some((d) => d.time === vela.time)) r.serie.update(vela, true);
}

export function GraficoCandles(p: Props) {
  const { velas, intervalo, marcar, precoAoVivo, fechadas, linhas, rotulo, altura = 420, janela } = p;
  const caixa = useRef<HTMLDivElement>(null);
  const cores = useCoresGrafico();
  const menos = useMenosMovimento();
  const refs = useRef<Estado | null>(null);

  useEffect(() => {
    const el = caixa.current;
    if (!el) return;
    const { estado, dados } = criar(el, velas, intervalo, cores);
    refs.current = estado;
    const enquadrar = (): void => {
      const escala = estado.chart.timeScale();
      if (janela && dados.length > janela)
        escala.setVisibleLogicalRange({ from: dados.length - janela, to: dados.length + 2 });
      else escala.fitContent();
    };
    const terminar = (): void => {
      estado.pronto = true;
      enquadrar();
    };
    let cancelar = (): void => undefined;
    if (menos || dados.length === 0) {
      estado.serie.setData(dados);
      terminar();
    } else {
      estado.serie.setData(dados.map((d) => ({ time: d.time })));
      cancelar = entrarDesenhando(estado.serie, dados, terminar);
    }
    enquadrar();
    return () => {
      cancelar();
      estado.chart.remove();
      refs.current = null;
    };
  }, [velas, intervalo, cores, menos, janela]);

  useEffect(() => {
    const r = refs.current;
    const primeira = velas[0];
    if (!r || !primeira) return;
    r.marcas.setMarkers(marcar(cores, primeira.abertura));
  }, [marcar, cores, velas]);

  useEffect(() => {
    const r = refs.current;
    if (!r) return;
    r.linhas.forEach((l) => r.serie.removePriceLine(l));
    r.linhas = (linhas ?? []).map((l) =>
      r.serie.createPriceLine({
        price: Number(l.preco),
        color: cores[l.cor],
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: l.rotulo,
      }),
    );
  }, [linhas, cores, velas]);

  useEffect(() => {
    const r = refs.current;
    if (!r?.pronto || !fechadas?.length) return;
    fechadas.forEach((c) => aplicarFechada(r, paraVela(c)));
  }, [fechadas]);

  useEffect(() => {
    const r = refs.current;
    if (!r?.pronto || !r.ultima || !precoAoVivo) return;
    aplicar(r, velaComPreco(r.ultima, Number(precoAoVivo.preco), precoAoVivo.em, intervalo));
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
