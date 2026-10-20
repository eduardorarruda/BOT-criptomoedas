/** Parâmetros fixados no PRE-REGISTRO.md. Não mude depois de ver resultados. */
export const PARES = [
  "BTCUSDT",
  "ETHUSDT",
  "BNBUSDT",
  "SOLUSDT",
  "XRPUSDT",
  "ADAUSDT",
  "DOGEUSDT",
  "LTCUSDT",
  "LINKUSDT",
  "DOTUSDT",
  "TRXUSDT",
  "AVAXUSDT",
  "ATOMUSDT",
  "BCHUSDT",
  "ETCUSDT",
];

/** Janela de dados: de 2019-01 até o último mês completo (2026-09). */
export const INICIO_ANO = 2019;
export const FIM_ANO = 2026;
export const FIM_MES = 9;

/** Barreira de tempo da barreira tripla, em velas (4h: 120 velas = 20 dias; 1h: 480 velas = 20 dias). */
export const HORIZONTE_VELAS: Readonly<Record<string, number>> = { "4h": 120, "1h": 480 };

/** Custos de cripto: os padrões do backtest (taxa VIP0 de 0,1% por lado; 5 bps de deslizamento + 2 de meio spread). */
export const TAXA_POR_LADO = 0.001;
export const BPS_CONTRA = 7;

/** Velas de aquecimento antes do primeiro sinal possível (SMA 200 precisa de 200 mais folga). */
export const AQUECIMENTO = 250;
