import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { abrirSemSessao, esperarTitulo, fonteDeInstancia, violacoes } from "../teste/publicas";

afterEach(() => window.history.pushState({}, "", "/"));

/** axe nas telas que qualquer pessoa vê sem entrar, com o rodapé legal e o diálogo. */
describe("acessibilidade: telas públicas", () => {
  it("/privacidade sem violações (exemplo e instância sem controlador)", async () => {
    abrirSemSessao("/privacidade");
    await esperarTitulo(/política de privacidade/i);
    await screen.findByText(/modo de exemplo/i);
    expect(await violacoes()).toEqual([]);
  });

  it("/privacidade com o aviso para quem opera, sem violações", async () => {
    abrirSemSessao("/privacidade", fonteDeInstancia());
    await esperarTitulo(/política de privacidade/i);
    await screen.findByRole("note");
    expect(await violacoes()).toEqual([]);
  });

  it("/entrar com o rodapé legal sem violações", async () => {
    abrirSemSessao("/entrar");
    await esperarTitulo(/zentrade/i);
    expect(await violacoes()).toEqual([]);
  });

  it("/entrar com a política aberta no diálogo sem violações", async () => {
    abrirSemSessao("/entrar");
    await esperarTitulo(/zentrade/i);
    await userEvent.setup().click(screen.getByRole("button", { name: "Política de privacidade" }));
    const dialogo = screen.getByRole("dialog", { name: /política de privacidade/i });
    await within(dialogo).findByRole(
      "heading",
      { level: 3, name: "Em poucas palavras" },
      { timeout: 10_000 },
    );
    expect(await violacoes()).toEqual([]);
  });
});
