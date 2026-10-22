import type { Intervalo } from "@zentrade/contratos/esquemas";
import { useQueries, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import type { DecisaoDTO } from "@zentrade/contratos/esquemas";
import { useFonte } from "../api/contexto";
import type { FiltroDecisoes, FiltroPlacar } from "../api/fonte";
import { chaves } from "./chaves";

/** Leituras. As escritas ficam em mutacoes.ts. */
export function useSessao() {
  const fonte = useFonte();
  return useQuery({ queryKey: chaves.sessao, queryFn: () => fonte.obterSessao(), staleTime: Infinity });
}

export function useResumo() {
  const fonte = useFonte();
  return useQuery({
    queryKey: chaves.resumo,
    queryFn: () => fonte.resumo(),
    refetchInterval: fonte.demo ? 4000 : 15_000,
  });
}

export function usePatrimonio() {
  const fonte = useFonte();
  return useQuery({ queryKey: chaves.patrimonio, queryFn: () => fonte.patrimonio(), staleTime: 60_000 });
}

export function useSaude() {
  const fonte = useFonte();
  return useQuery({ queryKey: chaves.saude, queryFn: () => fonte.saude(), refetchInterval: 30_000 });
}

/** Contato do controlador (LGPD) e versão: muda só quando quem opera reinicia a API. */
export function useConfigPublica() {
  const fonte = useFonte();
  return useQuery({
    queryKey: chaves.configPublica,
    queryFn: () => fonte.configPublica(),
    staleTime: Infinity,
  });
}

export function useEstrategias() {
  const fonte = useFonte();
  return useQuery({ queryKey: chaves.estrategias, queryFn: () => fonte.estrategias() });
}

export function useRobos() {
  const fonte = useFonte();
  return useQuery({ queryKey: chaves.robos, queryFn: () => fonte.robos() });
}

export function usePosicoes(roboIds: readonly string[]) {
  const fonte = useFonte();
  return useQueries({
    queries: roboIds.map((id) => ({ queryKey: chaves.posicao(id), queryFn: () => fonte.posicao(id) })),
  });
}

export function useDecisoes(filtro: FiltroDecisoes = {}) {
  const fonte = useFonte();
  return useQuery({ queryKey: chaves.decisoes(filtro), queryFn: () => fonte.decisoes(filtro) });
}

/** Uma decisão aberta por inteiro; o que já está na lista serve de ponto de partida enquanto carrega. */
export function useDecisao(id: string) {
  const fonte = useFonte();
  const qc = useQueryClient();
  return useQuery({
    queryKey: chaves.decisao(id),
    queryFn: () => fonte.decisao(id),
    initialData: () => lerDecisaoDaLista(qc, id),
    // A lista não traz a ordem: com o dado da lista, relê assim mesmo.
    initialDataUpdatedAt: 0,
  });
}

/** O que cada robô está pensando; os eventos ao vivo trocam o item do robô na hora. */
export function usePensamentos() {
  const fonte = useFonte();
  return useQuery({
    queryKey: chaves.pensamentos,
    queryFn: () => fonte.pensamentos(),
    refetchInterval: 60_000,
  });
}

export function useHistoricoDoPensamento(roboId: string) {
  const fonte = useFonte();
  return useQuery({
    queryKey: chaves.historicoDoPensamento(roboId),
    queryFn: () => fonte.historicoDoPensamento(roboId),
  });
}

/** O avaliador do motor grava de 5 em 5 minutos: a tela relê no mesmo ritmo. */
const PLACAR_RELER_MS = 5 * 60_000;

export function usePlacar(filtro: FiltroPlacar = {}) {
  const fonte = useFonte();
  return useQuery({
    queryKey: chaves.placar(filtro),
    queryFn: () => fonte.placar(filtro),
    refetchInterval: PLACAR_RELER_MS,
  });
}

export function useOrdens(roboId?: string) {
  const fonte = useFonte();
  return useQuery({ queryKey: chaves.ordens(roboId), queryFn: () => fonte.ordens(roboId) });
}

export function useCandles(simbolo: string, intervalo: Intervalo) {
  const fonte = useFonte();
  return useQuery({
    queryKey: chaves.candles(simbolo, intervalo),
    queryFn: () => fonte.candles(simbolo, intervalo),
    staleTime: 60_000,
  });
}

export function useContas() {
  const fonte = useFonte();
  return useQuery({ queryKey: chaves.contas, queryFn: () => fonte.contas() });
}

export function useTokens() {
  const fonte = useFonte();
  return useQuery({ queryKey: chaves.tokens, queryFn: () => fonte.tokens() });
}

export function useBacktests() {
  const fonte = useFonte();
  return useQuery({
    queryKey: chaves.backtests,
    queryFn: () => fonte.backtests(),
    refetchInterval: (q) =>
      q.state.data?.some((b) => b.estado === "na_fila" || b.estado === "rodando") ? 1500 : false,
  });
}

export function useDadosWin() {
  const fonte = useFonte();
  return useQuery({ queryKey: chaves.dadosWin, queryFn: () => fonte.dadosWin() });
}

export function useDocumentos() {
  const fonte = useFonte();
  return useQuery({ queryKey: chaves.documentos, queryFn: () => fonte.documentos() });
}

export function useAutomacoes() {
  const fonte = useFonte();
  return useQuery({
    queryKey: chaves.automacoes,
    queryFn: () => fonte.automacoes(),
    refetchInterval: 60_000,
  });
}

/** Histórico curto para a tela "Ao vivo" abrir preenchida; depois, o WebSocket segue. */
export function useAoVivo(roboId?: string) {
  const fonte = useFonte();
  return useQuery({
    queryKey: chaves.aoVivo(roboId),
    queryFn: () => fonte.aoVivo(roboId),
    staleTime: Infinity,
  });
}

function lerDecisaoDaLista(qc: QueryClient, id: string): DecisaoDTO | undefined {
  for (const [, lista] of qc.getQueriesData<DecisaoDTO[]>({ queryKey: chaves.decisoesTodas }))
    for (const d of lista ?? []) if (d.id === id) return d;
  return undefined;
}
