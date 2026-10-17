import type { Intervalo } from "@zentrade/contratos/esquemas";
import { useQueries, useQuery } from "@tanstack/react-query";
import { useFonte } from "../api/contexto";
import type { FiltroDecisoes } from "../api/fonte";
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
