import type { Intervalo } from "@zentrade/contratos/esquemas";
import type { FiltroDecisoes, FiltroPlacar } from "../api/fonte";

/** Chaves do TanStack Query, num lugar só para os eventos ao vivo acharem os dados. */
export const chaves = {
  sessao: ["sessao"] as const,
  resumo: ["resumo"] as const,
  patrimonio: ["patrimonio"] as const,
  saude: ["saude"] as const,
  /** A mesma chave da política de privacidade (paginas/privacidade): o cache é um só. */
  configPublica: ["publico", "config"] as const,
  estrategias: ["estrategias"] as const,
  robos: ["robos"] as const,
  posicoes: ["posicao"] as const,
  posicao: (roboId: string) => ["posicao", roboId] as const,
  decisoesTodas: ["decisoes"] as const,
  decisoes: (f: FiltroDecisoes = {}) => ["decisoes", f] as const,
  decisao: (id: string) => ["decisao", id] as const,
  /** O que cada robô pensou na última vela (um item por robô). */
  pensamentos: ["pensamentos"] as const,
  historicoDoPensamento: (roboId: string) => ["pensamentos", "historico", roboId] as const,
  /** Fora de "decisoes": o placar não é lista de decisões (os eventos ao vivo mexem nelas). */
  placar: (f: FiltroPlacar = {}) => ["placar", f] as const,
  ordensTodas: ["ordens"] as const,
  ordens: (roboId?: string) => ["ordens", roboId ?? "todas"] as const,
  candles: (simbolo: string, intervalo: Intervalo) => ["candles", simbolo, intervalo] as const,
  contas: ["contas"] as const,
  tokens: ["tokens"] as const,
  backtests: ["backtests"] as const,
  backtest: (id: string) => ["backtest", id] as const,
  /** Candles do mini índice gravados no banco (o que dá para testar no WIN). */
  dadosWin: ["dados-win"] as const,
  documentos: ["documentos"] as const,
  automacoes: ["automacoes"] as const,
  aoVivo: (roboId?: string) => ["aovivo", roboId ?? "todos"] as const,
  /** Limites da conta, pausas, divergências, orçamento de IA e avisos (tela de Risco). */
  risco: ["risco"] as const,
  /** Agenda de eventos de mercado (Copom, payroll…). */
  agenda: ["agenda-eventos"] as const,
};
