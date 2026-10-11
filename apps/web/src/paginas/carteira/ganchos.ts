import type { RedeConta } from "@zentrade/contratos/esquemas";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useContext, useMemo } from "react";
import { useFonte } from "../../api/contexto";
import { criarFonteCarteira, criarFonteCarteiraDemo, type FonteCarteira } from "./fonte";

/** Os testes trocam a fonte da carteira por este contexto; na aplicação ele fica vazio. */
export const ContextoFonteCarteira = createContext<FonteCarteira | null>(null);

export function useFonteCarteira(): FonteCarteira {
  const injetada = useContext(ContextoFonteCarteira);
  const { demo } = useFonte();
  return useMemo(
    () => injetada ?? (demo ? criarFonteCarteiraDemo() : criarFonteCarteira()),
    [injetada, demo],
  );
}

export const chavesCarteira = {
  todas: ["carteira"] as const,
  carteira: (rede?: RedeConta) => ["carteira", "resumo", rede ?? "padrao"] as const,
  ativo: (ativo: string, rede?: RedeConta) => ["carteira", "ativo", ativo, rede ?? "padrao"] as const,
  status: ["carteira", "status"] as const,
};

/** Preços mudam: a carteira se atualiza a cada minuto enquanto a tela está aberta. */
const ATUALIZAR_MS = 60_000;

export function useCarteira(rede?: RedeConta) {
  const fonte = useFonteCarteira();
  return useQuery({
    queryKey: chavesCarteira.carteira(rede),
    queryFn: () => fonte.carteira(rede),
    refetchInterval: ATUALIZAR_MS,
  });
}

export function useCarteiraAtivo(ativo: string | null, rede?: RedeConta) {
  const fonte = useFonteCarteira();
  return useQuery({
    queryKey: chavesCarteira.ativo(ativo ?? "", rede),
    queryFn: () => fonte.ativo(ativo ?? "", rede),
    enabled: ativo !== null,
  });
}

export function useStatusBinance() {
  const fonte = useFonteCarteira();
  return useQuery({ queryKey: chavesCarteira.status, queryFn: () => fonte.status(), staleTime: 60_000 });
}

export function useSincronizar() {
  const fonte = useFonteCarteira();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (rede?: RedeConta) => fonte.sincronizar(rede),
    onSettled: () => void qc.invalidateQueries({ queryKey: chavesCarteira.todas }),
  });
}
