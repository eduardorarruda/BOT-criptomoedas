import { dec, type Valor } from "@zentrade/dominio";

/**
 * Patrimônio consolidado: soma as classes (cripto, renda fixa, imobiliário) que já
 * chegam avaliadas em reais e diz a fatia de cada uma. Classe sem valor fica fora
 * da soma e o total diz que é parcial; nada é estimado aqui.
 */
export type ClassePatrimonio = "cripto" | "renda_fixa" | "imobiliario";

/**
 * vazia: nada cadastrado (não pesa nem torna o total parcial). completa: tudo avaliado.
 * parcial: entra com o que tem valor. indisponivel: sem valor em reais, fora da soma.
 */
export type SituacaoClasse = "vazia" | "completa" | "parcial" | "indisponivel";

export interface ClasseAvaliada {
  readonly classe: ClassePatrimonio;
  readonly situacao: SituacaoClasse;
  /** Em reais; null quando a classe não pôde ser avaliada. */
  readonly valor: Valor | null;
}

export interface FatiaPatrimonio extends ClasseAvaliada {
  /** Fração da composição (0 a 1); null quando a classe não entra nela. */
  readonly fracao: Valor | null;
}

export interface PatrimonioConsolidado {
  readonly total: Valor;
  /** Alguma classe ficou de fora (ou entrou só em parte). */
  readonly parcial: boolean;
  readonly fatias: readonly FatiaPatrimonio[];
}

const ZERO = dec(0);
const CENTAVOS = 2;

export function situacaoDosItens(itens: number, semValor: number): SituacaoClasse {
  if (itens === 0) return "vazia";
  if (semValor === 0) return "completa";
  return semValor < itens ? "parcial" : "indisponivel";
}

/** Valor em outra moeda × reais por unidade dela, aos centavos. */
export const converterParaReais = (valor: Valor, reaisPorUnidade: Valor): Valor =>
  valor.times(reaisPorUnidade).toDecimalPlaces(CENTAVOS);

const entraNaSoma = (c: ClasseAvaliada): c is ClasseAvaliada & { valor: Valor } =>
  (c.situacao === "completa" || c.situacao === "parcial") && c.valor !== null;

/**
 * O total soma tudo o que tem valor (inclusive negativo: dívida maior que o bem).
 * A composição divide só o que é positivo, para as fatias fecharem em 100%.
 */
export function consolidarPatrimonio(classes: readonly ClasseAvaliada[]): PatrimonioConsolidado {
  const contadas = classes.filter(entraNaSoma);
  const total = contadas.reduce((s, c) => s.plus(c.valor), ZERO);
  const positivo = contadas.reduce((s, c) => (c.valor.gt(0) ? s.plus(c.valor) : s), ZERO);
  const fatias = classes.map((c) => ({
    ...c,
    fracao: entraNaSoma(c) && positivo.gt(0) ? (c.valor.gt(0) ? c.valor.div(positivo) : ZERO) : null,
  }));
  const parcial = classes.some((c) => c.situacao === "parcial" || c.situacao === "indisponivel");
  return { total, parcial, fatias };
}
