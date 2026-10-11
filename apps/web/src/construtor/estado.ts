import type { EstrategiaDTO } from "@zentrade/contratos/esquemas";
import { validarEstrategia, validarRegra } from "@zentrade/dominio";
import type { NovaEstrategia } from "../api/fonte";
import { paraDominio } from "../lib/estrategia";
import { lerDecimalDigitado, paraCampo } from "../lib/entrada";
import {
  alternarGrupo,
  deRegra,
  desfazerNao,
  envolverEmNao,
  inserir,
  localizar,
  mover,
  moverEntreIrmaos,
  novoComparar,
  novoGrupo,
  novoNao,
  paraRegra,
  remover,
  atualizar,
  type NoEditor,
} from "./arvore";

/**
 * Estado do construtor (nome, árvores de entrada e saída, stop/alvo/taxa como
 * digitados) e o redutor que o muda. Puro: a tela só despacha ações.
 */
export type Bloco = "comparar" | "e" | "ou" | "nao";
export type Arvore = "entrada" | "saida";

export interface EstadoConstrutor {
  readonly id: string | null;
  readonly versao: number;
  readonly nome: string;
  readonly entrada: NoEditor;
  readonly saida: NoEditor | null;
  readonly editando: Arvore;
  readonly stop: string;
  readonly alvo: string;
  readonly taxa: string;
}

export type Acao =
  | { readonly tipo: "nome"; readonly nome: string }
  | { readonly tipo: "parametro"; readonly campo: "stop" | "alvo" | "taxa"; readonly valor: string }
  | { readonly tipo: "editar"; readonly arvore: Arvore }
  | { readonly tipo: "ligarSaida"; readonly ligada: boolean }
  | { readonly tipo: "adicionar"; readonly destinoId: string; readonly indice: number; readonly bloco: Bloco }
  | { readonly tipo: "mover"; readonly id: string; readonly destinoId: string; readonly indice: number }
  | { readonly tipo: "moverIrmao"; readonly id: string; readonly delta: -1 | 1 }
  | { readonly tipo: "remover"; readonly id: string }
  | { readonly tipo: "nao"; readonly id: string }
  | { readonly tipo: "alternarGrupo"; readonly id: string }
  | { readonly tipo: "trocarNo"; readonly no: NoEditor }
  | { readonly tipo: "carregar"; readonly estado: EstadoConstrutor };

const percentual = (fracao: number): string => paraCampo(String(Math.round(fracao * 10_000) / 100));

export function estadoVazio(): EstadoConstrutor {
  return {
    id: null,
    versao: 0,
    nome: "",
    entrada: novoGrupo("e", [novoComparar()]),
    saida: null,
    editando: "entrada",
    stop: "2,5",
    alvo: "3",
    taxa: "0,1",
  };
}

export function deEstrategia(e: EstrategiaDTO): EstadoConstrutor {
  return {
    id: e.id,
    versao: e.versao,
    nome: e.nome,
    entrada: deRegra(e.entrada),
    saida: e.saida ? deRegra(e.saida) : null,
    editando: "entrada",
    stop: percentual(e.stop),
    alvo: percentual(e.alvoLiquido),
    taxa: percentual(e.taxa),
  };
}

export function criarBloco(b: Bloco): NoEditor {
  if (b === "comparar") return novoComparar();
  if (b === "nao") return novoNao();
  return novoGrupo(b);
}

function naArvore(e: EstadoConstrutor, f: (raiz: NoEditor) => NoEditor): EstadoConstrutor {
  if (e.editando === "saida") return e.saida ? { ...e, saida: f(e.saida) } : e;
  return { ...e, entrada: f(e.entrada) };
}

export function redutor(e: EstadoConstrutor, a: Acao): EstadoConstrutor {
  switch (a.tipo) {
    case "nome":
      return { ...e, nome: a.nome };
    case "parametro":
      return { ...e, [a.campo]: a.valor };
    case "editar":
      return { ...e, editando: a.arvore };
    case "ligarSaida":
      return a.ligada
        ? { ...e, saida: e.saida ?? novoGrupo("ou", [novoComparar()]), editando: "saida" }
        : { ...e, saida: null, editando: "entrada" };
    case "adicionar":
      return naArvore(e, (r) => inserir(r, a.destinoId, a.indice, criarBloco(a.bloco)));
    case "mover":
      return naArvore(e, (r) => mover(r, a.id, a.destinoId, a.indice));
    case "moverIrmao":
      return naArvore(e, (r) => moverEntreIrmaos(r, a.id, a.delta));
    case "remover":
      return naArvore(e, (r) => remover(r, a.id));
    case "nao":
      return naArvore(e, (r) => {
        const no = localizar(r, a.id)?.no;
        return no?.tipo === "nao" ? desfazerNao(r, a.id) : envolverEmNao(r, a.id);
      });
    case "alternarGrupo":
      return naArvore(e, (r) => alternarGrupo(r, a.id));
    case "trocarNo":
      return naArvore(e, (r) => atualizar(r, a.no.id, () => a.no));
    case "carregar":
      return a.estado;
  }
}

/** Percentual digitado ("2,5") → fração (0.025). Só para os parâmetros, não é dinheiro. */
export function fracaoDe(texto: string): number | null {
  const v = lerDecimalDigitado(texto);
  return v === null ? null : Number(v) / 100;
}

export interface Montagem {
  readonly estrategia: NovaEstrategia | null;
  readonly problemas: readonly string[];
}

/** Junta tudo e valida com o domínio (validarRegra e validarEstrategia). */
export function montar(e: EstadoConstrutor): Montagem {
  const problemas: string[] = [];
  if (!e.nome.trim()) problemas.push("dê um nome à estratégia");
  if (e.nome.trim().length > 80) problemas.push("o nome tem mais de 80 letras");
  const entrada = paraRegra(e.entrada);
  const saida = e.saida ? paraRegra(e.saida) : null;
  problemas.push(
    ...entrada.problemas.map((p) => `entrada: ${p}`),
    ...(saida?.problemas.map((p) => `saída: ${p}`) ?? []),
  );
  const stop = fracaoDe(e.stop);
  const alvo = fracaoDe(e.alvo);
  const taxa = fracaoDe(e.taxa);
  if (stop === null) problemas.push("o stop precisa ser um número, como 2,5");
  if (alvo === null) problemas.push("o alvo precisa ser um número, como 3");
  if (taxa === null) problemas.push("a taxa precisa ser um número, como 0,1");
  if (!entrada.regra || (saida && !saida.regra) || stop === null || alvo === null || taxa === null) {
    return { estrategia: null, problemas: [...new Set(problemas)] };
  }
  const estrategia: NovaEstrategia = {
    nome: e.nome.trim(),
    entrada: entrada.regra,
    ...(saida?.regra ? { saida: saida.regra } : {}),
    stop,
    alvoLiquido: alvo,
    taxa,
  };
  const daEntrada = validarRegra(estrategia.entrada);
  const daSaida = estrategia.saida ? validarRegra(estrategia.saida) : [];
  const dasRegras = new Set([...daEntrada, ...daSaida]);
  const doDominio = [
    ...daEntrada.map((p) => `entrada: ${p}`),
    ...daSaida.map((p) => `saída: ${p}`),
    ...validarEstrategia(paraDominio(estrategia)).filter((p) => !dasRegras.has(p)),
  ];
  const todos = [...new Set([...problemas, ...doDominio])];
  return todos.length ? { estrategia: null, problemas: todos } : { estrategia, problemas: [] };
}
