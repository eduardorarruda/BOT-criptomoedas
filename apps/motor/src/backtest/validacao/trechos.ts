import type { ResumoTrecho } from "@zentrade/contratos";
import { limiteInferior, type Valor } from "@zentrade/dominio";
import type { OperacaoFechada } from "../../historico.js";
import { maiorQueda, type PontoCurva } from "../metricas.js";
import { metricasDosRetornos, retornosDaCurva } from "../metricas-retorno.js";

/** O que a validação lê de um backtest já rodado (curvas inteiras, sem redução). */
export interface DadosValidacao {
  readonly saldoInicial: Valor;
  readonly curva: readonly PontoCurva[];
  /** Buy and hold nos mesmos instantes da curva. */
  readonly buyHold: readonly PontoCurva[];
  readonly operacoes: readonly OperacaoFechada[];
  readonly porAno: number;
}

export interface Trecho {
  readonly inicio: number;
  readonly fim: number;
}

/** Pontos com `em` em [inicio, fim) e o patrimônio logo antes do trecho (a base). */
function recortar(curva: readonly PontoCurva[], t: Trecho, inicial: Valor) {
  const de = limiteInferior(curva, t.inicio, (p) => p.em);
  const ate = limiteInferior(curva, t.fim, (p) => p.em);
  return { base: curva[de - 1]?.patrimonio ?? inicial, pontos: curva.slice(de, ate) };
}

function retornoDo(base: Valor, pontos: readonly PontoCurva[]): number {
  const ultimo = pontos.at(-1)?.patrimonio ?? base;
  return base.isZero() ? 0 : ultimo.div(base).minus(1).toNumber();
}

/**
 * Resumo de um trecho do backtest, sem rodar de novo: a estratégia é a mesma, então o
 * trecho é um pedaço da mesma curva. A base é o patrimônio no fim do candle anterior;
 * operações contam no trecho em que FECHARAM.
 */
export function resumoDoTrecho(d: DadosValidacao, t: Trecho): ResumoTrecho {
  const { base, pontos } = recortar(d.curva, t, d.saldoInicial);
  const bh = recortar(d.buyHold, t, d.saldoInicial);
  const ops = d.operacoes.filter((o) => o.fechadaEm >= t.inicio && o.fechadaEm < t.fim);
  const acertos = ops.filter((o) => o.resultado.gt(0)).length;
  return {
    inicio: t.inicio,
    fim: t.fim,
    retorno: retornoDo(base, pontos),
    sharpe: metricasDosRetornos(retornosDaCurva(base, pontos), d.porAno).sharpe,
    maiorQuedaPercentual: maiorQueda([{ em: t.inicio, patrimonio: base }, ...pontos]).percentual,
    operacoes: ops.length,
    taxaAcerto: ops.length === 0 ? null : acertos / ops.length,
    buyHoldRetorno: retornoDo(bh.base, bh.pontos),
  };
}
