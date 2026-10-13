import type {
  MudancaInvestimentoImobiliario,
  NovoInvestimentoImobiliario,
  NovoLancamentoImobiliario,
} from "@zentrade/contratos/esquemas";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, createElement, useCallback, useContext, useState, type ReactNode } from "react";
import { useFonte } from "../../api/contexto";
import { criarFonteImobiliarioDemo } from "./demo";
import { criarFonteImobiliarioApi, type FonteImobiliario } from "./fonte";

/** Consultas e escritas do imobiliário, com a premissa de CDI guardada no navegador. */
const ContextoImobiliario = createContext<FonteImobiliario | null>(null);

/** Para testes (ou outra origem de dados): troca a fonte do imobiliário. */
export function ProvedorFonteImobiliario({
  fonte,
  children,
}: {
  readonly fonte: FonteImobiliario;
  readonly children: ReactNode;
}) {
  return createElement(ContextoImobiliario.Provider, { value: fonte }, children);
}

const DIA_LOCAL = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
export const hojeLocal = (): string => DIA_LOCAL.format(new Date());

const fontes: { demo?: FonteImobiliario; api?: FonteImobiliario } = {};
function fonteDoModo(demo: boolean): FonteImobiliario {
  if (demo) return (fontes.demo ??= criarFonteImobiliarioDemo(hojeLocal()));
  return (fontes.api ??= criarFonteImobiliarioApi());
}

function useFonteImobiliario(): FonteImobiliario {
  const injetada = useContext(ContextoImobiliario);
  const { demo } = useFonte();
  return injetada ?? fonteDoModo(demo);
}

const CHAVE_CDI = "zentrade.imobiliario.cdi";

function lerCdi(): number | null {
  try {
    const v = Number(localStorage.getItem(CHAVE_CDI));
    return localStorage.getItem(CHAVE_CDI) !== null && Number.isFinite(v) && v >= 0 && v <= 1 ? v : null;
  } catch {
    return null;
  }
}

/** CDI anual que a pessoa quer usar na comparação (premissa dela; vazio = sem comparação). */
export function useCdiPremissa(): [number | null, (v: number | null) => void] {
  const [cdi, setCdi] = useState<number | null>(lerCdi);
  const definir = useCallback((v: number | null) => {
    setCdi(v);
    try {
      if (v === null) localStorage.removeItem(CHAVE_CDI);
      else localStorage.setItem(CHAVE_CDI, String(v));
    } catch {
      // Sem armazenamento (aba privada): a premissa vale só nesta visita.
    }
  }, []);
  return [cdi, definir];
}

const chavesImobiliario = {
  todas: ["imobiliario"] as const,
  visao: (cdi: number | null) => ["imobiliario", "visao", cdi] as const,
  detalhe: (id: string, cdi: number | null) => ["imobiliario", "detalhe", id, cdi] as const,
};

export function useVisaoImobiliario(cdi: number | null) {
  const fonte = useFonteImobiliario();
  return useQuery({ queryKey: chavesImobiliario.visao(cdi), queryFn: () => fonte.visao({ cdiAnual: cdi }) });
}

export function useDetalheImobiliario(id: string, cdi: number | null) {
  const fonte = useFonteImobiliario();
  return useQuery({
    queryKey: chavesImobiliario.detalhe(id, cdi),
    queryFn: () => fonte.detalhe(id, { cdiAnual: cdi }),
  });
}

function useEscrita<A, R>(fn: (fonte: FonteImobiliario, a: A) => Promise<R>) {
  const fonte = useFonteImobiliario();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (a: A) => fn(fonte, a),
    onSuccess: () => qc.invalidateQueries({ queryKey: chavesImobiliario.todas }),
  });
}

export const useCriarInvestimento = () => useEscrita((f, novo: NovoInvestimentoImobiliario) => f.criar(novo));
export const useAtualizarInvestimento = (id: string) =>
  useEscrita((f, m: MudancaInvestimentoImobiliario) => f.atualizar(id, m));
export const useRemoverInvestimento = () => useEscrita((f, id: string) => f.remover(id));
export const useAdicionarLancamento = (id: string) =>
  useEscrita((f, l: NovoLancamentoImobiliario) => f.adicionarLancamento(id, l));
export const useRemoverLancamento = (id: string) =>
  useEscrita((f, lancamentoId: string) => f.removerLancamento(id, lancamentoId));
