import {
  dec,
  inicioDoDiaNoFuso,
  inicioDoProximoDiaNoFuso,
  type Execucao,
  type Valor,
} from "@zentrade/dominio";
import { deltasRealizados } from "./calculos.js";

export const DIA_MS = 86_400_000;

export interface PontoDiario {
  /** Início do dia (meia-noite no fuso da instância). */
  readonly em: number;
  /** Resultado realizado acumulado (líquido de taxas) até o fim deste dia. */
  readonly valor: Valor;
}

/**
 * Curva do resultado realizado, um ponto por dia no `fuso`, a partir das execuções
 * confirmadas (a mesma regra de posição do domínio). Os dias sem execução repetem o
 * valor do dia anterior. Quando a primeira execução cai dentro da janela, a curva
 * começa no dia anterior a ela, em zero, para mostrar de onde partiu.
 */
export function curvaDiaria(
  execucoesPorRobo: ReadonlyMap<string, readonly Execucao[]>,
  janela: { readonly inicio: number; readonly fim: number },
  fuso: string,
): PontoDiario[] {
  const deltas = [...execucoesPorRobo.values()]
    .flatMap((e) => deltasRealizados(e))
    .sort((a, b) => a.em - b.em);
  const primeira = deltas[0];
  if (!primeira) return [];
  const ultimoDia = inicioDoDiaNoFuso(janela.fim, fuso);
  const diaDaPrimeira = inicioDoDiaNoFuso(primeira.em, fuso);
  const inicioJanela = inicioDoDiaNoFuso(janela.inicio, fuso);
  const primeiroDia =
    diaDaPrimeira > inicioJanela ? inicioDoDiaNoFuso(diaDaPrimeira - 1, fuso) : inicioJanela;

  let acumulado = dec(0);
  let i = 0;
  const pontos: PontoDiario[] = [];
  // Dias de 23 ou 25 horas (horário de verão): o próximo dia vem do fuso, não de +24 h.
  for (let dia = primeiroDia; dia <= ultimoDia; dia = inicioDoProximoDiaNoFuso(dia, fuso)) {
    const proximo = inicioDoProximoDiaNoFuso(dia, fuso);
    for (; i < deltas.length && (deltas[i]?.em ?? Infinity) < proximo; i++) {
      acumulado = acumulado.plus(deltas[i]?.delta ?? 0);
    }
    pontos.push({ em: dia, valor: acumulado });
  }
  return pontos;
}

/** Taxas pagas (moeda de cotação) a partir de um instante, somadas de todos os robôs. */
export function taxasDesde(execucoesPorRobo: ReadonlyMap<string, readonly Execucao[]>, desde: number): Valor {
  let total = dec(0);
  for (const execucoes of execucoesPorRobo.values()) {
    for (const e of execucoes) if (e.em >= desde) total = total.plus(e.taxaCotacao);
  }
  return total;
}
