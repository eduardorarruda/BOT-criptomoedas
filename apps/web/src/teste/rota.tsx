import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from "@tanstack/react-router";
import type { ReactElement } from "react";
import type { Fonte } from "../api/fonte";
import { criarFonteDemo } from "../demo/fonteDemo";
import { renderizar } from "./renderizar";

/**
 * Renderiza uma tela dentro de um roteador de memória, começando em `caminho`
 * (com a query string dos filtros). Devolve o roteador para conferir a URL.
 */
export function renderizarNaRota(
  ui: ReactElement,
  { caminho = "/", fonte = criarFonteDemo({ latenciaMs: [0, 0] }) }: { caminho?: string; fonte?: Fonte } = {},
) {
  const raiz = createRootRoute({ component: () => ui });
  const roteador = createRouter({
    routeTree: raiz,
    history: createMemoryHistory({ initialEntries: [caminho] }),
  });
  const resultado = renderizar(<RouterProvider router={roteador} />, fonte);
  return { ...resultado, roteador };
}

/** A query string atual, já interpretada pelo roteador. */
export const buscaAtual = (roteador: { state: { location: { search: unknown } } }) =>
  roteador.state.location.search as Record<string, unknown>;
