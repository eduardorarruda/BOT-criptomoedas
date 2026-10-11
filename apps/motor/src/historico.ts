import {
  aplicarExecucao,
  dec,
  POSICAO_ZERADA,
  type Execucao,
  type Posicao,
  type Valor,
} from "@zentrade/dominio";

export interface OperacaoFechada {
  readonly abertaEm: number;
  readonly fechadaEm: number;
  /** Resultado líquido, com as taxas de compra e de venda. */
  readonly resultado: Valor;
}

interface Passo {
  readonly ex: Execucao;
  readonly antes: Posicao;
  readonly depois: Posicao;
}

/** Reproduz as execuções em ordem, guardando a posição antes e depois de cada uma. */
function reproduzir(execucoes: readonly Execucao[]): Passo[] {
  const passos: Passo[] = [];
  execucoes.reduce((antes, ex) => {
    const depois = aplicarExecucao(antes, ex);
    passos.push({ ex, antes, depois });
    return depois;
  }, POSICAO_ZERADA);
  return passos;
}

/** Cada ida e volta: da primeira compra com a posição zerada até zerar de novo. */
export function operacoesFechadas(execucoes: readonly Execucao[]): OperacaoFechada[] {
  const ops: OperacaoFechada[] = [];
  let abertura: { em: number; resultado: Valor } | null = null;
  for (const { ex, antes, depois } of reproduzir(execucoes)) {
    if (antes.quantidade.isZero()) abertura = { em: ex.em, resultado: antes.resultadoRealizado };
    if (depois.quantidade.isZero() && abertura) {
      ops.push({
        abertaEm: abertura.em,
        fechadaEm: ex.em,
        resultado: depois.resultadoRealizado.minus(abertura.resultado),
      });
      abertura = null;
    }
  }
  return ops;
}

/** Resultado realizado (líquido de taxas) das execuções a partir de `desdeMs`. */
export const resultadoDesde = (execucoes: readonly Execucao[], desdeMs: number): Valor =>
  reproduzir(execucoes)
    .filter((p) => p.ex.em >= desdeMs)
    .reduce((soma, p) => soma.plus(p.depois.resultadoRealizado.minus(p.antes.resultadoRealizado)), dec(0));

export function ultimaPerdaEm(execucoes: readonly Execucao[]): number | null {
  const perdas = operacoesFechadas(execucoes).filter((o) => o.resultado.lt(0));
  return perdas.at(-1)?.fechadaEm ?? null;
}
