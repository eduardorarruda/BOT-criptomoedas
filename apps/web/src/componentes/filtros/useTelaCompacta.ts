import { useSyncExternalStore } from "react";

/** Abaixo disto a barra de filtros vira um botão que abre uma folha. */
const CONSULTA = "(max-width: 720px)";

function assinar(avisar: () => void): () => void {
  const mql = window.matchMedia(CONSULTA);
  mql.addEventListener("change", avisar);
  return () => mql.removeEventListener("change", avisar);
}

export function useTelaCompacta(): boolean {
  return useSyncExternalStore(
    assinar,
    () => window.matchMedia(CONSULTA).matches,
    () => false,
  );
}
