/**
 * Estatística pequena do placar do Claude: o intervalo de Wilson para uma proporção
 * (a precisão das aprovações com 12 casos não é a mesma coisa que com 300) e o Brier
 * score da confiança.
 */

/** z de 95% (bilateral). */
const Z95 = 1.959963984540054;

export interface Intervalo {
  readonly inferior: number;
  readonly superior: number;
}

/**
 * Intervalo de Wilson de 95% para `acertos` em `total`. Melhor que p ± z·√(p(1−p)/n)
 * com poucos casos e perto de 0% ou 100%: nunca sai de [0, 1]. Sem casos, [0, 1].
 */
export function intervaloWilson(acertos: number, total: number, z = Z95): Intervalo {
  if (!Number.isInteger(acertos) || !Number.isInteger(total) || acertos < 0 || acertos > total)
    throw new RangeError("acertos e total precisam ser inteiros, com 0 ≤ acertos ≤ total");
  if (total === 0) return { inferior: 0, superior: 1 };
  const p = acertos / total;
  const z2 = z * z;
  const divisor = 1 + z2 / total;
  const centro = (p + z2 / (2 * total)) / divisor;
  const meio = (z / divisor) * Math.sqrt((p * (1 - p)) / total + z2 / (4 * total * total));
  return { inferior: Math.max(0, centro - meio), superior: Math.min(1, centro + meio) };
}

export interface Previsao {
  /** A confiança dita (0 a 1) de que a escolha estava certa. */
  readonly confianca: number;
  readonly acertou: boolean;
}

/**
 * Brier score: média de (confiança − acertou)². 0 é perfeito; dizer sempre 50% dá
 * 0,25; acima disso, a confiança atrapalha mais do que ajuda. Sem previsões, `null`.
 */
export function brier(previsoes: readonly Previsao[]): number | null {
  if (previsoes.length === 0) return null;
  const soma = previsoes.reduce((s, p) => s + (p.confianca - (p.acertou ? 1 : 0)) ** 2, 0);
  return soma / previsoes.length;
}
