import { z } from "zod";
import { Fracao, Id, Instante, Intervalo, TextoDecimal } from "./comum.js";

/**
 * Backtest: a API grava o pedido e enfileira; o motor roda e grava métricas e curva.
 * Os nomes das métricas são estáveis: o motor escreve exatamente estes campos.
 */
export const EstadoBacktest = z.enum(["na_fila", "rodando", "concluido", "falhou"]);
export type EstadoBacktest = z.infer<typeof EstadoBacktest>;

export const PedidoBacktestEsquema = z.object({
  estrategiaId: z.uuid("estrategiaId precisa ser o id de uma estratégia"),
  versao: z.number().int().positive(),
  simbolo: z.string().regex(/^[A-Z0-9]{5,20}$/, "símbolo como BTCUSDT"),
  intervalo: Intervalo,
  inicio: z.number().int().nonnegative(),
  fim: z.number().int().nonnegative(),
});
export type PedidoBacktestDTO = z.infer<typeof PedidoBacktestEsquema>;

/** Patrimônio simulado (cotação + base a preço de fechamento) ao fim de cada candle. */
export const PontoCurvaBacktestEsquema = z.object({ em: Instante, patrimonio: TextoDecimal });
export type PontoCurvaBacktest = z.infer<typeof PontoCurvaBacktestEsquema>;

export const MetricasBacktestEsquema = z.object({
  /** Patrimônio final menos o inicial, já com as taxas descontadas. */
  resultadoLiquido: TextoDecimal,
  patrimonioFinal: TextoDecimal.optional(),
  /** Maior distância de um pico da curva até um vale posterior, em moeda. */
  maiorQueda: TextoDecimal,
  /** A mesma queda como fração do pico (0,1 = 10%). */
  maiorQuedaPercentual: Fracao,
  /** Idas e voltas fechadas (compra e venda). */
  operacoes: z.number().int().nonnegative(),
  /** Operações com resultado líquido de taxas positivo. */
  acertos: z.number().int().nonnegative(),
  taxaAcerto: Fracao,
  taxasPagas: TextoDecimal,
  ordens: z.number().int().nonnegative().optional(),
  /** Capital simulado no início e o resultado como fração dele (pode ser negativo). */
  saldoInicial: TextoDecimal.optional(),
  resultadoPercentual: z.number().optional(),
  /** Quanto o backtest aceitou perder por operação, para comparar com o robô real. */
  riscoPorOperacao: TextoDecimal.optional(),
  candles: z.number().int().nonnegative().optional(),
});
export type MetricasBacktest = z.infer<typeof MetricasBacktestEsquema>;

export const BacktestEsquema = z.object({
  id: Id,
  estado: EstadoBacktest,
  estrategiaId: Id,
  versao: z.number().int().positive(),
  simbolo: z.string(),
  intervalo: Intervalo,
  inicio: Instante,
  fim: Instante,
  metricas: MetricasBacktestEsquema.nullable(),
  curva: z.array(PontoCurvaBacktestEsquema).nullable(),
  erro: z.string().nullable(),
  criadoEm: Instante,
  concluidoEm: Instante.nullable(),
});
export type BacktestDTO = z.infer<typeof BacktestEsquema>;
