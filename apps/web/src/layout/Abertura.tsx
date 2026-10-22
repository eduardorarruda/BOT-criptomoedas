import { AnimatePresence, m } from "motion/react";
import { useEffect, useState } from "react";
import { Enso } from "../componentes/Enso";
import { useMenosMovimento } from "../ganchos/movimento";

/**
 * Abertura: o Ensō se desenha, o candle sobe, a tela aparece. Uma vez por sessão,
 * dura menos de 2 s, sai com qualquer tecla ou clique, e não existe para quem
 * pediu menos movimento.
 */
const CHAVE = "zentrade:abertura";
const DURACAO_MS = 1900;

function jaViu(): boolean {
  try {
    return sessionStorage.getItem(CHAVE) === "1";
  } catch {
    return true;
  }
}

function marcarVisto(): void {
  try {
    sessionStorage.setItem(CHAVE, "1");
  } catch {
    // sem armazenamento: mostra de novo na próxima visita, sem problema
  }
}

export function Abertura() {
  const menos = useMenosMovimento();
  const [visivel, setVisivel] = useState(() => !jaViu());
  const mostrar = visivel && !menos;

  useEffect(() => {
    if (!mostrar) return;
    marcarVisto();
    const fechar = (): void => setVisivel(false);
    const relogio = setTimeout(fechar, DURACAO_MS);
    window.addEventListener("keydown", fechar, { once: true });
    window.addEventListener("pointerdown", fechar, { once: true });
    return () => {
      clearTimeout(relogio);
      window.removeEventListener("keydown", fechar);
      window.removeEventListener("pointerdown", fechar);
    };
  }, [mostrar]);

  return (
    <AnimatePresence>
      {mostrar ? (
        <m.div
          className="abertura"
          aria-hidden="true"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.45, ease: [0.4, 0, 0.2, 1] }}
        >
          <Enso tamanho={112} animar tom="tinta" />
          <m.p
            className="abertura__frase"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.15, duration: 0.5 }}
          >
            <span className="marca__zen">Zen</span>
            <span className="marca__trade">Trade</span>
          </m.p>
        </m.div>
      ) : null}
    </AnimatePresence>
  );
}
