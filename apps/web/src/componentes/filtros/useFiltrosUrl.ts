import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useCallback, useMemo } from "react";
import { semVazios, validarBusca, type BuscaDe, type EsquemaBusca } from "./esquemas";
import { contarAtivos } from "./logica";

export interface OpcoesMudanca {
  /** Troca a entrada do histórico em vez de criar outra (ex.: cada letra digitada na busca). */
  readonly substituir?: boolean;
}

/** Chaves que mudam a forma de ver, não o que se vê: não contam como filtro nem são limpas. */
export const CHAVES_DE_VISAO = ["visao", "ordem", "dir", "densidade", "agrupar", "pagina"] as const;

/**
 * O estado dos filtros mora na URL: dá para compartilhar o link, recarregar e usar
 * voltar/avançar. Lê pela validação da página e escreve só o que mudou; qualquer
 * mudança que não seja de página volta para a página 1.
 */
export function useFiltrosUrl<S extends EsquemaBusca>(
  esquema: S,
  naoContam: readonly string[] = CHAVES_DE_VISAO,
) {
  type Busca = BuscaDe<S>;
  const validar = useMemo(() => validarBusca(esquema), [esquema]);
  const bruto = useRouterState({ select: (s) => s.location.search });
  const busca: Busca = useMemo(() => validar(bruto as Record<string, unknown>), [validar, bruto]);
  const navegar = useNavigate();

  const ir = useCallback(
    (proxima: (anterior: Record<string, unknown>) => Record<string, unknown>, o: OpcoesMudanca = {}) => {
      void navegar({
        to: ".",
        search: ((anterior: Record<string, unknown>) => semVazios(proxima(anterior))) as never,
        replace: o.substituir ?? false,
        resetScroll: false,
      });
    },
    [navegar],
  );

  const mudar = useCallback(
    (mudanca: Busca, o?: OpcoesMudanca) =>
      ir((anterior) => ({ ...anterior, pagina: undefined, ...mudanca }), o),
    [ir],
  );

  const chaves = useMemo(() => Object.keys(esquema), [esquema]);
  const limpar = useCallback(
    () =>
      ir((anterior) => ({
        ...anterior,
        ...Object.fromEntries(chaves.filter((k) => !naoContam.includes(k)).map((k) => [k, undefined])),
        pagina: undefined,
      })),
    [ir, chaves, naoContam],
  );

  /** Aplica uma visão salva inteira (substitui todos os parâmetros desta página). */
  const aplicar = useCallback(
    (nova: Record<string, unknown>) =>
      ir((anterior) => ({
        ...anterior,
        ...Object.fromEntries(chaves.map((k) => [k, undefined])),
        ...validar(nova),
      })),
    [ir, chaves, validar],
  );

  const ativos = contarAtivos(busca as Record<string, unknown>, naoContam);
  return { busca, mudar, limpar, aplicar, ativos };
}
