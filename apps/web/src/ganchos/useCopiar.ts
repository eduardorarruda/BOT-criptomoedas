import { useCallback, useEffect, useRef, useState } from "react";

const TEMPO_CONFIRMACAO_MS = 1800;

export type EstadoCopia = "parado" | "copiado" | "falhou";

/** Copia texto para a área de transferência e lembra por um instante que copiou (ou falhou). */
export function useCopiar(): readonly [EstadoCopia, (texto: string) => Promise<void>] {
  const [estado, setEstado] = useState<EstadoCopia>("parado");
  const relogio = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (relogio.current) clearTimeout(relogio.current);
    },
    [],
  );
  const copiar = useCallback(async (texto: string) => {
    let deu: EstadoCopia = "copiado";
    try {
      if (!navigator.clipboard) throw new Error("sem área de transferência");
      await navigator.clipboard.writeText(texto);
    } catch {
      deu = "falhou";
    }
    setEstado(deu);
    if (relogio.current) clearTimeout(relogio.current);
    relogio.current = setTimeout(() => setEstado("parado"), TEMPO_CONFIRMACAO_MS);
  }, []);
  return [estado, copiar] as const;
}
