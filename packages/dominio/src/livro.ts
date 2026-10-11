import { dec, type Valor } from "./dinheiro.js";
import { limiteInferiorPor } from "./busca.js";

export interface NivelLivro {
  readonly preco: Valor;
  readonly quantidade: Valor;
}

export interface Estimativa {
  readonly precoMedio: Valor;
  readonly piorPreco: Valor;
  /** Distância do preço médio para o melhor preço, em fração. */
  readonly deslizamento: Valor;
}

/**
 * Quanto custaria executar `quantidade` agora, atravessando o livro (níveis do
 * melhor para o pior). Acumula as quantidades e acha por busca binária o nível que
 * completa a ordem. `null` quando o livro não tem quantidade suficiente.
 */
export function estimarExecucao(niveis: readonly NivelLivro[], quantidade: Valor): Estimativa | null {
  if (quantidade.lte(0)) throw new RangeError("a quantidade precisa ser positiva");
  const melhor = niveis[0];
  if (!melhor) return null;

  const acumulado: Valor[] = [];
  niveis.reduce((soma, n) => {
    const s = soma.plus(n.quantidade);
    acumulado.push(s);
    return s;
  }, dec(0));

  const ultimo = limiteInferiorPor(acumulado, (a) => a.lt(quantidade));
  const nivelFinal = niveis[ultimo];
  if (!nivelFinal) return null;

  const cheios = niveis
    .slice(0, ultimo)
    .reduce((custo, n) => custo.plus(n.preco.times(n.quantidade)), dec(0));
  const jaCoberto = ultimo === 0 ? dec(0) : (acumulado[ultimo - 1] as Valor);
  const custo = cheios.plus(quantidade.minus(jaCoberto).times(nivelFinal.preco));
  const precoMedio = custo.div(quantidade);
  return {
    precoMedio,
    piorPreco: nivelFinal.preco,
    deslizamento: precoMedio.minus(melhor.preco).abs().div(melhor.preco),
  };
}
