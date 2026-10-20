import type { Comparador, Operando, Regra } from "@zentrade/dominio";

/**
 * A árvore que o construtor edita. É a `Regra` do domínio com um `id` em cada nó
 * (para arrastar, focar e animar) e com espaço vazio permitido no NÃO enquanto a
 * pessoa monta. `paraRegra` devolve a regra do domínio ou diz o que falta.
 */
export type NoGrupo = {
  readonly id: string;
  readonly tipo: "e" | "ou";
  readonly filhos: readonly NoEditor[];
};
export type NoNao = { readonly id: string; readonly tipo: "nao"; readonly filho: NoEditor | null };
export type NoComparar = {
  readonly id: string;
  readonly tipo: "comparar";
  readonly esquerda: Operando;
  readonly comparador: Comparador;
  readonly direita: Operando;
};
/** Janela de horário "HH:MM" [de, ate), no fuso do mercado; se `de` > `ate`, cruza a meia-noite. */
export type NoHorario = {
  readonly id: string;
  readonly tipo: "horario";
  readonly de: string;
  readonly ate: string;
};
export type NoEditor = NoGrupo | NoNao | NoComparar | NoHorario;
type NoContainer = NoGrupo | NoNao;

let sequencia = 0;
export const novoId = (): string => `no-${++sequencia}`;

export const novoComparar = (): NoComparar => ({
  id: novoId(),
  tipo: "comparar",
  esquerda: { tipo: "indicador", nome: "rsi", periodo: 14 },
  comparador: "<",
  direita: { tipo: "numero", valor: 30 },
});
export const novoHorario = (de = "12:00", ate = "15:00"): NoHorario => ({
  id: novoId(),
  tipo: "horario",
  de,
  ate,
});
export const novoGrupo = (tipo: "e" | "ou", filhos: readonly NoEditor[] = []): NoGrupo => ({
  id: novoId(),
  tipo,
  filhos,
});
export const novoNao = (filho: NoEditor | null = null): NoNao => ({ id: novoId(), tipo: "nao", filho });

const ehContainer = (no: NoEditor): no is NoContainer =>
  no.tipo === "e" || no.tipo === "ou" || no.tipo === "nao";

export function deRegra(r: Regra): NoEditor {
  switch (r.tipo) {
    case "e":
    case "ou":
      return novoGrupo(r.tipo, r.regras.map(deRegra));
    case "nao":
      return novoNao(deRegra(r.regra));
    case "horario":
      return novoHorario(r.de, r.ate);
    case "comparar":
      return {
        id: novoId(),
        tipo: "comparar",
        esquerda: r.esquerda,
        comparador: r.comparador,
        direita: r.direita,
      };
  }
}

export type Conversao =
  | { readonly regra: Regra; readonly problemas: readonly [] }
  | { readonly regra: null; readonly problemas: readonly string[] };

export function paraRegra(no: NoEditor): Conversao {
  const problemas: string[] = [];
  const converter = (n: NoEditor): Regra | null => {
    switch (n.tipo) {
      case "comparar":
        return { tipo: "comparar", esquerda: n.esquerda, comparador: n.comparador, direita: n.direita };
      case "horario":
        return { tipo: "horario", de: n.de, ate: n.ate };
      case "nao": {
        if (!n.filho) {
          problemas.push('um "NÃO" está vazio: arraste uma condição para dentro dele');
          return null;
        }
        const filho = converter(n.filho);
        return filho && { tipo: "nao", regra: filho };
      }
      case "e":
      case "ou": {
        const filhos = n.filhos.map(converter);
        if (filhos.some((f) => f === null)) return null;
        return { tipo: n.tipo, regras: filhos as Regra[] };
      }
    }
  };
  const regra = converter(no);
  return regra && problemas.length === 0
    ? { regra, problemas: [] }
    : { regra: null, problemas: [...new Set(problemas)] };
}

/* ---------- consulta ---------- */

export interface Local {
  readonly no: NoEditor;
  readonly pai: NoContainer | null;
  readonly indice: number;
  readonly profundidade: number;
}

export function localizar(raiz: NoEditor, id: string): Local | null {
  const visitar = (no: NoEditor, pai: NoContainer | null, indice: number, prof: number): Local | null => {
    if (no.id === id) return { no, pai, indice, profundidade: prof };
    if (no.tipo === "e" || no.tipo === "ou") {
      for (const [i, f] of no.filhos.entries()) {
        const achado = visitar(f, no, i, prof + 1);
        if (achado) return achado;
      }
    }
    if (no.tipo === "nao" && no.filho) return visitar(no.filho, no, 0, prof + 1);
    return null;
  };
  return visitar(raiz, null, 0, 0);
}

function contem(no: NoEditor, id: string): boolean {
  return localizar(no, id) !== null;
}

export function contarNos(no: NoEditor): number {
  if (no.tipo === "comparar" || no.tipo === "horario") return 1;
  if (no.tipo === "nao") return 1 + (no.filho ? contarNos(no.filho) : 0);
  return 1 + no.filhos.reduce((t, f) => t + contarNos(f), 0);
}

/* ---------- transformação (sempre devolve uma árvore nova) ---------- */

export function atualizar(raiz: NoEditor, id: string, f: (no: NoEditor) => NoEditor): NoEditor {
  if (raiz.id === id) return f(raiz);
  if (raiz.tipo === "e" || raiz.tipo === "ou")
    return { ...raiz, filhos: raiz.filhos.map((x) => atualizar(x, id, f)) };
  if (raiz.tipo === "nao" && raiz.filho) return { ...raiz, filho: atualizar(raiz.filho, id, f) };
  return raiz;
}

/** Tira o nó da árvore. A raiz não sai (a regra precisa de um começo). */
export function remover(raiz: NoEditor, id: string): NoEditor {
  if (raiz.id === id) return raiz;
  if (raiz.tipo === "e" || raiz.tipo === "ou")
    return { ...raiz, filhos: raiz.filhos.filter((f) => f.id !== id).map((f) => remover(f, id)) };
  if (raiz.tipo === "nao" && raiz.filho)
    return { ...raiz, filho: raiz.filho.id === id ? null : remover(raiz.filho, id) };
  return raiz;
}

/** Põe `no` dentro do grupo `destinoId`, na posição `indice` (no NÃO, só se estiver vazio). */
export function inserir(raiz: NoEditor, destinoId: string, indice: number, no: NoEditor): NoEditor {
  return atualizar(raiz, destinoId, (destino) => {
    if (destino.tipo === "e" || destino.tipo === "ou") {
      const i = Math.max(0, Math.min(indice, destino.filhos.length));
      return { ...destino, filhos: [...destino.filhos.slice(0, i), no, ...destino.filhos.slice(i)] };
    }
    if (destino.tipo === "nao" && destino.filho === null) return { ...destino, filho: no };
    return destino;
  });
}

export function podeReceber(raiz: NoEditor, destinoId: string, movendoId?: string): boolean {
  const destino = localizar(raiz, destinoId)?.no;
  if (!destino || !ehContainer(destino)) return false;
  if (movendoId) {
    const movendo = localizar(raiz, movendoId)?.no;
    if (!movendo || movendo.id === raiz.id || contem(movendo, destinoId)) return false;
    if (destino.tipo === "nao") return destino.filho === null || destino.filho.id === movendoId;
  }
  return destino.tipo !== "nao" || destino.filho === null;
}

export function mover(raiz: NoEditor, id: string, destinoId: string, indice: number): NoEditor {
  if (!podeReceber(raiz, destinoId, id)) return raiz;
  const origem = localizar(raiz, id);
  if (!origem) return raiz;
  const mesmoPai = origem.pai?.id === destinoId;
  const ajuste = mesmoPai && origem.indice < indice ? indice - 1 : indice;
  return inserir(remover(raiz, id), destinoId, ajuste, origem.no);
}

/** Sobe ou desce um nó entre os irmãos (alternativa ao arrastar, pelo teclado). */
export function moverEntreIrmaos(raiz: NoEditor, id: string, delta: -1 | 1): NoEditor {
  const local = localizar(raiz, id);
  if (!local?.pai || local.pai.tipo === "nao") return raiz;
  const alvo = local.indice + delta;
  if (alvo < 0 || alvo >= local.pai.filhos.length) return raiz;
  return mover(raiz, id, local.pai.id, delta === 1 ? alvo + 1 : alvo);
}

export function envolverEmNao(raiz: NoEditor, id: string): NoEditor {
  return atualizar(raiz, id, (no) => novoNao(no));
}

/** Tira o NÃO e deixa a condição de dentro no lugar dele. */
export function desfazerNao(raiz: NoEditor, id: string): NoEditor {
  return atualizar(raiz, id, (no) => (no.tipo === "nao" && no.filho ? no.filho : no));
}

export function alternarGrupo(raiz: NoEditor, id: string): NoEditor {
  return atualizar(raiz, id, (no) =>
    no.tipo === "e" || no.tipo === "ou" ? { ...no, tipo: no.tipo === "e" ? "ou" : "e" } : no,
  );
}

/* ---------- destinos para mover pelo teclado ---------- */

export interface Destino {
  readonly id: string;
  readonly rotulo: string;
}

const NOME_GRUPO = { e: "Grupo E", ou: "Grupo OU", nao: "NÃO" } as const;

export function destinosPara(raiz: NoEditor, movendoId: string): Destino[] {
  const destinos: Destino[] = [];
  const visitar = (no: NoEditor, caminho: string): void => {
    if (!ehContainer(no)) return;
    const rotulo = caminho ? `${caminho} › ${NOME_GRUPO[no.tipo]}` : NOME_GRUPO[no.tipo];
    const local = localizar(raiz, movendoId);
    if (podeReceber(raiz, no.id, movendoId) && local?.pai?.id !== no.id) destinos.push({ id: no.id, rotulo });
    if (no.tipo === "nao") {
      if (no.filho) visitar(no.filho, rotulo);
    } else no.filhos.forEach((f) => visitar(f, rotulo));
  };
  visitar(raiz, "");
  return destinos;
}
