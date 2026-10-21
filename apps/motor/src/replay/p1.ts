import { MODELOS, type Estrategia } from "@zentrade/dominio";

/**
 * Parâmetros PRÉ-REGISTRADOS do replay do Claude sobre a estratégia P1. Nada daqui muda
 * depois de ver resultado: mudar é rodar outro experimento, com outro nome.
 */

/** P1 = Donchian 20/10 do catálogo, com a regra extra "preço > SMA(200)" na entrada. */
function montarP1(): Estrategia {
  const modelo = MODELOS.find((m) => m.id === "donchian-20-10");
  if (!modelo) throw new Error("o modelo donchian-20-10 sumiu do catálogo");
  return {
    ...modelo.estrategia,
    entrada: {
      tipo: "e",
      regras: [
        modelo.estrategia.entrada,
        {
          tipo: "comparar",
          esquerda: { tipo: "preco" },
          comparador: ">",
          direita: { tipo: "indicador", nome: "sma", periodo: 200 },
        },
      ],
    },
  };
}

export const ESTRATEGIA_P1: Estrategia = montarP1();

export const REPLAY_P1 = {
  nome: "p1-donchian-20-10-sma200",
  simbolos: [
    "BTCUSDT",
    "ETHUSDT",
    "SOLUSDT",
    "BNBUSDT",
    "XRPUSDT",
    "ADAUSDT",
    "DOGEUSDT",
    "LINKUSDT",
    "AVAXUSDT",
    "LTCUSDT",
  ],
  intervalo: "1h",
  /** Depois do corte de conhecimento do modelo (o Claude não pode "lembrar" o que aconteceu). */
  inicio: "2026-07-01",
  /** Inclusive: o último dia com sinal é 20/10. */
  fim: "2026-10-20",
  maximo: 200,
  custoMaximoUsd: 15,
  /** Mesmo tamanho em todas as operações, para somar dinheiro. */
  nocionalUsd: 1000,
  /** Candles que a regra enxerga (a janela dos indicadores). */
  janelaIndicadores: 300,
  /** Candles de histórico que vão no pedido ao agente (o robô ao vivo manda 1000). */
  historicoNoPedido: 1000,
  /** Candles esperados por stop, regra de saída ou tempo antes de fechar no horizonte. */
  horizonte: 500,
  /** Deslizamento (5) mais meio spread (2) em pontos-base, os custos padrão do backtest. */
  bpsContra: 7,
  rodadasAleatorias: 1000,
  semente: 20_261_020,
} as const;
