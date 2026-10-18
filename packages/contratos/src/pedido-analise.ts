import { z } from "zod";
import { Instante, TextoDecimal } from "./comum.js";

/**
 * O que o motor conta ao agente sobre COMO a operação termina e QUANTO ela custa —
 * para a IA avaliar a operação pelas saídas reais (stop, regra de saída, tempo) e não
 * pelo alvo nominal, que nos modelos fica longe de propósito. Números puros (frações e
 * contagens), como na Estrategia do domínio; reais do WIN em texto decimal.
 */
const Periodo = z.number().int().min(1).max(500);
const Multiplo = z.number().positive().max(50);

export const CustosPedidoEsquema = z.discriminatedUnion("mercado", [
  z.object({
    /** À vista da Binance: só comprado (não há venda a descoberto). */
    mercado: z.literal("cripto"),
    /** Taxa da corretora em CADA lado, em fração (0,001 = 0,1%). */
    taxaPorLado: z.number().min(0).lt(0.01),
    /** Deslizamento contra quem opera em cada execução, em pontos-base (hipótese do backtest). */
    deslizamentoBps: z.number().min(0).max(1000),
    /** Metade do spread, em pontos-base, em cada execução a mercado. */
    meioSpreadBps: z.number().min(0).max(1000),
  }),
  z.object({
    /** Mini índice da B3: os dois lados; R$ 0,20 por ponto, tick de 5 pontos. */
    mercado: z.literal("win"),
    /** Tarifa da B3 por contrato em cada lado, em reais. */
    tarifaPorContrato: TextoDecimal,
    corretagemPorContrato: TextoDecimal,
    deslizamentoTicks: z.number().int().min(0).max(100),
  }),
]);
export type CustosPedido = z.infer<typeof CustosPedidoEsquema>;

export const OperacaoPedidoEsquema = z.object({
  /** O lado da posição que o sinal abre (ou que está aberta, na saída). */
  sentido: z.enum(["comprado", "vendido"]),
  custos: CustosPedidoEsquema,
  /** Stop percentual da estratégia: o stop fixo, ou o teto da distância com stop por ATR. */
  stopPercentual: z.number().positive().lt(1),
  stopAtr: z.object({ periodo: Periodo, multiplo: Multiplo }).optional(),
  stopMovel: z
    .discriminatedUnion("tipo", [
      z.object({ tipo: z.literal("percentual"), distancia: z.number().positive().lt(1) }),
      z.object({ tipo: z.literal("atr"), periodo: Periodo, multiplo: Multiplo }),
    ])
    .optional(),
  empate: z.object({ gatilho: z.number().positive().lt(1) }).optional(),
  /** Saída por tempo, em candles do intervalo do robô. */
  tempoMaximo: z.number().int().min(1).max(100_000).optional(),
  /** Lucro líquido que o alvo fixo deixa (fração). Nos modelos, longe de propósito. */
  alvoLiquido: z.number().min(0).max(100),
  /** A regra de saída do lado, em texto legível ("preço < fundo de Donchian(10)"). */
  regraSaida: z.string().min(1).max(1000).optional(),
  /** Tamanho pela volatilidade (k × ATR), se houver: só informa. */
  tamanhoPorVolatilidade: z.object({ periodo: Periodo, multiplo: Multiplo }).optional(),
});
export type OperacaoPedido = z.infer<typeof OperacaoPedidoEsquema>;

const Serie = z.array(z.number().finite()).max(2000);

/**
 * As outras séries das velas que o motor já tem (os fechamentos vão à parte), na mesma
 * ordem e tamanho: o agente calcula ATR, faixa, volume relativo, tempo gráfico maior e
 * VWAP do dia no código, sem a IA fazer conta.
 */
export const VelasPedidoEsquema = z
  .object({
    /** Abertura de cada vela, em ms UTC. */
    instantes: z.array(Instante).max(2000),
    maximas: Serie,
    minimas: Serie,
    volumes: Serie,
  })
  .refine(
    (v) => [v.maximas, v.minimas, v.volumes].every((s) => s.length === v.instantes.length),
    "as séries das velas precisam ter o mesmo tamanho",
  );
export type VelasPedido = z.infer<typeof VelasPedidoEsquema>;
