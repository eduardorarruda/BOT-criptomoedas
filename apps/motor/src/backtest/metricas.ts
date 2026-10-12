import { dec, posicaoDe, type Execucao, type Valor } from "@zentrade/dominio";
import { operacoesFechadas } from "../historico.js";

export interface PontoCurva {
  readonly em: number;
  readonly patrimonio: Valor;
}

export interface MaiorQueda {
  readonly valor: Valor;
  readonly percentual: number;
  /** Índices do pico e do vale na curva (−1 sem queda). */
  readonly pico: number;
  readonly vale: number;
}

/** Maior queda (drawdown): maior distância de um pico da curva até um vale posterior. */
export function maiorQueda(curva: readonly PontoCurva[]): MaiorQueda {
  let pico: { valor: Valor; i: number } | null = null;
  let pior: MaiorQueda = { valor: dec(0), percentual: 0, pico: -1, vale: -1 };
  curva.forEach(({ patrimonio }, i) => {
    if (!pico || patrimonio.gt(pico.valor)) pico = { valor: patrimonio, i };
    const queda = pico.valor.minus(patrimonio);
    if (queda.gt(pior.valor))
      pior = {
        valor: queda,
        percentual: pico.valor.isZero() ? 0 : queda.div(pico.valor).toNumber(),
        pico: pico.i,
        vale: i,
      };
  });
  return pior;
}

/**
 * Duração da maior queda: do pico até o patrimônio voltar a ele ou, se não voltou,
 * até o fim da curva. `recuperada` diz qual dos dois.
 */
export function duracaoDaQueda(
  curva: readonly PontoCurva[],
  q: MaiorQueda,
): { duracaoMs: number; recuperada: boolean } {
  const pico = curva[q.pico];
  if (!pico) return { duracaoMs: 0, recuperada: true };
  const volta = curva.findIndex((p, i) => i > q.vale && p.patrimonio.gte(pico.patrimonio));
  const fim = curva[volta === -1 ? curva.length - 1 : volta] ?? pico;
  return { duracaoMs: fim.em - pico.em, recuperada: volta !== -1 };
}

export interface MetricasOperacoes {
  readonly operacoes: number;
  readonly acertos: number;
  readonly taxaAcerto: number;
  readonly taxasPagas: Valor;
  readonly ordens: number;
}

/** Operações = idas e voltas fechadas; acerto = resultado líquido de taxas positivo. */
export function metricasDasExecucoes(execucoes: readonly Execucao[], ordens: number): MetricasOperacoes {
  const ops = operacoesFechadas(execucoes);
  const acertos = ops.filter((o) => o.resultado.gt(0)).length;
  return {
    operacoes: ops.length,
    acertos,
    taxaAcerto: ops.length === 0 ? 0 : acertos / ops.length,
    taxasPagas: posicaoDe(execucoes).taxasPagas,
    ordens,
  };
}
