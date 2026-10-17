import type { Estrategia } from "../estrategia.js";
import { DIRECOES, direcaoDe, type Direcao } from "../sentido.js";

/**
 * Os mercados que o ZenTrade simula. `cripto`: o à vista da Binance, só comprado
 * (não há venda a descoberto), robô ao vivo e backtest. `win`: o mini índice da B3,
 * os dois lados, por enquanto só no backtest (fase 1 do docs/mini-indice-e-jev.md).
 */
export type Mercado = "cripto" | "win";

export interface DescricaoMercado {
  readonly nome: string;
  readonly direcoes: readonly Direcao[];
}

export const MERCADOS: Readonly<Record<Mercado, DescricaoMercado>> = {
  cripto: { nome: "Cripto (Binance, à vista)", direcoes: ["comprado"] },
  win: { nome: "Mini índice (WIN, B3)", direcoes: DIRECOES },
};

/** O que impede a estratégia de rodar no mercado (vazio = pode). */
export function problemasNoMercado(e: Estrategia, m: Mercado): string[] {
  const direcao = direcaoDe(e);
  if (MERCADOS[m].direcoes.includes(direcao)) return [];
  return [
    `o mercado à vista de cripto só opera comprado (não há venda a descoberto); esta estratégia opera ${direcao === "vendido" ? "vendida" : "nos dois sentidos"} e roda no backtest do mini índice`,
  ];
}
