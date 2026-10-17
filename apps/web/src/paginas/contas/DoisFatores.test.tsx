import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { describe, expect, it } from "vitest";
import { criarFonteDemo } from "../../demo/fonteDemo";
import { renderizar } from "../../teste/renderizar";
import { DoisFatores } from "./DoisFatores";

async function fonteLogada() {
  const fonte = criarFonteDemo({ latenciaMs: [0, 0], vazio: true });
  await fonte.entrar({ email: "voce@exemplo.com", senha: "x", codigo2fa: "123456" });
  return fonte;
}

describe("DoisFatores", () => {
  it("sem 2FA: gera a chave, pede o código e mostra ligado", async () => {
    const usuario = userEvent.setup();
    renderizar(<DoisFatores />, await fonteLogada());
    await usuario.click(await screen.findByRole("button", { name: "Ligar o 2FA" }));
    expect(await screen.findByText(/^[A-Z2-7]{4}( [A-Z2-7]{4}){7}$/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /abrir no app autenticador/i })).toHaveAttribute(
      "href",
      expect.stringMatching(/^otpauth:\/\/totp\//),
    );
    await usuario.type(screen.getByLabelText("Código de 6 números"), "123456");
    await usuario.click(screen.getByRole("button", { name: "Ativar" }));
    expect(await screen.findByText("Ligado")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ligar o 2FA" })).not.toBeInTheDocument();
  });

  it("código errado fica no campo, com a explicação", async () => {
    const usuario = userEvent.setup();
    renderizar(<DoisFatores />, await fonteLogada());
    await usuario.click(await screen.findByRole("button", { name: "Ligar o 2FA" }));
    const campo = await screen.findByLabelText("Código de 6 números");
    await usuario.type(campo, "12");
    await usuario.click(screen.getByRole("button", { name: "Ativar" }));
    await waitFor(() => expect(campo).toHaveAttribute("aria-invalid", "true"));
    expect(screen.getByText(/código incorreto/i)).toBeInTheDocument();
  });

  it("com a chave na tela, sem violações do axe", async () => {
    const usuario = userEvent.setup();
    const { container } = renderizar(<DoisFatores />, await fonteLogada());
    await usuario.click(await screen.findByRole("button", { name: "Ligar o 2FA" }));
    await screen.findByLabelText("Código de 6 números");
    const r = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
    expect(r.violations.map((v) => v.id)).toEqual([]);
  });
});
