import { useSyncExternalStore } from "react";

const CONSULTA = "(max-width: 560px)";

function assinar(avisar: () => void): () => void {
  const mql = window.matchMedia(CONSULTA);
  mql.addEventListener("change", avisar);
  return () => mql.removeEventListener("change", avisar);
}

/** Celular (até 560 px): o gráfico tira os rótulos das marcas e fica só com a contagem. */
export function useTelaEstreita(): boolean {
  return useSyncExternalStore(
    assinar,
    () => window.matchMedia(CONSULTA).matches,
    () => false,
  );
}
