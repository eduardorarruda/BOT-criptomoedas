import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type RefObject,
} from "react";
import { useMenosMovimento } from "../../ganchos/movimento";

/** Distância do fim (px) que ainda conta como "no fim": acompanha a resposta chegando. */
const PERTO_DO_FIM_PX = 96;
/** Durante a rolagem suave até o fim, os eventos intermediários não soltam a rolagem. */
const ROLAGEM_SUAVE_MS = 700;
const ALTURA_MINIMA_PX = 360;
const FOLGA_INFERIOR_PX = 16;

/**
 * Rolagem da conversa como num app de chat: enquanto a pessoa está no fim, o texto novo
 * puxa a rolagem junto; se ela subir para reler, a rolagem para e aparece o "ir para o fim".
 */
export function useRolagemNoFim(conteudoMudou: unknown) {
  const rolagemRef = useRef<HTMLDivElement>(null);
  const preso = useRef(true);
  const suaveAte = useRef(0);
  const [noFim, setNoFim] = useState(true);
  const menos = useMenosMovimento();

  const aoRolar = useCallback(() => {
    const el = rolagemRef.current;
    if (!el) return;
    const perto = el.scrollHeight - el.scrollTop - el.clientHeight <= PERTO_DO_FIM_PX;
    if (!perto && Date.now() < suaveAte.current) return;
    preso.current = perto;
    setNoFim(perto);
  }, []);

  useLayoutEffect(() => {
    const el = rolagemRef.current;
    if (el && preso.current) el.scrollTop = el.scrollHeight;
  }, [conteudoMudou]);

  const irParaOFim = useCallback(
    (suave = true) => {
      const el = rolagemRef.current;
      preso.current = true;
      setNoFim(true);
      if (!el) return;
      const comportamento = suave && !menos ? "smooth" : "auto";
      if (comportamento === "smooth") suaveAte.current = Date.now() + ROLAGEM_SUAVE_MS;
      if (typeof el.scrollTo === "function") el.scrollTo({ top: el.scrollHeight, behavior: comportamento });
      else el.scrollTop = el.scrollHeight;
    },
    [menos],
  );

  return { rolagemRef, noFim, aoRolar, irParaOFim };
}

/**
 * A conversa ocupa a altura que sobra na janela (descontando o que a moldura põe em cima),
 * e acompanha o teclado do celular pelo `visualViewport`. Assim só a lista de mensagens
 * rola e a caixa de pergunta fica sempre à vista.
 */
export function useAlturaDisponivel(ref: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    let ultima = "";
    const medir = () => {
      const visivel = window.visualViewport?.height ?? window.innerHeight;
      const topo = el.getBoundingClientRect().top + window.scrollY;
      const principal = el.closest("main");
      const folgaMoldura = principal ? Number.parseFloat(getComputedStyle(principal).paddingBottom) || 0 : 0;
      const altura = `${Math.max(ALTURA_MINIMA_PX, Math.floor(visivel - topo - FOLGA_INFERIOR_PX))}px`;
      if (altura === ultima) return;
      ultima = altura;
      el.style.setProperty("--chat-altura", altura);
      // O respiro de baixo da moldura sobraria embaixo da conversa e faria a página rolar.
      el.style.marginBottom = `${-folgaMoldura}px`;
    };
    medir();
    window.addEventListener("resize", medir);
    window.visualViewport?.addEventListener("resize", medir);
    const observador = typeof ResizeObserver === "function" ? new ResizeObserver(medir) : null;
    observador?.observe(document.body);
    return () => {
      window.removeEventListener("resize", medir);
      window.visualViewport?.removeEventListener("resize", medir);
      observador?.disconnect();
    };
  }, [ref]);
}

/** true enquanto a consulta de mídia vale (ex.: tela estreita → a barra vira gaveta). */
export function useMidia(consulta: string): boolean {
  const assinar = useCallback(
    (avisar: () => void) => {
      const mql = window.matchMedia(consulta);
      mql.addEventListener("change", avisar);
      return () => mql.removeEventListener("change", avisar);
    },
    [consulta],
  );
  return useSyncExternalStore(
    assinar,
    () => window.matchMedia(consulta).matches,
    () => false,
  );
}

export interface Atalhos {
  readonly buscar: () => void;
  readonly novaConversa: () => void;
  readonly parar: () => void;
}

/**
 * Atalhos do teclado da tela: Ctrl/Cmd+K busca, Ctrl/Cmd+Shift+O começa uma conversa
 * nova e Esc para a resposta (se nenhum diálogo ou menu aberto usou o Esc antes).
 */
export function useAtalhos(atalhos: Atalhos) {
  const atual = useRef(atalhos);
  useLayoutEffect(() => {
    atual.current = atalhos;
  });
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      const modificador = e.ctrlKey || e.metaKey;
      const letra = e.key.toLowerCase();
      if (modificador && !e.shiftKey && !e.altKey && letra === "k") {
        e.preventDefault();
        atual.current.buscar();
      } else if (modificador && e.shiftKey && !e.altKey && letra === "o") {
        e.preventDefault();
        atual.current.novaConversa();
      } else if (e.key === "Escape" && !e.defaultPrevented && !document.querySelector("dialog[open]")) {
        atual.current.parar();
      }
    };
    document.addEventListener("keydown", tecla);
    return () => document.removeEventListener("keydown", tecla);
  }, []);
}
