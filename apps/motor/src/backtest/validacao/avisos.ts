import type { AvisoBacktest } from "@zentrade/contratos";
import { MINIMO_OPERACOES_MONTE_CARLO } from "./monte-carlo.js";

/** Regras práticas (heurísticas) — não há teste formal por trás destes cortes. */
export const OPERACOES_MINIMAS = 30;
export const OPERACOES_FIRMES = 100;
export const DIAS_MINIMOS = 90;
export const DIAS_DE_UM_ANO = 365;

export interface EntradaAvisos {
  readonly operacoes: number;
  readonly dias: number;
  readonly semLimites: boolean;
  /** Retorno do buy and hold em cada janela de teste do walk-forward. */
  readonly mercadoPorJanela: readonly number[];
  readonly candlesAmbiguos: number;
  readonly precisaoMinuto: boolean;
}

const heuristica = (codigo: string, nivel: AvisoBacktest["nivel"], mensagem: string): AvisoBacktest => ({
  codigo,
  nivel,
  base: "heuristica",
  mensagem,
});

function avisosDeOperacoes(n: number): AvisoBacktest[] {
  if (n === 0)
    return [
      heuristica("nenhuma_operacao", "alerta", "Nenhuma operação no período: não há resultado para avaliar."),
    ];
  if (n < OPERACOES_MINIMAS)
    return [
      heuristica(
        "poucas_operacoes",
        "alerta",
        `Só ${n} operações. Abaixo de ~${OPERACOES_MINIMAS}, a taxa de acerto e a média mudam muito com uma operação a mais ou a menos.`,
      ),
      ...(n < MINIMO_OPERACOES_MONTE_CARLO
        ? [
            heuristica(
              "sem_monte_carlo",
              "atencao",
              "Poucas operações para o Monte Carlo: ele não foi feito.",
            ),
          ]
        : []),
    ];
  if (n < OPERACOES_FIRMES)
    return [
      heuristica(
        "operacoes_moderadas",
        "atencao",
        `${n} operações dão uma ideia; mais de ${OPERACOES_FIRMES} dariam números mais firmes.`,
      ),
    ];
  return [];
}

function avisosDePeriodo(dias: number): AvisoBacktest[] {
  const d = Math.round(dias);
  if (dias < DIAS_MINIMOS)
    return [
      heuristica(
        "periodo_curto",
        "alerta",
        `O período tem só ${d} dias: pouco para separar sorte de padrão.`,
      ),
    ];
  if (dias < DIAS_DE_UM_ANO)
    return [
      heuristica(
        "menos_de_um_ano",
        "atencao",
        `O período tem ${d} dias, menos de 1 ano: o teste pode ter visto um só tipo de mercado.`,
      ),
    ];
  return [];
}

function avisosDeRegime(mercado: readonly number[]): AvisoBacktest[] {
  if (mercado.length < 2) return [];
  if (mercado.every((r) => r > 0))
    return [
      heuristica(
        "so_alta",
        "atencao",
        `O mercado subiu em todas as ${mercado.length} janelas: o teste não viu queda nem lateralidade.`,
      ),
    ];
  if (mercado.every((r) => r < 0))
    return [
      heuristica(
        "so_queda",
        "atencao",
        `O mercado caiu em todas as ${mercado.length} janelas: o teste não viu alta nem lateralidade.`,
      ),
    ];
  return [];
}

/**
 * Avisos de amostra e de realismo, todos marcados como heurística: a única regra com
 * base formal (a duração mínima do backtest, MinBTL) depende do número de tentativas
 * e é calculada na leitura, junto com o Sharpe deflacionado.
 */
export function avisosDoBacktest(e: EntradaAvisos): AvisoBacktest[] {
  return [
    ...avisosDeOperacoes(e.operacoes),
    ...avisosDePeriodo(e.dias),
    ...avisosDeRegime(e.mercadoPorJanela),
    ...(e.semLimites
      ? [
          heuristica(
            "sem_limites",
            "atencao",
            "Rodou sem os limites de risco do robô (perda diária, exposição, frequência, pausa): o robô de verdade operaria menos.",
          ),
        ]
      : []),
    ...(e.candlesAmbiguos > 0 && !e.precisaoMinuto
      ? [
          heuristica(
            "candles_ambiguos",
            "atencao",
            `Em ${e.candlesAmbiguos} candle(s) o stop e o alvo couberam no mesmo candle; contamos o stop (pior caso). A precisão de 1 minuto resolveria a ordem.`,
          ),
        ]
      : []),
  ];
}
