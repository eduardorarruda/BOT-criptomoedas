import {
  aplicarExecucao,
  dec,
  POSICAO_ZERADA,
  type Execucao,
  type Lado,
  type Valor,
} from "@zentrade/dominio";

/** Efeito de uma execução no resultado realizado (venda: ganho ou perda; compra: só a taxa). */
export interface Delta {
  readonly em: number;
  readonly lado: Lado;
  readonly delta: Valor;
}

/** Percorre as execuções com a regra de posição do domínio, guardando o efeito de cada uma. */
export function deltasRealizados(execucoes: readonly Execucao[]): Delta[] {
  const deltas: Delta[] = [];
  let posicao = POSICAO_ZERADA;
  for (const ex of execucoes) {
    const depois = aplicarExecucao(posicao, ex);
    deltas.push({
      em: ex.em,
      lado: ex.lado,
      delta: depois.resultadoRealizado.minus(posicao.resultadoRealizado),
    });
    posicao = depois;
  }
  return deltas;
}

const somar = (valores: readonly Valor[]): Valor => valores.reduce((a, b) => a.plus(b), dec(0));

export const resultadoDesde = (execucoes: readonly Execucao[], desdeMs: number): Valor =>
  somar(
    deltasRealizados(execucoes)
      .filter((d) => d.em >= desdeMs)
      .map((d) => d.delta),
  );

export function ultimaPerdaEm(execucoes: readonly Execucao[]): number | null {
  const perdas = deltasRealizados(execucoes).filter((d) => d.lado === "VENDA" && d.delta.isNegative());
  return perdas.at(-1)?.em ?? null;
}

/** Maior distância do pico ao vale do resultado acumulado, partindo de zero. Sempre ≥ 0. */
export function maiorQueda(deltas: readonly { readonly em: number; readonly delta: Valor }[]): Valor {
  let acumulado = dec(0);
  let pico = dec(0);
  let queda = dec(0);
  for (const d of [...deltas].sort((a, b) => a.em - b.em)) {
    acumulado = acumulado.plus(d.delta);
    if (acumulado.gt(pico)) pico = acumulado;
    if (pico.minus(acumulado).gt(queda)) queda = pico.minus(acumulado);
  }
  return queda;
}

export interface ResumoCarteira {
  readonly resultadoHoje: Valor;
  /** Custo das posições abertas (quantidade × preço médio), somado entre os robôs. */
  readonly exposicao: Valor;
  readonly maiorQueda: Valor;
}

export function resumirCarteira(
  execucoesPorRobo: ReadonlyMap<string, readonly Execucao[]>,
  janela: { readonly inicioDia: number; readonly inicioJanela: number },
): ResumoCarteira {
  const todos: Delta[] = [];
  let exposicao = dec(0);
  for (const execucoes of execucoesPorRobo.values()) {
    todos.push(...deltasRealizados(execucoes));
    const posicao = execucoes.reduce(aplicarExecucao, POSICAO_ZERADA);
    exposicao = exposicao.plus(posicao.quantidade.times(posicao.precoMedio));
  }
  return {
    resultadoHoje: somar(todos.filter((d) => d.em >= janela.inicioDia).map((d) => d.delta)),
    exposicao,
    maiorQueda: maiorQueda(todos.filter((d) => d.em >= janela.inicioJanela)),
  };
}

export const inicioDoDiaUtc = (agoraMs: number): number => {
  const d = new Date(agoraMs);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
};
