import { render, screen } from "@testing-library/react";
import type { ConfigPublica } from "@zentrade/contratos/esquemas";
import axe from "axe-core";
import type { Fonte } from "../api/fonte";
import { App } from "../App";
import { criarFonteDemo } from "../demo/fonteDemo";

/**
 * Telas públicas (login e privacidade) com a aplicação inteira e SEM sessão: é assim
 * que um visitante ou um buscador as vê.
 */
export function abrirSemSessao(caminho: string, fonte: Fonte = criarFonteDemo({ latenciaMs: [0, 0] })) {
  sessionStorage.removeItem("zentrade:demo:sessao");
  window.history.pushState({}, "", caminho);
  return render(<App fonte={fonte} />);
}

/** Uma fonte de instância de verdade (não demo), com o controlador que o teste quiser. */
export function fonteDeInstancia(config: Partial<ConfigPublica> = {}): Fonte {
  return {
    ...criarFonteDemo({ latenciaMs: [0, 0] }),
    demo: false,
    configPublica: async () => ({
      controlador: null,
      encarregado: null,
      versao: "0.1.0",
      fuso: "America/Sao_Paulo",
      ...config,
    }),
  };
}

export async function esperarTitulo(nome: RegExp): Promise<HTMLElement> {
  return screen.findByRole("heading", { level: 1, name: nome }, { timeout: 30_000 });
}

/** Os níveis de título, na ordem do documento: nunca pulam um nível ao descer. */
export function niveisDeTitulo(raiz: ParentNode = document.body): number[] {
  return [...raiz.querySelectorAll("h1, h2, h3, h4, h5, h6")].map((h) => Number(h.tagName[1]));
}

export function saltosDeNivel(niveis: readonly number[]): string[] {
  return niveis.flatMap((n, i) => {
    const anterior = niveis[i - 1];
    return anterior !== undefined && n > anterior + 1 ? [`h${anterior} → h${n}`] : [];
  });
}

const OPCOES_AXE: axe.RunOptions = {
  rules: { "color-contrast": { enabled: false } },
  resultTypes: ["violations"],
};

export async function violacoes(raiz: Element = document.body): Promise<string[]> {
  const r = await axe.run(raiz, OPCOES_AXE);
  return r.violations.map(
    (v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.html.slice(0, 160)).join(" | ")})`,
  );
}
