import type { LimitesContaDTO } from "@zentrade/contratos/esquemas";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useContext, useMemo } from "react";
import { useFonte } from "../../api/contexto";
import { chaves } from "../../ganchos/chaves";
import { useComConfirmacao } from "../../sessao/Reautenticacao";
import { criarFonteRisco, criarFonteRiscoDemo, type FonteRisco } from "./fonte";

/** Os testes trocam a fonte da tela de Risco por este contexto; na aplicação ele fica vazio. */
export const ContextoFonteRisco = createContext<FonteRisco | null>(null);

const demos = new WeakMap<object, FonteRisco>();

function useFonteRisco(): FonteRisco {
  const injetada = useContext(ContextoFonteRisco);
  const fonte = useFonte();
  return useMemo(() => {
    if (injetada) return injetada;
    if (!fonte.demo) return criarFonteRisco();
    // Uma demonstração por fonte: o estado (limites salvos, divergência aceita) sobrevive à navegação.
    const existente = demos.get(fonte) ?? criarFonteRiscoDemo(Date.now, fonte.vazio);
    demos.set(fonte, existente);
    return existente;
  }, [injetada, fonte]);
}

const chavesRisco = {
  todas: chaves.risco,
  situacao: [...chaves.risco, "situacao"] as const,
  divergencias: [...chaves.risco, "divergencias"] as const,
  avisos: [...chaves.risco, "avisos"] as const,
};

/** Pausas e números da conta mudam com o mercado: relê a cada minuto com a tela aberta. */
const ATUALIZAR_MS = 60_000;

export function useSituacaoConta() {
  const fonte = useFonteRisco();
  return useQuery({
    queryKey: chavesRisco.situacao,
    queryFn: () => fonte.situacao(),
    refetchInterval: ATUALIZAR_MS,
  });
}

export function useDivergencias() {
  const fonte = useFonteRisco();
  return useQuery({ queryKey: chavesRisco.divergencias, queryFn: () => fonte.divergencias() });
}

export function useAvisosConta() {
  const fonte = useFonteRisco();
  return useQuery({
    queryKey: chavesRisco.avisos,
    queryFn: () => fonte.avisos(),
    refetchInterval: ATUALIZAR_MS,
  });
}

/** Toda escrita de risco relê a tela inteira de Risco (pausas, divergências e avisos andam juntos). */
function useEscritaRisco<A, R>(acao: (fonte: FonteRisco, a: A) => Promise<R>) {
  const fonte = useFonteRisco();
  const qc = useQueryClient();
  const comConfirmacao = useComConfirmacao();
  return useMutation({
    mutationFn: (a: A) => comConfirmacao(() => acao(fonte, a)),
    onSettled: () => void qc.invalidateQueries({ queryKey: chavesRisco.todas }),
  });
}

export const useSalvarLimites = () => useEscritaRisco((f, l: LimitesContaDTO) => f.salvarLimites(l));
export const useLiberarPausas = () => useEscritaRisco((f, _: undefined) => f.liberar());
export const useReconciliar = () => useEscritaRisco((f, _: undefined) => f.reconciliar());
export const useAceitarDivergencia = () => useEscritaRisco((f, id: string) => f.aceitar(id));
export const useMarcarAvisosLidos = () => useEscritaRisco((f, _: undefined) => f.marcarLidos());
