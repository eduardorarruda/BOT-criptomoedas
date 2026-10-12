import type { Comparador, Operando } from "@zentrade/dominio";

/**
 * Condições prontas da paleta: atalhos para os indicadores novos já com
 * parâmetros clássicos. Viram uma condição comum, que a pessoa edita depois.
 */
export interface CondicaoPronta {
  readonly id: `pronta:${string}`;
  readonly nome: string;
  readonly dica: string;
  readonly esquerda: Operando;
  readonly comparador: Comparador;
  readonly direita: Operando;
}

const preco: Operando = { tipo: "preco" };
const numero = (valor: number): Operando => ({ tipo: "numero", valor });

export const CONDICOES_PRONTAS: readonly CondicaoPronta[] = [
  {
    id: "pronta:rompimento",
    nome: "Rompimento",
    dica: "preço acima do topo de Donchian",
    esquerda: preco,
    comparador: ">",
    direita: { tipo: "indicador", nome: "donchian", periodo: 20, saida: "superior" },
  },
  {
    id: "pronta:banda",
    nome: "Banda inferior",
    dica: "preço abaixo de Bollinger",
    esquerda: preco,
    comparador: "<",
    direita: { tipo: "indicador", nome: "bollinger", periodo: 20, desvios: 2, saida: "inferior" },
  },
  {
    id: "pronta:macd",
    nome: "MACD virou",
    dica: "linha cruza o sinal para cima",
    esquerda: { tipo: "indicador", nome: "macd", rapida: 12, lenta: 26, periodoSinal: 9, saida: "macd" },
    comparador: "cruzouAcima",
    direita: { tipo: "indicador", nome: "macd", rapida: 12, lenta: 26, periodoSinal: 9, saida: "sinal" },
  },
  {
    id: "pronta:adx",
    nome: "Tendência forte",
    dica: "ADX acima de 25",
    esquerda: { tipo: "indicador", nome: "adx", periodo: 14, saida: "adx" },
    comparador: ">",
    direita: numero(25),
  },
  {
    id: "pronta:volume",
    nome: "Volume alto",
    dica: "50% acima da média",
    esquerda: { tipo: "indicador", nome: "volumeRelativo", periodo: 20 },
    comparador: ">",
    direita: numero(1.5),
  },
  {
    id: "pronta:estocastico",
    nome: "Estocástico baixo",
    dica: "%K abaixo de 20",
    esquerda: { tipo: "indicador", nome: "estocastico", periodo: 14, suavizacao: 3, saida: "k" },
    comparador: "<",
    direita: numero(20),
  },
];

export const condicaoPronta = (id: string): CondicaoPronta | undefined =>
  CONDICOES_PRONTAS.find((c) => c.id === id);
