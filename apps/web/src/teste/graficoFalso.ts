/**
 * Substituto do lightweight-charts para testes da aplicação inteira: o jsdom não tem
 * canvas. Só o que os gráficos chamam, sem desenhar nada.
 */
const serie = {
  setData: () => undefined,
  update: () => undefined,
  data: () => [],
  createPriceLine: () => ({}),
  removePriceLine: () => undefined,
};
const chart = {
  addSeries: () => serie,
  panes: () => [{}],
  timeScale: () => ({ fitContent: () => undefined, setVisibleLogicalRange: () => undefined }),
  remove: () => undefined,
};

export const createChart = () => chart;
export const createSeriesMarkers = () => ({ setMarkers: () => undefined });
export const createTextWatermark = () => ({});
export const CandlestickSeries = {};
export const LineSeries = {};
export const AreaSeries = {};
export const ColorType = { Solid: "solid" };
export const CrosshairMode = { Magnet: 1 };
export const LineStyle = { Dashed: 2 };
