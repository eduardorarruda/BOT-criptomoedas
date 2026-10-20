import { createContext, useContext, type Dispatch } from "react";
import type { NoEditor } from "./arvore";
import type { Acao, Bloco } from "./estado";
import { condicaoPronta } from "./prontas";

/** O que está sendo arrastado agora, e como avisar o leitor de tela do que mudou. */
export type Arrastando =
  { readonly tipo: "novo"; readonly bloco: Bloco } | { readonly tipo: "mover"; readonly id: string } | null;

export interface ContextoConstrutor {
  readonly raiz: NoEditor;
  readonly despachar: Dispatch<Acao>;
  readonly arrastando: Arrastando;
  readonly setArrastando: (a: Arrastando) => void;
  readonly anunciar: (texto: string) => void;
  readonly focar: (id: string) => void;
}

export const Contexto = createContext<ContextoConstrutor | null>(null);

export function useConstrutor(): ContextoConstrutor {
  const c = useContext(Contexto);
  if (!c) throw new Error("useConstrutor precisa estar dentro do editor de regras");
  return c;
}

export const TIPO_ARRASTE = "application/x-zentrade-bloco";

const NOME_BASICO: Readonly<Record<string, string>> = {
  comparar: "Condição",
  horario: "Horário",
  e: "Grupo E",
  ou: "Grupo OU",
  nao: "NÃO",
};

/** Nome do bloco para os avisos de leitor de tela ("Condição adicionada…"). */
export const nomeDoBloco = (b: Bloco): string =>
  NOME_BASICO[b] ?? `Condição pronta “${condicaoPronta(b)?.nome ?? b}”`;
