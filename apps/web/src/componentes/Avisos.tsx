import { CircleCheck, CircleX, Info, X } from "lucide-react";
import { AnimatePresence, m } from "motion/react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

/**
 * Avisos curtos depois de uma ação ("Robô criado", "Não deu para aprovar…").
 * Ficam numa região aria-live, somem sozinhos e podem ser fechados. Um aviso pode
 * trazer uma ação (ex.: "Desfazer"); com o ponteiro ou o foco em cima, o tempo para
 * (WCAG 2.2.1: dá para ler e agir sem pressa).
 */
type TomAviso = "sucesso" | "erro" | "info";

export interface AcaoAviso {
  readonly rotulo: string;
  readonly executar: () => void;
}

interface Aviso {
  readonly id: number;
  readonly tom: TomAviso;
  readonly texto: string;
  readonly acao?: AcaoAviso;
}

type Avisar = (tom: TomAviso, texto: string, acao?: AcaoAviso) => void;
const ContextoAvisos = createContext<Avisar>(() => undefined);

const ICONE = { sucesso: CircleCheck, erro: CircleX, info: Info } as const;
/** Quanto cada aviso fica. A barrinha embaixo (feedback.css, --duracao-aviso) usa os mesmos tempos. */
const DURACAO = { sucesso: 4500, info: 5000, erro: 9000 } as const;
/** Com ação, o aviso fica mais: dá tempo de ler e desfazer. */
const DURACAO_COM_ACAO = 10_000;

interface Relogio {
  restante: number;
  inicio: number;
  timer: ReturnType<typeof setTimeout> | null;
}

/** Relógios de cada aviso, que param e voltam juntos (ponteiro ou foco na lista). */
function useRelogios(aoAcabar: (id: number) => void) {
  const relogios = useRef(new Map<number, Relogio>());
  const parado = useRef(false);

  const armar = useCallback(
    (id: number, r: Relogio) => {
      r.inicio = Date.now();
      r.timer = setTimeout(() => aoAcabar(id), r.restante);
    },
    [aoAcabar],
  );
  const iniciar = useCallback(
    (id: number, ms: number) => {
      const r: Relogio = { restante: ms, inicio: 0, timer: null };
      relogios.current.set(id, r);
      if (!parado.current) armar(id, r);
    },
    [armar],
  );
  const esquecer = useCallback((id: number) => {
    const r = relogios.current.get(id);
    if (r?.timer) clearTimeout(r.timer);
    relogios.current.delete(id);
  }, []);
  const parar = useCallback(() => {
    if (parado.current) return;
    parado.current = true;
    for (const r of relogios.current.values()) {
      if (!r.timer) continue;
      clearTimeout(r.timer);
      r.timer = null;
      r.restante = Math.max(0, r.restante - (Date.now() - r.inicio));
    }
  }, []);
  const continuar = useCallback(() => {
    if (!parado.current) return;
    parado.current = false;
    for (const [id, r] of relogios.current) armar(id, r);
  }, [armar]);

  useEffect(() => {
    const mapa = relogios.current;
    return () => mapa.forEach((r) => r.timer && clearTimeout(r.timer));
  }, []);
  return useMemo(() => ({ iniciar, esquecer, parar, continuar }), [iniciar, esquecer, parar, continuar]);
}

export function ProvedorAvisos({ children }: { readonly children: ReactNode }) {
  const [avisos, setAvisos] = useState<readonly Aviso[]>([]);
  const [parados, setParados] = useState(false);
  const proximo = useRef(0);

  const remover = useCallback((id: number) => setAvisos((a) => a.filter((x) => x.id !== id)), []);
  const relogios = useRelogios(remover);
  const fechar = useCallback(
    (id: number) => {
      relogios.esquecer(id);
      remover(id);
    },
    [relogios, remover],
  );
  const avisar = useCallback<Avisar>(
    (tom, texto, acao) => {
      const id = ++proximo.current;
      setAvisos((a) => {
        a.slice(0, -3).forEach((velho) => relogios.esquecer(velho.id));
        return [...a.slice(-3), { id, tom, texto, ...(acao ? { acao } : {}) }];
      });
      relogios.iniciar(id, acao ? DURACAO_COM_ACAO : DURACAO[tom]);
    },
    [relogios],
  );
  const parar = (): void => {
    relogios.parar();
    setParados(true);
  };
  const continuar = (): void => {
    relogios.continuar();
    setParados(false);
  };

  return (
    <ContextoAvisos.Provider value={avisar}>
      {children}
      {/* eslint-disable-next-line jsx-a11y-x/no-noninteractive-element-interactions -- ponteiro e foco só param o relógio dos avisos (WCAG 2.2.1); nada é acionado */}
      <ol
        className={`avisos ${parados ? "avisos--parados" : ""}`}
        aria-live="polite"
        aria-label="Avisos"
        onPointerEnter={parar}
        onPointerLeave={continuar}
        onFocus={parar}
        onBlur={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) continuar();
        }}
      >
        <AnimatePresence initial={false}>
          {avisos.map((a) => {
            const Icone = ICONE[a.tom];
            return (
              <m.li
                key={a.id}
                layout
                className={`aviso aviso--${a.tom} ${a.acao ? "aviso--com-acao" : ""}`}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: 24 }}
                transition={{ duration: 0.22, ease: [0.2, 0.7, 0.2, 1] }}
              >
                <Icone size={18} aria-hidden="true" />
                <span>{a.texto}</span>
                {a.acao ? (
                  <button
                    type="button"
                    className="aviso__acao"
                    onClick={() => {
                      a.acao?.executar();
                      fechar(a.id);
                    }}
                  >
                    {a.acao.rotulo}
                  </button>
                ) : null}
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
