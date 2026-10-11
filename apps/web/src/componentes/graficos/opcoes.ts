import { ColorType, CrosshairMode, type DeepPartial, type ChartOptions, type Time } from "lightweight-charts";
import { formatarPreco } from "../../lib/formatar";
import { comAlfa, type CoresGrafico } from "./cores";

/** Opções comuns dos gráficos: horário de São Paulo, números em Geist Mono, cores do tema. */
const FUSO = "America/Sao_Paulo";
const diaMes = new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, day: "2-digit", month: "2-digit" });
const horaMin = new Intl.DateTimeFormat("pt-BR", { timeZone: FUSO, hour: "2-digit", minute: "2-digit" });
const completo = new Intl.DateTimeFormat("pt-BR", {
  timeZone: FUSO,
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

const emMs = (t: Time): number => (typeof t === "number" ? t * 1000 : 0);

export function opcoesBase(cores: CoresGrafico, comHora: boolean): DeepPartial<ChartOptions> {
  return {
    autoSize: true,
    // A roda do mouse rola a página, não o gráfico: zoom só arrastando ou com pinça.
    handleScroll: { mouseWheel: false, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
    handleScale: { mouseWheel: false, pinch: true, axisPressedMouseMove: true },
    layout: {
      background: { type: ColorType.Solid, color: "transparent" },
      textColor: cores.apagado,
      fontFamily: '"Geist Mono Variable", ui-monospace, monospace',
      fontSize: 11,
      attributionLogo: false,
    },
    // Só as linhas horizontais, bem leves: o preço é o que importa; a grade só orienta.
    grid: { vertLines: { visible: false }, horzLines: { color: comAlfa(cores.linha, 0.75) } },
    rightPriceScale: { borderColor: cores.linha, scaleMargins: { top: 0.12, bottom: 0.08 } },
    timeScale: {
      borderColor: cores.linha,
      timeVisible: comHora,
      tickMarkFormatter: (t: Time, tipo: number) =>
        comHora && tipo >= 3 ? horaMin.format(emMs(t)) : diaMes.format(emMs(t)),
    },
    crosshair: {
      mode: CrosshairMode.Magnet,
      vertLine: { color: cores.apagado, labelBackgroundColor: cores.superficie },
      horzLine: { color: cores.apagado, labelBackgroundColor: cores.superficie },
    },
    localization: {
      locale: "pt-BR",
      priceFormatter: (p: number) => formatarPreco(String(p)),
      timeFormatter: (t: Time) => completo.format(emMs(t)).replace(", ", " "),
    },
  };
}
