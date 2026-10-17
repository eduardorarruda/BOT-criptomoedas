import { useEffect, useLayoutEffect, useRef } from "react";
import { ATALHOS_IR } from "./comandos";
import type { RotaApp } from "./navegacao";

/** Tempo para a letra depois do "g". */
const JANELA_G_MS = 1200;

export interface AtalhosGlobais {
  readonly abrirPaleta: () => void;
  readonly abrirAjuda: () => void;
  readonly navegar: (para: RotaApp) => void;
}

/** Campo de texto, seleção ou área editável: as teclas são da pessoa digitando. */
function digitando(alvo: EventTarget | null): boolean {
  if (!(alvo instanceof HTMLElement)) return false;
  return alvo.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(alvo.tagName);
}

/**
 * Atalhos de qualquer tela: Ctrl/Cmd+Shift+P ou "/" abrem a paleta, "?" mostra os
 * atalhos e "g" + letra vai direto a uma tela. Ctrl/Cmd+K é a busca do assistente.
 * Teclas soltas não disparam com o foco num campo nem com um diálogo aberto.
 */
export function useAtalhosGlobais(atalhos: AtalhosGlobais): void {
  const atual = useRef(atalhos);
  useLayoutEffect(() => {
    atual.current = atalhos;
  });
  useEffect(() => {
    let gEm = 0;
    const tecla = (e: KeyboardEvent): void => {
      if (e.defaultPrevented || e.isComposing) return;
      const modificador = e.ctrlKey || e.metaKey;
      if (modificador && e.shiftKey && !e.altKey && e.key.toLowerCase() === "p") {
        e.preventDefault();
        atual.current.abrirPaleta();
        return;
      }
      if (modificador || e.altKey || digitando(e.target) || document.querySelector("dialog[open]")) return;
      if (e.key === "/") {
        e.preventDefault();
        atual.current.abrirPaleta();
      } else if (e.key === "?") {
        e.preventDefault();
        atual.current.abrirAjuda();
      } else if (e.key === "g") {
        gEm = Date.now();
      } else if (gEm && Date.now() - gEm <= JANELA_G_MS) {
        gEm = 0;
        const para = ATALHOS_IR[e.key.toLowerCase()];
        if (para) {
          e.preventDefault();
          atual.current.navegar(para);
        }
      } else {
        gEm = 0;
      }
    };
    document.addEventListener("keydown", tecla);
    return () => document.removeEventListener("keydown", tecla);
  }, []);
}
