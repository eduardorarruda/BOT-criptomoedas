import { m } from "motion/react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useMenosMovimento } from "../../ganchos/movimento";

const CHAVE_BARRA = "zentrade:assistente:barra";

/** A barra de conversas aberta ou recolhida, lembrada neste navegador (no computador). */
export function useBarraLembrada(): readonly [boolean, (aberta: boolean) => void] {
  const [aberta, setAberta] = useState(() => {
    try {
      return localStorage.getItem(CHAVE_BARRA) !== "recolhida";
    } catch {
      return true;
    }
  });
  const mudar = useCallback((nova: boolean) => {
    setAberta(nova);
    try {
      localStorage.setItem(CHAVE_BARRA, nova ? "aberta" : "recolhida");
    } catch {
      // sem armazenamento (aba anônima, bloqueado): só não lembra na próxima visita
    }
  }, []);
  return [aberta, mudar] as const;
}

/**
 * No celular a barra de conversas vira uma gaveta: um <dialog> modal (prende o foco,
 * fecha no Esc ou tocando fora) que desliza da esquerda.
 */
export function GavetaConversas({
  aberta,
  aoFechar,
  children,
}: {
  readonly aberta: boolean;
  readonly aoFechar: () => void;
  readonly children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const menos = useMenosMovimento();
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (aberta && !el.open) el.showModal();
    if (!aberta && el.open) el.close();
  }, [aberta]);
  return (
    // eslint-disable-next-line jsx-a11y-x/click-events-have-key-events, jsx-a11y-x/no-noninteractive-element-interactions -- tocar no fundo fecha; pelo teclado, Esc fecha (onCancel)
    <dialog
      ref={ref}
      className="chat__gaveta"
      aria-label="Conversas"
      onCancel={(e) => {
        e.preventDefault();
        aoFechar();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) aoFechar();
      }}
    >
      {aberta ? (
        <m.div
          className="chat__gaveta-corpo"
          initial={menos ? false : { x: "-100%" }}
          animate={{ x: 0 }}
          transition={{ duration: 0.26, ease: [0.2, 0.7, 0.2, 1] }}
        >
          {children}
        </m.div>
      ) : null}
    </dialog>
  );
}
