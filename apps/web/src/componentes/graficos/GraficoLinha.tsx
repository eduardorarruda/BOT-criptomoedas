import {
  AreaSeries,
  createChart,
  createTextWatermark,
  LineSeries,
  LineStyle,
  type UTCTimestamp,
} from "lightweight-charts";
import { useEffect, useRef } from "react";
import type { PontoPatrimonio } from "../../api/esquemas";
import { useMenosMovimento } from "../../ganchos/movimento";
import { comAlfa, useCoresGrafico } from "./cores";
import { opcoesBase } from "./opcoes";

/**
 * Curva de patrimônio. `tipo="real"`: linha cheia com área. `tipo="backtest"`:
 * linha tracejada âmbar e marca d'água "SIMULADO" — impossível confundir com
 * dinheiro de verdade, mesmo num print fora de contexto.
 */
interface Props {
  readonly pontos: readonly PontoPatrimonio[];
  readonly tipo: "real" | "backtest";
  readonly rotulo: string;
  readonly altura?: number;
}

const DURACAO_DESENHO_MS = 700;

export function GraficoLinha({ pontos, tipo, rotulo, altura = 240 }: Props) {
  const caixa = useRef<HTMLDivElement>(null);
  const cores = useCoresGrafico();
  const menos = useMenosMovimento();

  useEffect(() => {
    const el = caixa.current;
    if (!el) return;
    const chart = createChart(el, opcoesBase(cores, false));
    const dados = pontos.map((p) => ({
      time: Math.floor(p.em / 1000) as UTCTimestamp,
      value: Number(p.valor),
    }));
    const serie =
      tipo === "real"
        ? chart.addSeries(AreaSeries, {
            lineColor: cores.marca,
            topColor: comAlfa(cores.marca, 0.22),
            bottomColor: "transparent",
            lineWidth: 2,
            priceLineVisible: false,
          })
        : chart.addSeries(LineSeries, {
            color: cores.atencao,
            lineWidth: 2,
            lineStyle: LineStyle.Dashed,
            priceLineVisible: false,
          });
    const painel = chart.panes()[0];
    if (tipo === "backtest" && painel) {
      createTextWatermark(painel, {
        horzAlign: "center",
        vertAlign: "center",
        lines: [
          { text: "SIMULADO · BACKTEST", color: comAlfa(cores.atencao, 0.2), fontSize: 26, fontStyle: "600" },
        ],
      });
    }
    let quadro = 0;
    if (menos || dados.length < 2) {
      serie.setData(dados);
      chart.timeScale().fitContent();
    } else {
      serie.setData(dados.map((d) => ({ time: d.time })));
      chart.timeScale().fitContent();
      const inicio = performance.now();
      const passo = (agora: number): void => {
        const t = Math.min(1, (agora - inicio) / DURACAO_DESENHO_MS);
        const n = Math.max(2, Math.ceil(dados.length * (1 - (1 - t) ** 3)));
        serie.setData([...dados.slice(0, n), ...dados.slice(n).map((d) => ({ time: d.time }))]);
        if (t < 1) quadro = requestAnimationFrame(passo);
        else chart.timeScale().fitContent();
      };
      quadro = requestAnimationFrame(passo);
    }
    return () => {
      cancelAnimationFrame(quadro);
      chart.remove();
    };
  }, [pontos, tipo, cores, menos]);

  return (
    <div
      ref={caixa}
      className={`grafico grafico--${tipo}`}
      style={{ height: altura }}
      role="img"
      aria-label={rotulo}
    />
  );
}
