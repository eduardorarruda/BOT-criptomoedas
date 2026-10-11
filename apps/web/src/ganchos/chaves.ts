import type { Intervalo } from "@zentrade/contratos/esquemas";
import type { FiltroDecisoes } from "../api/fonte";

/** Chaves do TanStack Query, num lugar só para os eventos ao vivo acharem os dados. */
export const chaves = {
  sessao: ["sessao"] as const,
  resumo: ["resumo"] as const,
  patrimonio: ["patrimonio"] as const,
  saude: ["saude"] as const,
  estrategias: ["estrategias"] as const,
  robos: ["robos"] as const,
  posicoes: ["posicao"] as const,
  posicao: (roboId: string) => ["posicao", roboId] as const,
  decisoesTodas: ["decisoes"] as const,
  decisoes: (f: FiltroDecisoes = {}) => ["decisoes", f] as const,
  ordensTodas: ["ordens"] as const,
  ordens: (roboId?: string) => ["ordens", roboId ?? "todas"] as const,
  candles: (simbolo: string, intervalo: Intervalo) => ["candles", simbolo, intervalo] as const,
  contas: ["contas"] as const,
  tokens: ["tokens"] as const,
  backtests: ["backtests"] as const,
  backtest: (id: string) => ["backtest", id] as const,
  documentos: ["documentos"] as const,
  automacoes: ["automacoes"] as const,
  aoVivo: (roboId?: string) => ["aovivo", roboId ?? "todos"] as const,
};
