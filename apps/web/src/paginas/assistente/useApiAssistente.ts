import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { useFonte } from "../../api/contexto";
import { criarApiAssistente, type ApiAssistente } from "./api";
import { apiAssistenteDemo } from "./demo";
import { chavesAssistente } from "./useRespostaAoVivo";

/**
 * A API do assistente certa para a tela: a injetada (testes), a de demonstração (na
 * instalação nova do exemplo, sem o Claude conectado) ou a de verdade.
 */
export function useApiAssistente(injetada?: ApiAssistente): ApiAssistente {
  const fonte = useFonte();
  return useMemo(
    () => injetada ?? (fonte.demo ? apiAssistenteDemo(fonte.vazio === true) : criarApiAssistente()),
    [injetada, fonte.demo, fonte.vazio],
  );
}

export const useEstadoAssistente = (api: ApiAssistente) =>
  useQuery({ queryKey: chavesAssistente.estado, queryFn: () => api.estado() });

/** O Claude da pessoa: se conectou, o final do token e o último teste. */
export const useTokenClaude = (api: ApiAssistente) =>
  useQuery({ queryKey: chavesAssistente.tokenClaude, queryFn: () => api.tokenClaude() });
