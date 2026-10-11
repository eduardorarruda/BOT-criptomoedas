/**
 * Primeiro índice em que `ehAntes` deixa de ser verdade, numa lista em que ele é
 * verdade num prefixo e falso no resto. Base de toda busca binária do projeto.
 */
export function limiteInferiorPor<T>(itens: readonly T[], ehAntes: (item: T) => boolean): number {
  let inicio = 0;
  let fim = itens.length;
  while (inicio < fim) {
    const meio = (inicio + fim) >>> 1;
    if (ehAntes(itens[meio] as T)) inicio = meio + 1;
    else fim = meio;
  }
  return inicio;
}

/** Primeiro índice com `chave(item) >= alvo` numa lista ordenada pela chave. */
export function limiteInferior<T>(itens: readonly T[], alvo: number, chave: (item: T) => number): number {
  return limiteInferiorPor(itens, (item) => chave(item) < alvo);
}

/**
 * Itens com `inicio <= chave < fim`, em O(log n). No backtest, recortar uma janela de
 * candles de uma série com milhões de pontos não pode varrer a série toda.
 */
export function recorte<T>(
  itens: readonly T[],
  inicio: number,
  fim: number,
  chave: (item: T) => number,
): T[] {
  if (fim < inicio) throw new RangeError("janela inválida: o fim vem antes do início");
  return itens.slice(limiteInferior(itens, inicio, chave), limiteInferior(itens, fim, chave));
}
