import type { NovoEventoMercadoDTO } from "@zentrade/contratos/esquemas";
import { diaNoFuso } from "@zentrade/dominio";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useContext, useMemo } from "react";
import { useFonte } from "../../api/contexto";
import { chaves } from "../../ganchos/chaves";
import { fusoDaInstancia } from "../../lib/fuso";
import { criarFonteAgenda, criarFonteAgendaDemo, type FonteAgenda } from "./agenda-fonte";

/** Os testes trocam a fonte da agenda por este contexto; na aplicação ele fica vazio. */
export const ContextoFonteAgenda = createContext<FonteAgenda | null>(null);

const demos = new WeakMap<object, FonteAgenda>();

function useFonteAgenda(): FonteAgenda {
  const injetada = useContext(ContextoFonteAgenda);
  const fonte = useFonte();
  return useMemo(() => {
    if (injetada) return injetada;
    if (!fonte.demo) return criarFonteAgenda();
    // Uma demonstração por fonte: a agenda cadastrada sobrevive à navegação.
    const existente = demos.get(fonte) ?? criarFonteAgendaDemo(Date.now, fonte.vazio);
    demos.set(fonte, existente);
    return existente;
  }, [injetada, fonte]);
}

const DIA_MS = 86_400_000;
/** A tela mostra de hoje até daqui a 90 dias. */
export const DIAS_NA_AGENDA = 90;

/** O período da tela: hoje (no fuso da instância) e daqui a 90 dias. */
export function periodoDaAgenda(agora: number = Date.now()): { de: string; ate: string } {
  const fuso = fusoDaInstancia();
  return { de: diaNoFuso(agora, fuso), ate: diaNoFuso(agora + DIAS_NA_AGENDA * DIA_MS, fuso) };
}

export function useEventosAgenda() {
  const fonte = useFonteAgenda();
  const { de, ate } = periodoDaAgenda();
  return useQuery({
    queryKey: [...chaves.agenda, de, ate] as const,
    queryFn: () => fonte.listar(de, ate),
  });
}

function useEscritaAgenda<A, R>(acao: (fonte: FonteAgenda, a: A) => Promise<R>) {
  const fonte = useFonteAgenda();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (a: A) => acao(fonte, a),
    onSettled: () => void qc.invalidateQueries({ queryKey: chaves.agenda }),
  });
}

export const useCriarEvento = () => useEscritaAgenda((f, e: NovoEventoMercadoDTO) => f.criar(e));
export const useConfirmarEvento = () => useEscritaAgenda((f, id: string) => f.confirmar(id));
export const useRemoverEvento = () => useEscritaAgenda((f, id: string) => f.remover(id));
export const useSugerirEventos = () => useEscritaAgenda((f, _: undefined) => f.sugerir());
