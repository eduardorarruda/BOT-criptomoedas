import { CircleCheck, CircleX, Info, X } from "lucide-react";
import { AnimatePresence, m } from "motion/react";
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";

/**
 * Avisos curtos depois de uma ação ("Robô criado", "Não deu para aprovar…").
 * Ficam numa região aria-live, somem sozinhos e podem ser fechados.
 */
type TomAviso = "sucesso" | "erro" | "info";
interface Aviso {
  readonly id: number;
  readonly tom: TomAviso;
  readonly texto: string;
}

type Avisar = (tom: TomAviso, texto: string) => void;
const ContextoAvisos = createContext<Avisar>(() => undefined);

const ICONE = { sucesso: CircleCheck, erro: CircleX, info: Info } as const;
const DURACAO = { sucesso: 4500, info: 5000, erro: 9000 } as const;

export function ProvedorAvisos({ children }: { readonly children: ReactNode }) {
  const [avisos, setAvisos] = useState<readonly Aviso[]>([]);
  const proximo = useRef(0);

  const fechar = useCallback((id: number) => setAvisos((a) => a.filter((x) => x.id !== id)), []);
  const avisar = useCallback<Avisar>(
    (tom, texto) => {
      const id = ++proximo.current;
      setAvisos((a) => [...a.slice(-3), { id, tom, texto }]);
      setTimeout(() => fechar(id), DURACAO[tom]);
    },
    [fechar],
  );
  const valor = useMemo(() => avisar, [avisar]);

  return (
    <ContextoAvisos.Provider value={valor}>
      {children}
      <ol className="avisos" aria-live="polite" aria-label="Avisos">
        <AnimatePresence initial={false}>
          {avisos.map((a) => {
            const Icone = ICONE[a.tom];
            return (
              <m.li
                key={a.id}
                layout
                className={`aviso aviso--${a.tom}`}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: 24 }}
                transition={{ duration: 0.22, ease: [0.2, 0.7, 0.2, 1] }}
              >
                <Icone size={18} aria-hidden="true" />
                <span>{a.texto}</span>
                <button
                  type="button"
                  className="botao-icone"
                  onClick={() => fechar(a.id)}
                  aria-label="Fechar aviso"
                >
                  <X size={16} aria-hidden="true" />
                </button>
              </m.li>
            );
          })}
        </AnimatePresence>
      </ol>
    </ContextoAvisos.Provider>
  );
}

export const useAvisos = (): Avisar => useContext(ContextoAvisos);
