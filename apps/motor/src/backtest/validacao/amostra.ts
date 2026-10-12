import type { AmostraValidacao, ResumoTrecho } from "@zentrade/contratos";
import { resumoDoTrecho, type DadosValidacao } from "./trechos.js";

/** Abaixo desta fração do Sharpe de dentro, o de fora "caiu demais" (regra prática). */
export const QUEDA_SHARPE_TOLERADA = 0.5;

export const corteDaAmostra = (inicio: number, fim: number, fracaoDentro: number): number =>
  Math.round(inicio + (fim - inicio) * fracaoDentro);

/**
 * Degradou quando o lucro de dentro vira prejuízo fora, ou quando o Sharpe de fora
 * fica abaixo da metade do de dentro. É uma regra prática, não um teste estatístico.
 */
export function compararAmostras(
  dentro: ResumoTrecho,
  fora: ResumoTrecho,
): { degradou: boolean; motivo: string | null } {
  if (dentro.retorno > 0 && fora.retorno < 0)
    return { degradou: true, motivo: "o lucro de dentro da amostra virou prejuízo fora dela" };
  const sDentro = dentro.sharpe ?? 0;
  if (sDentro > 0 && (fora.sharpe ?? 0) < sDentro * QUEDA_SHARPE_TOLERADA)
    return { degradou: true, motivo: "o Sharpe fora da amostra caiu para menos da metade do de dentro" };
  return { degradou: false, motivo: null };
}

/** Dentro da amostra = começo do período; fora = o final, que a estratégia "não viu". */
export function validarAmostra(
  d: DadosValidacao,
  inicio: number,
  fim: number,
  fracaoDentro: number,
): AmostraValidacao {
  const corte = corteDaAmostra(inicio, fim, fracaoDentro);
  const dentro = resumoDoTrecho(d, { inicio, fim: corte });
  const fora = resumoDoTrecho(d, { inicio: corte, fim });
  return { fracaoDentro, corte, dentro, fora, ...compararAmostras(dentro, fora) };
}
