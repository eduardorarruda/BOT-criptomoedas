export interface CasoAvaliacao {
  readonly pergunta: string;
  /** Títulos dos documentos que respondem a pergunta; basta um aparecer. */
  readonly esperados: readonly string[];
}

export interface ResultadoAvaliacao {
  readonly recall: number;
  readonly falhas: readonly { pergunta: string; esperados: readonly string[]; vistos: readonly string[] }[];
}

/** recall@k: fração das perguntas em que algum documento esperado aparece entre os k primeiros. */
export async function medirRecall(
  casos: readonly CasoAvaliacao[],
  buscarTitulos: (pergunta: string) => Promise<readonly string[]>,
  k: number,
): Promise<ResultadoAvaliacao> {
  if (casos.length === 0) throw new RangeError("conjunto de avaliação vazio: inclua ao menos uma pergunta");
  const falhas: { pergunta: string; esperados: readonly string[]; vistos: readonly string[] }[] = [];
  for (const caso of casos) {
    const vistos = (await buscarTitulos(caso.pergunta)).slice(0, k);
    if (!caso.esperados.some((e) => vistos.includes(e))) falhas.push({ ...caso, vistos });
  }
  return { recall: (casos.length - falhas.length) / casos.length, falhas };
}
