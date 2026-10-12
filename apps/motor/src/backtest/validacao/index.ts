import type { ValidacaoBacktest, ValidacaoPedido } from "@zentrade/contratos";
import { validarAmostra } from "./amostra.js";
import { avisosDoBacktest, type EntradaAvisos } from "./avisos.js";
import { retornosDasOperacoes, simularMonteCarlo } from "./monte-carlo.js";
import type { DadosValidacao } from "./trechos.js";
import { validarWalkForward } from "./walk-forward.js";

export type { DadosValidacao } from "./trechos.js";

const DIA = 86_400_000;

/** Tudo o que a validação mostra, a partir de UMA rodada do backtest. */
export function validarBacktest(
  d: DadosValidacao,
  periodo: { readonly inicio: number; readonly fim: number },
  v: ValidacaoPedido,
  extras: Omit<EntradaAvisos, "operacoes" | "dias" | "mercadoPorJanela">,
): ValidacaoBacktest {
  const walkForward = validarWalkForward(d, periodo.inicio, periodo.fim, v);
  return {
    amostra: validarAmostra(d, periodo.inicio, periodo.fim, v.fracaoDentroDaAmostra),
    walkForward,
    monteCarlo: simularMonteCarlo(retornosDasOperacoes(d.operacoes, d.curva, d.saldoInicial), v),
    avisos: avisosDoBacktest({
      ...extras,
      operacoes: d.operacoes.length,
      dias: (periodo.fim - periodo.inicio) / DIA,
      mercadoPorJanela: walkForward.janelas.map((j) => j.fora.buyHoldRetorno),
    }),
  };
}
