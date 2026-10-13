import type { NovoTitulo } from "@zentrade/contratos/esquemas";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useFonte } from "../../api/contexto";
import { criarFonteRendaFixaDemo } from "./demo";
import { criarFonteRendaFixaApi, type FonteRendaFixa, type PremissasTela } from "./fonte";

/** Uma fonte por modo, guardada fora do React: a demonstração mantém o que a pessoa cadastrou. */
let fonteApi: FonteRendaFixa | null = null;
let fonteDemo: FonteRendaFixa | null = null;

export function useFonteRendaFixa(): FonteRendaFixa {
  const { demo } = useFonte();
  if (demo) return (fonteDemo ??= criarFonteRendaFixaDemo());
  return (fonteApi ??= criarFonteRendaFixaApi());
}

const chavesRF = {
  tudo: ["renda-fixa"] as const,
  resumo: ["renda-fixa", "resumo"] as const,
  titulos: ["renda-fixa", "titulos"] as const,
  titulo: (id: string, p: PremissasTela) => ["renda-fixa", "titulo", id, p] as const,
  regras: ["renda-fixa", "regras"] as const,
  pluggy: ["renda-fixa", "pluggy"] as const,
};

export const useResumoRF = () => {
  const f = useFonteRendaFixa();
  return useQuery({ queryKey: chavesRF.resumo, queryFn: () => f.resumo(), staleTime: 60_000 });
};

export const useTitulosRF = () => {
  const f = useFonteRendaFixa();
  return useQuery({ queryKey: chavesRF.titulos, queryFn: () => f.titulos(), staleTime: 60_000 });
};

export const useTituloRF = (id: string | null, premissas: PremissasTela) => {
  const f = useFonteRendaFixa();
  return useQuery({
    queryKey: chavesRF.titulo(id ?? "", premissas),
    queryFn: () => f.titulo(id as string, premissas),
    enabled: id !== null,
  });
};

export const useRegrasRF = () => {
  const f = useFonteRendaFixa();
  return useQuery({ queryKey: chavesRF.regras, queryFn: () => f.regras(), staleTime: Infinity });
};

export const usePluggy = () => {
  const f = useFonteRendaFixa();
  return useQuery({ queryKey: chavesRF.pluggy, queryFn: () => f.pluggy() });
};

/** Mutação que, ao terminar, recarrega tudo da renda fixa (resumo, lista e conexões). */
function useMutacaoRF<E, R>(fazer: (f: FonteRendaFixa, e: E) => Promise<R>) {
  const f = useFonteRendaFixa();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (e: E) => fazer(f, e),
    onSuccess: () => qc.invalidateQueries({ queryKey: chavesRF.tudo }),
  });
}

export const useCriarTitulo = () => useMutacaoRF((f, t: NovoTitulo) => f.criarTitulo(t));
export const useRemoverTitulo = () => useMutacaoRF((f, id: string) => f.removerTitulo(id));
export const useAtualizarIndicadores = () => useMutacaoRF((f, _: undefined) => f.atualizarIndicadores());
export const useConectarItem = () => useMutacaoRF((f, itemId: string) => f.conectarItem(itemId));
export const useSincronizarItem = () => useMutacaoRF((f, itemId: string) => f.sincronizarItem(itemId));
export const useRemoverItem = () => useMutacaoRF((f, itemId: string) => f.removerItem(itemId));
