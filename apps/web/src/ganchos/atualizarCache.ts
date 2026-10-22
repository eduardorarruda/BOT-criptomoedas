import type {
  DecisaoDTO,
  OrdemDTO,
  PensamentoAtualDTO,
  PensamentoDTO,
  RoboDTO,
} from "@zentrade/contratos/esquemas";
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

/**
 * O pensamento novo de um robô troca o dele na lista (um item por robô). Robô que ainda não
 * tinha pensado entra se a tela já conhece o ativo e o intervalo dele; senão devolve `null`
 * (quem chamou recarrega a lista).
 */
export function aplicarPensamento(
  lista: readonly PensamentoAtualDTO[],
  roboId: string,
  pensamento: PensamentoDTO,
  robo: Pick<RoboDTO, "simbolo" | "intervalo"> | undefined,
): PensamentoAtualDTO[] | null {
  const atual = lista.find((p) => p.roboId === roboId);
  const base = atual ?? (robo ? { roboId, simbolo: robo.simbolo, intervalo: robo.intervalo } : null);
  if (!base) return null;
  const novo: PensamentoAtualDTO = { ...base, pensamento };
  return atual ? lista.map((p) => (p.roboId === roboId ? novo : p)) : [...lista, novo];
}

/** A leitura entra no histórico curto quando é a primeira, o cenário mudou ou houve sinal. */
export function entraNoHistorico(anterior: PensamentoDTO | undefined, novo: PensamentoDTO): boolean {
  return !anterior || anterior.cenario.cenario !== novo.cenario.cenario || novo.sinal !== "AGUARDAR";
}

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
