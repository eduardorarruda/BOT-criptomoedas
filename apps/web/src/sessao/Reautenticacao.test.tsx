import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { mensagemDe } from "../api/erros";
import type { Fonte } from "../api/fonte";
import { criarFonteDemo } from "../demo/fonteDemo";
import { renderizar } from "../teste/renderizar";
import { useComConfirmacao } from "./Reautenticacao";

function Desligar({ fonte }: { fonte: Fonte }) {
  const comConfirmacao = useComConfirmacao();
  const [resultado, setResultado] = useState("");
  return (
    <>
      <button
        type="button"
        onClick={() =>
          comConfirmacao(() => fonte.definirParadaTotal(false)).then(
            (ligada) => setResultado(ligada ? "ligada" : "desligada"),
            (e: unknown) => setResultado(mensagemDe(e)),
          )
        }
      >
        Desligar
      </button>
      <output>{resultado}</output>
    </>
  );
}

async function preparar() {
  let agora = Date.now();
  const fonte = criarFonteDemo({ latenciaMs: [0, 0], agora: () => agora });
  await fonte.entrar({ email: "a@b.c", senha: "x", codigo2fa: "123456" });
  await fonte.definirParadaTotal(true);
  agora += 6 * 60_000;
  renderizar(<Desligar fonte={fonte} />, fonte);
  return fonte;
}

describe("reautenticação para ações críticas", () => {
  it("pede a senha, confirma e só então desliga a parada total", async () => {
    await preparar();
    const usuario = userEvent.setup();
    await usuario.click(screen.getByRole("button", { name: "Desligar" }));
    expect(await screen.findByText("Confirme que é você")).toBeInTheDocument();
    await usuario.click(screen.getByRole("button", { name: "Confirmar" }));
    expect(screen.getByText("Digite sua senha.")).toBeInTheDocument();
    await usuario.type(screen.getByLabelText("Sua senha"), "minha senha");
    await usuario.click(screen.getByRole("button", { name: "Confirmar" }));
    expect(await screen.findByText("desligada")).toBeInTheDocument();
  });

  it("aceita o código do autenticador no lugar da senha", async () => {
    await preparar();
    const usuario = userEvent.setup();
    await usuario.click(screen.getByRole("button", { name: "Desligar" }));
    await usuario.click(await screen.findByLabelText("Código do autenticador"));
    await usuario.type(screen.getByLabelText("Código de 6 dígitos"), "12a3456");
    expect(screen.getByLabelText("Código de 6 dígitos")).toHaveValue("123456");
    await usuario.click(screen.getByRole("button", { name: "Confirmar" }));
    expect(await screen.findByText("desligada")).toBeInTheDocument();
  });

  it("cancela sem mudar nada quando a pessoa desiste", async () => {
    await preparar();
    const usuario = userEvent.setup();
    await usuario.click(screen.getByRole("button", { name: "Desligar" }));
    await usuario.click(await screen.findByRole("button", { name: "Cancelar" }));
    expect(await screen.findByText(/Ação cancelada.*Nada foi alterado/)).toBeInTheDocument();
  });
});
