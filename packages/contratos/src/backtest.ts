import { dec } from "@zentrade/dominio";
import { z } from "zod";
import { Fracao, Id, Instante, Intervalo, TextoDecimal } from "./comum.js";
import { LimitesRiscoEsquema, type LimitesRiscoDTO } from "./dados.js";

/**
 * Backtest: a API grava o pedido e enfileira; o motor roda e grava métricas e curva.
 * Os nomes das métricas são estáveis: o motor escreve exatamente estes campos.
 * Tudo o que chegou depois da primeira versão é opcional: backtests antigos (sem
 * configuração, validação nem tentativas) continuam válidos e aparecem na tela.
 */
export const EstadoBacktest = z.enum(["na_fila", "rodando", "concluido", "falhou"]);
export type EstadoBacktest = z.infer<typeof EstadoBacktest>;

/** Taxa por ponta da Binance à vista no nível VIP 0 (0,1%) e pagando a taxa com BNB (0,075%). */
export const TAXA_BINANCE_VIP0 = 0.001;
export const TAXA_BINANCE_BNB = 0.00075;
/** Até quantos dias o backtest baixa candles de 1 minuto para o caminho do preço dentro do candle. */
export const DIAS_MAXIMOS_PRECISAO_MINUTO = 31;
const DIA_MS = 86_400_000;

/**
 * Custos aplicados em TODA execução simulada (compra e venda, entrada e stop).
 * Deslizamento e meio spread somam: a compra sai mais cara e a venda mais barata.
 * A latência (o preço andar entre a decisão e a ordem chegar) entra no deslizamento.
 */
export const CustosBacktestEsquema = z.object({
  taxaPorLado: z.number().min(0).lt(0.01).default(TAXA_BINANCE_VIP0),
  /** Pontos-base contra quem opera (5 = 0,05%). */
  deslizamentoBps: z.number().min(0).max(100).default(5),
  /** Metade do spread, em pontos-base: ordem a mercado cruza o livro. */
  meioSpreadBps: z.number().min(0).max(100).default(2),
});
export type CustosBacktest = z.infer<typeof CustosBacktestEsquema>;

/**
 * Limites de um robô novo na tela, como fração do saldo (para 1000 USDT: perda diária
 * 20, exposição 300, risco por operação 5). São o padrão do backtest.
 */
export const LIMITES_BACKTEST_PADRAO = {
  perdaDiaria: 0.02,
  exposicao: 0.3,
  riscoPorOperacao: 0.005,
  ordensPorHoraMax: 4,
  pausaAposPerdaMin: 60,
  confiancaMinima: 0.65,
} as const;

export function limitesPadraoDoBacktest(saldoInicial: string): LimitesRiscoDTO {
  const parte = (f: number) => dec(saldoInicial).times(f).toFixed();
  const p = LIMITES_BACKTEST_PADRAO;
  return {
    perdaDiariaMaxima: parte(p.perdaDiaria),
    exposicaoMaxima: parte(p.exposicao),
    riscoPorOperacao: parte(p.riscoPorOperacao),
    ordensPorHoraMax: p.ordensPorHoraMax,
    pausaAposPerdaMin: p.pausaAposPerdaMin,
    confiancaMinima: p.confiancaMinima,
  };
}

/**
 * `robo`: o mesmo motor de risco do robô ao vivo (perda diária, exposição, ordens por
 * hora, pausa após perda, risco por operação), com os limites informados ou os de um
 * robô novo. `sem_limites`: só a estratégia, sem freios — MENOS realista.
 */
export const RiscoBacktestEsquema = z.discriminatedUnion("modo", [
  z.object({ modo: z.literal("robo"), limites: LimitesRiscoEsquema.optional() }),
  z.object({ modo: z.literal("sem_limites") }),
]);
export type RiscoBacktest = z.infer<typeof RiscoBacktestEsquema>;

/** Como validar: divisão dentro/fora da amostra, janelas do walk-forward e Monte Carlo. */
export const ValidacaoPedidoEsquema = z.object({
  /** Fração do período que fica "dentro da amostra" (o resto é o teste fora dela). */
  fracaoDentroDaAmostra: z.number().min(0.5).max(0.9).default(0.7),
  janelas: z.number().int().min(2).max(12).default(5),
  /** `rolante`: o trecho de referência anda junto; `ancorada`: começa sempre no início. */
  modoJanelas: z.enum(["rolante", "ancorada"]).default("rolante"),
  simulacoes: z.number().int().min(100).max(5000).default(1000),
  /** Semente do sorteio: mesma semente, mesmo resultado. */
  semente: z.number().int().min(0).max(2_147_483_647).default(42),
  /** Ruína = o patrimônio cair esta fração do capital inicial em algum momento. */
  limiteRuina: z.number().min(0.05).max(0.95).default(0.3),
});
export type ValidacaoPedido = z.infer<typeof ValidacaoPedidoEsquema>;

const SaldoPositivo = TextoDecimal.refine(
  (v) => Number(v) > 0 && Number(v) <= 100_000_000,
  "o saldo inicial precisa ser maior que zero",
);

export const ConfiguracaoBacktestEsquema = z.object({
  /** Sem ele, vale o saldo do motor (MOTOR_BACKTEST_SALDO). */
  saldoInicial: SaldoPositivo.optional(),
  custos: CustosBacktestEsquema.prefault({}),
  risco: RiscoBacktestEsquema.prefault({ modo: "robo" }),
  /** Usa candles de 1 minuto para saber o que veio primeiro dentro do candle (até 31 dias). */
  precisaoMinuto: z.boolean().default(false),
  validacao: ValidacaoPedidoEsquema.prefault({}),
});
export type ConfiguracaoBacktest = z.infer<typeof ConfiguracaoBacktestEsquema>;
export type ConfiguracaoBacktestEntrada = z.input<typeof ConfiguracaoBacktestEsquema>;

export const PedidoBacktestEsquema = z
  .object({
    estrategiaId: z.uuid("estrategiaId precisa ser o id de uma estratégia"),
    versao: z.number().int().positive(),
    simbolo: z.string().regex(/^[A-Z0-9]{5,20}$/, "símbolo como BTCUSDT"),
    intervalo: Intervalo,
    inicio: z.number().int().nonnegative(),
    fim: z.number().int().nonnegative(),
    configuracao: ConfiguracaoBacktestEsquema.prefault({}),
  })
  .superRefine((p, ctx) => {
    if (p.configuracao.precisaoMinuto && p.fim - p.inicio > DIAS_MAXIMOS_PRECISAO_MINUTO * DIA_MS)
      ctx.addIssue({
        code: "custom",
        path: ["configuracao", "precisaoMinuto"],
        message: `a precisão de 1 minuto vale para períodos de até ${DIAS_MAXIMOS_PRECISAO_MINUTO} dias; encurte o período ou desligue a opção`,
      });
  });
export type PedidoBacktestDTO = z.infer<typeof PedidoBacktestEsquema>;

/**
 * Patrimônio simulado (cotação + base a preço de fechamento) ao fim de cada candle e,
 * nos backtests novos, o de quem comprou no início e segurou (buy and hold, com custos).
 */
export const PontoCurvaBacktestEsquema = z.object({
  em: Instante,
  patrimonio: TextoDecimal,
  buyHold: TextoDecimal.optional(),
});
export type PontoCurvaBacktest = z.infer<typeof PontoCurvaBacktestEsquema>;

const Razao = z.number().nullable().optional();

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

  /** Resultado antes dos custos: o líquido mais taxas e deslizamento pagos. */
  resultadoBruto: TextoDecimal.optional(),
  resultadoBrutoPercentual: z.number().optional(),
  /** Deslizamento mais meio spread pagos em todas as execuções. */
  deslizamentoPago: TextoDecimal.optional(),
  /** Crescimento anual composto; só com 1 ano ou mais de período. */
  cagr: Razao,
  /** Desvio dos retornos por candle, anualizado (365 dias: cripto não fecha). */
  volatilidadeAnual: Razao,
  sharpe: Razao,
  sortino: Razao,
  calmar: Razao,
  /** Do pico da maior queda até recuperar o pico (ou até o fim, se não recuperou). */
  duracaoMaiorQuedaMs: z.number().int().nonnegative().optional(),
  maiorQuedaRecuperada: z.boolean().optional(),
  /** Soma dos ganhos ÷ soma das perdas; `null` sem nenhuma perda. */
  fatorLucro: Razao,
  /** Resultado médio por operação. */
  expectativa: TextoDecimal.optional(),
  ganhoMedio: TextoDecimal.nullable().optional(),
  perdaMedia: TextoDecimal.nullable().optional(),
  /** Ganho médio ÷ |perda média|. */
  payoff: Razao,
  /** Fração dos candles com posição aberta. */
  tempoExposto: Fracao.optional(),
  buyHoldResultadoPercentual: z.number().optional(),
  buyHoldMaiorQuedaPercentual: Fracao.optional(),
  buyHoldSharpe: Razao,
  /** Retorno líquido menos o do buy and hold (em fração do capital). */
  excessoSobreBuyHold: z.number().optional(),
  /** Para o Sharpe deflacionado: quantos retornos, por ano, e o formato deles. */
  observacoes: z.number().int().nonnegative().optional(),
  barrasPorAno: z.number().positive().optional(),
  assimetria: z.number().optional(),
  curtose: z.number().optional(),
  anos: z.number().nonnegative().optional(),
  /** Saídas dentro do candle; "ambíguos" = stop e alvo no mesmo candle (contou o stop). */
  stopsIntrabar: z.number().int().nonnegative().optional(),
  alvosIntrabar: z.number().int().nonnegative().optional(),
  candlesAmbiguos: z.number().int().nonnegative().optional(),
  precisaoMinuto: z.boolean().optional(),
});
export type MetricasBacktest = z.infer<typeof MetricasBacktestEsquema>;

/** Resumo de um trecho do período (dentro/fora da amostra, janela do walk-forward). */
export const ResumoTrechoEsquema = z.object({
  inicio: Instante,
  fim: Instante,
  retorno: z.number(),
  sharpe: z.number().nullable(),
  maiorQuedaPercentual: Fracao,
  operacoes: z.number().int().nonnegative(),
  taxaAcerto: Fracao.nullable(),
  buyHoldRetorno: z.number(),
});
export type ResumoTrecho = z.infer<typeof ResumoTrechoEsquema>;

export const AmostraValidacaoEsquema = z.object({
  fracaoDentro: z.number(),
  corte: Instante,
  dentro: ResumoTrechoEsquema,
  fora: ResumoTrechoEsquema,
  degradou: z.boolean(),
  motivo: z.string().nullable(),
});
export type AmostraValidacao = z.infer<typeof AmostraValidacaoEsquema>;

export const JanelaWalkForwardEsquema = z.object({
  indice: z.number().int().nonnegative(),
  dentro: ResumoTrechoEsquema,
  fora: ResumoTrechoEsquema,
  /** Eficiência (Pardo): retorno por dia fora ÷ retorno por dia dentro; `null` se dentro ≤ 0. */
  eficiencia: z.number().nullable(),
});

export const WalkForwardEsquema = z.object({
  modo: z.enum(["rolante", "ancorada"]),
  janelas: z.array(JanelaWalkForwardEsquema),
  estabilidade: z.object({
    mediaRetorno: z.number(),
    desvioRetorno: z.number(),
    mediaSharpe: z.number().nullable(),
    desvioSharpe: z.number().nullable(),
    /** Fração das janelas de teste que terminaram no lucro. */
    fracaoPositivas: Fracao,
    eficienciaMedia: z.number().nullable(),
  }),
});
export type WalkForward = z.infer<typeof WalkForwardEsquema>;

const Faixa = z.object({ p5: z.number(), p50: z.number(), p95: z.number() });

export const MonteCarloEsquema = z.object({
  simulacoes: z.number().int().positive(),
  semente: z.number().int().nonnegative(),
  limiteRuina: z.number(),
  operacoes: z.number().int().nonnegative(),
  retornoFinal: Faixa,
  maiorQueda: Faixa,
  probabilidadeRuina: Fracao,
  histograma: z.array(z.object({ de: z.number(), ate: z.number(), quantidade: z.number().int() })),
  /** Percentis do patrimônio (1 = inicial) depois de cada operação, para o gráfico em leque. */
  leque: z.array(
    z.object({ operacao: z.number().int().nonnegative(), p5: z.number(), p50: z.number(), p95: z.number() }),
  ),
});
export type MonteCarlo = z.infer<typeof MonteCarloEsquema>;

/** `formal`: tem base publicada; `heuristica`: regra prática, sem prova. */
export const AvisoBacktestEsquema = z.object({
  codigo: z.string(),
  nivel: z.enum(["alerta", "atencao"]),
  base: z.enum(["formal", "heuristica"]),
  mensagem: z.string(),
});
export type AvisoBacktest = z.infer<typeof AvisoBacktestEsquema>;

export const ValidacaoBacktestEsquema = z.object({
  amostra: AmostraValidacaoEsquema.nullable(),
  walkForward: WalkForwardEsquema.nullable(),
  monteCarlo: MonteCarloEsquema.nullable(),
  avisos: z.array(AvisoBacktestEsquema),
});
export type ValidacaoBacktest = z.infer<typeof ValidacaoBacktestEsquema>;

/**
 * Calculado na leitura, sobre todos os backtests concluídos da mesma estratégia (todas
 * as versões) até este: quanto mais tentativas, mais fácil um bom Sharpe sair por acaso.
 */
export const TentativasBacktestEsquema = z.object({
  total: z.number().int().positive(),
  daVersao: z.number().int().nonnegative(),
  versoes: z.number().int().nonnegative(),
  probabilidadeSharpe: Fracao.nullable(),
  sharpeDeflacionado: Fracao.nullable(),
  sharpeMaximoEsperado: z.number().nullable(),
  anosMinimos: z.number().nullable(),
  sharpeComDesconto: z.number().nullable(),
});
export type TentativasBacktest = z.infer<typeof TentativasBacktestEsquema>;

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
  configuracao: ConfiguracaoBacktestEsquema.nullable().optional(),
  validacao: ValidacaoBacktestEsquema.nullable().optional(),
  tentativas: TentativasBacktestEsquema.nullable().optional(),
});
export type BacktestDTO = z.infer<typeof BacktestEsquema>;
