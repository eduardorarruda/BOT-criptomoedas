import type { Aleatorio } from "./aleatorio";
import { normal } from "./aleatorio";
import { PRECO_BASE, SIMBOLOS, VOLATILIDADE, type SimboloDemo } from "./dados";
import { textoPreco } from "./velas";

/**
 * Preços ao vivo do exemplo: a cada tique, cada símbolo anda um passo aleatório.
 * O mercado só gera preços; quem decide o que fazer com eles é a fonte demo.
 */
interface Tique {
  readonly simbolo: SimboloDemo;
  readonly preco: string;
  readonly em: number;
}

export interface Mercado {
  preco(simbolo: string): string;
  precoNumero(simbolo: string): number;
  tique(agora: number): Tique[];
}

export const ehSimboloDemo = (s: string): s is SimboloDemo => (SIMBOLOS as readonly string[]).includes(s);

export function criarMercado(aleatorio: Aleatorio): Mercado {
  let precos: Readonly<Record<SimboloDemo, number>> = { ...PRECO_BASE };

  const precoNumero = (simbolo: string): number => (ehSimboloDemo(simbolo) ? precos[simbolo] : 0);

  return {
    precoNumero,
    preco: (simbolo) => textoPreco(precoNumero(simbolo)),
    tique(agora) {
      const novos = Object.fromEntries(
        SIMBOLOS.map((s) => [s, precos[s] * (1 + normal(aleatorio) * VOLATILIDADE[s] * 0.35)]),
      ) as Record<SimboloDemo, number>;
      precos = novos;
      return SIMBOLOS.map((simbolo) => ({ simbolo, preco: textoPreco(novos[simbolo]), em: agora }));
    },
  };
}
