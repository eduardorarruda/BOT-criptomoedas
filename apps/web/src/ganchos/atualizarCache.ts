import type { DecisaoDTO, OrdemDTO, RoboDTO } from "@zentrade/contratos/esquemas";
import type { EventoAnalise } from "@zentrade/contratos/esquemas";
import type { FiltroDecisoes } from "../api/fonte";

/**
 * Como cada evento ao vivo muda os dados já carregados. Funções puras: recebem a
 * lista antiga e devolvem uma nova.
 */
export function substituirOuIncluir<T extends { id: string }>(
  lista: readonly T[],
  item: T,
  noInicio = true,
): T[] {
  const existe = lista.some((x) => x.id === item.id);
  if (existe) return lista.map((x) => (x.id === item.id ? item : x));
  return noInicio ? [item, ...lista] : [...lista, item];
}

function atendeFiltro(d: DecisaoDTO, f: FiltroDecisoes = {}): boolean {
  return (!f.roboId || d.roboId === f.roboId) && (!f.estado || d.estado === f.estado);
}

/** Decisão nova ou atualizada numa lista filtrada: entra, troca, ou sai se deixou de atender. */
export function aplicarDecisao(
  lista: readonly DecisaoDTO[],
  d: DecisaoDTO,
  f?: FiltroDecisoes,
): DecisaoDTO[] {
  if (!atendeFiltro(d, f)) return lista.filter((x) => x.id !== d.id);
  const nova = substituirOuIncluir(lista, d);
  return f?.limite ? nova.slice(0, f.limite) : nova;
}

export const aplicarOrdem = (lista: readonly OrdemDTO[], o: OrdemDTO): OrdemDTO[] =>
  substituirOuIncluir(lista, o);
export const aplicarRobo = (lista: readonly RoboDTO[], r: RoboDTO): RoboDTO[] =>
  substituirOuIncluir(lista, r, false);

/* ---------- análises em andamento (cartão "pensando") ---------- */

interface EtapaAnalise {
  readonly ferramenta: string;
  readonly descricao: string;
  readonly em: number;
}

export interface AnaliseAoVivo {
  readonly id: string;
  readonly roboId: string;
  readonly etapas: readonly EtapaAnalise[];
  readonly concluida: boolean;
  /** Quando concluída: o que o agente propôs, ou "falhou" (aí o motor não opera). */
  readonly resultado?: NonNullable<EventoAnalise["resultado"]>;
  readonly decisaoId?: string;
}

export type Analises = Readonly<Record<string, AnaliseAoVivo>>;
const MAXIMO_ANALISES = 6;

export function aplicarAnalise(atual: Analises, e: EventoAnalise): Analises {
  const anterior: AnaliseAoVivo = atual[e.analiseId] ?? {
    id: e.analiseId,
    roboId: e.roboId,
    etapas: [],
    concluida: false,
  };
  const etapas = e.etapa ? [...anterior.etapas, e.etapa] : anterior.etapas;
  const nova: AnaliseAoVivo = {
    ...anterior,
    etapas,
    concluida: anterior.concluida || e.concluida,
    ...(e.resultado ? { resultado: e.resultado } : {}),
    ...(e.decisaoId ? { decisaoId: e.decisaoId } : {}),
  };
  const todas = { ...atual, [e.analiseId]: nova };
  const entradas = Object.entries(todas);
  return entradas.length <= MAXIMO_ANALISES ? todas : Object.fromEntries(entradas.slice(-MAXIMO_ANALISES));
}

export function removerAnalise(atual: Analises, id: string): Analises {
  if (!(id in atual)) return atual;
  return Object.fromEntries(Object.entries(atual).filter(([k]) => k !== id));
}
