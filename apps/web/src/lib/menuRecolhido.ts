import { useCallback, useState } from "react";

/**
 * Menu lateral recolhido (só ícones) no computador. A escolha fica no navegador;
 * sem armazenamento (janela privada), vale só nesta visita.
 */
export const CHAVE_MENU = "zentrade:menu-recolhido";

export function lerMenuRecolhido(): boolean {
  try {
    return localStorage.getItem(CHAVE_MENU) === "1";
  } catch {
    return false;
  }
}

function salvar(recolhido: boolean): void {
  try {
    if (recolhido) localStorage.setItem(CHAVE_MENU, "1");
    else localStorage.removeItem(CHAVE_MENU);
  } catch {
    // sem armazenamento: a escolha vale até recarregar
  }
}

export interface ControleMenu {
  readonly recolhido: boolean;
  readonly alternar: () => void;
}

export function useMenuRecolhido(): ControleMenu {
  const [recolhido, setRecolhido] = useState(lerMenuRecolhido);
  const alternar = useCallback(() => {
    setRecolhido((atual) => {
      const novo = !atual;
      salvar(novo);
      return novo;
    });
  }, []);
  return { recolhido, alternar };
}
