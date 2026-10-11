import { rotulo, type Comparador } from "@zentrade/dominio";
import type { NoEditor } from "./arvore";

/**
 * Prévia em linguagem natural da árvore, a partir do `rotulo` do domínio — os
 * mesmos nomes que aparecem nas explicações das decisões.
 */
const VERBO: Record<Comparador, string> = {
  "<": "abaixo de",
  "<=": "no máximo",
  ">": "acima de",
  ">=": "pelo menos",
  cruzouAcima: "cruzar para cima de",
  cruzouAbaixo: "cruzar para baixo de",
};

export const fraseComparador = (c: Comparador): string => VERBO[c];

export function frase(no: NoEditor | null, aninhado = false): string {
  if (!no) return "(vazio)";
  switch (no.tipo) {
    case "comparar":
      return `${rotulo(no.esquerda)} ${VERBO[no.comparador]} ${rotulo(no.direita)}`;
    case "nao":
      return `não (${frase(no.filho)})`;
    case "e":
    case "ou": {
      if (no.filhos.length === 0) return "(grupo vazio)";
      const corpo = no.filhos.map((f) => frase(f, true)).join(no.tipo === "e" ? " e " : " ou ");
      return aninhado && no.filhos.length > 1 ? `(${corpo})` : corpo;
    }
  }
}

export interface Linha {
  readonly nivel: number;
  readonly texto: string;
}

export function linhas(no: NoEditor | null, nivel = 0): Linha[] {
  if (!no) return [{ nivel, texto: "falta uma condição aqui" }];
  switch (no.tipo) {
    case "comparar":
      return [{ nivel, texto: frase(no) }];
    case "nao":
      return [{ nivel, texto: "esta NÃO pode valer:" }, ...linhas(no.filho, nivel + 1)];
    case "e":
    case "ou": {
      const cabeca = no.tipo === "e" ? "todas estas precisam valer:" : "basta uma destas valer:";
      if (no.filhos.length === 0) return [{ nivel, texto: `${cabeca} (nenhuma ainda)` }];
      return [{ nivel, texto: cabeca }, ...no.filhos.flatMap((f) => linhas(f, nivel + 1))];
    }
  }
}
