import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { abrirSemSessao, esperarTitulo, niveisDeTitulo, saltosDeNivel } from "../teste/publicas";
import { criarFonteDemo } from "../demo/fonteDemo";
import { App } from "../App";
import { LICENCA_LINK } from "./RodapeLegal";

vi.mock("lightweight-charts", () => import("../teste/graficoFalso"));

afterEach(() => {
  vi.restoreAllMocks();
  window.history.pushState({}, "", "/");
});

/** O <dialog> aberto com este nome acessível. */
function dialogoAberto(nome: RegExp): HTMLDialogElement {
  const dialogo = screen.getByRole("dialog", { name: nome }) as HTMLDialogElement;
  expect(dialogo.open).toBe(true);
  return dialogo;
}

/** Esc num <dialog> modal dispara "cancel" (o jsdom não faz isso sozinho). */
function apertarEsc(dialogo: HTMLDialogElement): void {
  fireEvent(dialogo, new Event("cancel", { cancelable: true }));
}

describe("rodapé legal no login", () => {
  it("tem política, aviso de risco, licença e versão", async () => {
    abrirSemSessao("/entrar");
    await esperarTitulo(/zentrade/i);
    expect(document.title).toBe("Entrar · ZenTrade");
    const rodape = document.querySelector<HTMLElement>(".rodape-legal")!;
    const r = within(rodape);
    expect(r.getByRole("button", { name: "Política de privacidade" })).toHaveAttribute(
      "aria-haspopup",
      "dialog",
    );
    expect(r.getByRole("button", { name: "Aviso de risco" })).toBeInTheDocument();
    const licenca = r.getByRole("link", { name: /AGPL-3\.0/ });
    expect(licenca).toHaveAttribute("href", LICENCA_LINK);
    expect(licenca).toHaveAttribute("target", "_blank");
    expect(licenca).toHaveAttribute("rel", "noopener noreferrer");
    expect(rodape).toHaveTextContent(`Versão v${__ZENTRADE_VERSAO__}`);
    // O login continua com um h1 só, e o rodapé fechado não acrescenta títulos.
    expect(niveisDeTitulo()).toEqual([1]);
  });

  it("a política abre em diálogo modal, fecha no Esc e devolve o foco", async () => {
    const modal = vi.spyOn(HTMLDialogElement.prototype, "showModal");
    const usuario = userEvent.setup();
    abrirSemSessao("/entrar");
    await esperarTitulo(/zentrade/i);
    const botao = screen.getByRole("button", { name: "Política de privacidade" });
    await usuario.click(botao);

    const dialogo = dialogoAberto(/política de privacidade/i);
    // showModal (e não show): o navegador prende o foco no diálogo e deixa o resto inerte.
    expect(modal).toHaveBeenCalled();
    await within(dialogo).findByRole(
      "heading",
      { level: 3, name: "Em poucas palavras" },
      { timeout: 10_000 },
    );
    // Dentro do diálogo: título h2, seções h3, perguntas h4, sem pular nível.
    const niveis = niveisDeTitulo(dialogo);
    expect(niveis[0]).toBe(2);
    expect(saltosDeNivel(niveis)).toEqual([]);
    expect(within(dialogo).getByRole("link", { name: /abrir em página própria/i })).toHaveAttribute(
      "href",
      "/privacidade",
    );

    apertarEsc(dialogo);
    expect(dialogo.open).toBe(false);
    await vi.waitFor(() => expect(botao).toHaveFocus());
  });

  it("o aviso de risco abre e fecha pelo botão Fechar, devolvendo o foco", async () => {
    const usuario = userEvent.setup();
    abrirSemSessao("/entrar");
    await esperarTitulo(/zentrade/i);
    const botao = screen.getByRole("button", { name: "Aviso de risco" });
    await usuario.click(botao);
    const dialogo = dialogoAberto(/aviso de risco/i);
    expect(dialogo).toHaveTextContent(/risco de perda, inclusive total/i);
    expect(dialogo).toHaveTextContent(/nem promessa de lucro/i);
    await usuario.click(within(dialogo).getByRole("button", { name: "Fechar" }));
    expect(dialogo.open).toBe(false);
    await vi.waitFor(() => expect(botao).toHaveFocus());
  });

  it("o link da página própria leva a /privacidade, que abre sem login", async () => {
    const usuario = userEvent.setup();
    abrirSemSessao("/entrar");
    await esperarTitulo(/zentrade/i);
    await usuario.click(screen.getByRole("button", { name: "Política de privacidade" }));
    const dialogo = dialogoAberto(/política de privacidade/i);
    await usuario.click(within(dialogo).getByRole("link", { name: /abrir em página própria/i }));
    await esperarTitulo(/política de privacidade/i);
    expect(window.location.pathname).toBe("/privacidade");
  });
});

describe("rodapé legal na casca", () => {
  it("aparece depois de entrar, abaixo do conteúdo, como rodapé da página", async () => {
    sessionStorage.setItem("zentrade:demo:sessao", "1");
    window.history.pushState({}, "", "/");
    render(<App fonte={criarFonteDemo({ latenciaMs: [0, 0], primeiraAnaliseMs: 60_000 })} />);
    await screen.findByRole("heading", { level: 1 }, { timeout: 30_000 });
    expect(document.title).toBe("Visão geral · ZenTrade");
    const rodape = screen.getByRole("contentinfo");
    expect(within(rodape).getByRole("button", { name: "Política de privacidade" })).toBeInTheDocument();
    expect(within(rodape).getByRole("button", { name: "Aviso de risco" })).toBeInTheDocument();
    // O rodapé vem depois do <main> (não dentro dele).
    expect(screen.getByRole("main").contains(rodape)).toBe(false);
  });
});
