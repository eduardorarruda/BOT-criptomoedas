import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../App";
import { criarFonteDemo } from "../demo/fonteDemo";

vi.mock("lightweight-charts", () => import("../teste/graficoFalso"));

const PRAZO_MS = 60_000;

function abrirApp(caminho: string) {
  sessionStorage.setItem("zentrade:demo:sessao", "1");
  sessionStorage.setItem("zentrade:abertura", "1");
  window.history.pushState({}, "", caminho);
  // StrictMode como em main.tsx: os efeitos rodam duas vezes, como no desenvolvimento.
  return render(
    <StrictMode>
      <App fonte={criarFonteDemo({ latenciaMs: [0, 0], primeiraAnaliseMs: 60_000 })} />
    </StrictMode>,
  );
}

afterEach(() => window.history.pushState({}, "", "/"));

describe("casca: teclado e foco", () => {
  it(
    "na abertura o foco fica no começo: o primeiro Tab cai no link de pular",
    async () => {
      abrirApp("/");
      await screen.findByRole("heading", { level: 1, name: /visão geral/i }, { timeout: 30_000 });
      expect(document.activeElement?.id).not.toBe("conteudo");
      await userEvent.tab();
      expect(document.activeElement).toHaveTextContent("Pular para o conteúdo");
      expect(document.activeElement).toHaveAttribute("href", "#conteudo");
    },
    PRAZO_MS,
  );

  it(
    "ao trocar de tela, o foco vai para o conteúdo novo",
    async () => {
      abrirApp("/");
      await screen.findByRole("heading", { level: 1, name: /visão geral/i }, { timeout: 30_000 });
      const menu = screen.getAllByRole("navigation", { name: /principal|menu/i })[0];
      if (!menu) throw new Error("menu não encontrado");
      await userEvent.click(within(menu).getByRole("link", { name: /^decisões/i }));
      await screen.findByRole("heading", { level: 1, name: /decisões/i }, { timeout: 30_000 });
      await waitFor(() => expect(document.activeElement?.id).toBe("conteudo"));
    },
    PRAZO_MS,
  );

  it(
    'a paleta abre com "/", acha a tela sem acento e leva até ela',
    async () => {
      const usuario = userEvent.setup();
      abrirApp("/");
      await screen.findByRole("heading", { level: 1, name: /visão geral/i }, { timeout: 30_000 });
      await usuario.keyboard("/");
      const busca = await screen.findByRole("combobox", { name: /buscar comando/i }, { timeout: 30_000 });
      await usuario.type(busca, "estrategias");
      await usuario.keyboard("{Enter}");
      await screen.findByRole("heading", { level: 1, name: /estratégias/i }, { timeout: 30_000 });
    },
    PRAZO_MS,
  );

  it(
    "g e uma letra vão direto à tela",
    async () => {
      const usuario = userEvent.setup();
      abrirApp("/");
      await screen.findByRole("heading", { level: 1, name: /visão geral/i }, { timeout: 30_000 });
      await usuario.keyboard("gp");
      await screen.findByRole("heading", { level: 1, name: /^risco$/i }, { timeout: 30_000 });
    },
    PRAZO_MS,
  );
});
