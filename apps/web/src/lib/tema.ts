import { useCallback, useEffect, useState } from "react";

/**
 * Tema escuro é o padrão. Sem escolha salva, a tela segue o sistema; depois que a
 * pessoa escolhe, a escolha fica no navegador. O index.html aplica o tema salvo
 * antes do primeiro desenho para não piscar.
 */
export type Tema = "claro" | "escuro";
export const CHAVE_TEMA = "zentrade:tema";
const CONSULTA_CLARO = "(prefers-color-scheme: light)";

function lerSalvo(): Tema | null {
  try {
    const v = localStorage.getItem(CHAVE_TEMA);
    return v === "claro" || v === "escuro" ? v : null;
  } catch {
    return null;
  }
}

function salvar(tema: Tema | null): void {
  try {
    if (tema) localStorage.setItem(CHAVE_TEMA, tema);
    else localStorage.removeItem(CHAVE_TEMA);
  } catch {
    // Sem armazenamento (janela privada): o tema vale só nesta visita.
  }
}

const doSistema = (): Tema => (window.matchMedia(CONSULTA_CLARO).matches ? "claro" : "escuro");

export const temaInicial = (): Tema => lerSalvo() ?? doSistema();

function aplicar(tema: Tema | null): void {
  if (tema) document.documentElement.dataset.tema = tema;
  else delete document.documentElement.dataset.tema;
}

export interface ControleTema {
  readonly tema: Tema;
  readonly escolhido: boolean;
  readonly alternar: () => void;
  readonly seguirSistema: () => void;
}

export function useTema(): ControleTema {
  const [escolha, setEscolha] = useState<Tema | null>(lerSalvo);
  const [sistema, setSistema] = useState<Tema>(doSistema);

  useEffect(() => {
    const mql = window.matchMedia(CONSULTA_CLARO);
    const mudou = (e: MediaQueryListEvent): void => setSistema(e.matches ? "claro" : "escuro");
    mql.addEventListener("change", mudou);
    return () => mql.removeEventListener("change", mudou);
  }, []);

  const tema = escolha ?? sistema;

  const alternar = useCallback(() => {
    const novo: Tema = tema === "escuro" ? "claro" : "escuro";
    salvar(novo);
    aplicar(novo);
    setEscolha(novo);
  }, [tema]);

  const seguirSistema = useCallback(() => {
    salvar(null);
    aplicar(null);
    setEscolha(null);
  }, []);

  return { tema, escolhido: escolha !== null, alternar, seguirSistema };
}
