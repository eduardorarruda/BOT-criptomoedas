import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { beforeEach, describe, expect, it } from "vitest";
import type { Fonte } from "../../api/fonte";
import { criarFonteDemo } from "../../demo/fonteDemo";
import { renderizarNaRota } from "../../teste/rota";
import { ComeceAqui } from "./ComeceAqui";

async function logada(opcoes: { vazio?: boolean } = { vazio: true }): Promise<Fonte> {
  const fonte = criarFonteDemo({ latenciaMs: [0, 0], ...opcoes });
  await fonte.entrar({ email: "voce@exemplo.com", senha: "x", codigo2fa: "123456" });
  return fonte;
}

const secao = () => screen.findByRole("region", { name: "Primeiros passos" });

describe("ComeceAqui", () => {
  beforeEach(() => localStorage.clear());

  it("instalação nova: 0 de 6, com o 2FA como próximo passo em destaque", async () => {
    renderizarNaRota(<ComeceAqui />, { fonte: await logada() });
    const s = await secao();
    expect(within(s).getByText("0 de 6")).toBeInTheDocument();
    expect(within(s).getByRole("progressbar", { name: /passos feitos/i })).toHaveAttribute(
      "aria-valuenow",
      "0",
    );
    const proximo = within(s).getByRole("link", { name: "Ligar o 2FA" });
    expect(proximo).toHaveAttribute("href", "/contas");
    expect(proximo).toHaveClass("botao--primario");
    expect(within(s).getAllByRole("listitem")).toHaveLength(6);
  });

  it("passo feito aparece como feito, e o próximo é o que falta", async () => {
    const fonte = await logada();
    await fonte.iniciarDoisFatores();
    await fonte.ativarDoisFatores("123456");
    renderizarNaRota(<ComeceAqui />, { fonte });
    const s = await secao();
    expect(within(s).getByText("1 de 6")).toBeInTheDocument();
    const passo2fa = within(s).getByText("Ligar o 2FA").closest("li");
    expect(passo2fa).toHaveTextContent(/feito/i);
    expect(within(s).getByRole("link", { name: "Cadastrar a chave" })).toHaveClass("botao--primario");
  });

  it("no exemplo cheio, sem controlador conhecido, o passo de quem opera não aparece", async () => {
    renderizarNaRota(<ComeceAqui />, { fonte: await logada({}) });
    const s = await secao();
    expect(within(s).queryByText(/controlador dos dados/i)).not.toBeInTheDocument();
  });

  it("na instalação nova sem controlador, mostra o passo de quem opera, fora da contagem", async () => {
    renderizarNaRota(<ComeceAqui />, { fonte: await logada() });
    const s = await secao();
    expect(within(s).getByText(/controlador dos dados/i)).toBeInTheDocument();
    expect(within(s).getByText(/ZENTRADE_CONTROLADOR_NOME/)).toBeInTheDocument();
    expect(within(s).getByText("0 de 6")).toBeInTheDocument();
  });

  it("ocultar some com a lista e o Desfazer traz de volta", async () => {
    const usuario = userEvent.setup();
    renderizarNaRota(<ComeceAqui />, { fonte: await logada() });
    await usuario.click(within(await secao()).getByRole("button", { name: /ocultar/i }));
    await waitFor(() =>
      expect(screen.queryByRole("region", { name: "Primeiros passos" })).not.toBeInTheDocument(),
    );
    await usuario.click(await screen.findByRole("button", { name: "Desfazer" }));
    expect(await secao()).toBeInTheDocument();
  });

  it("oculto continua oculto ao voltar à tela (por pessoa)", async () => {
    const usuario = userEvent.setup();
    const fonte = await logada();
    const primeira = renderizarNaRota(<ComeceAqui />, { fonte });
    await usuario.click(within(await secao()).getByRole("button", { name: /ocultar/i }));
    primeira.unmount();
    renderizarNaRota(<ComeceAqui />, { fonte });
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByRole("region", { name: "Primeiros passos" })).not.toBeInTheDocument();
  });

  it("com quase tudo feito, mostra só o próximo passo; 'Ver os passos' abre a lista", async () => {
    const usuario = userEvent.setup();
    renderizarNaRota(<ComeceAqui />, { fonte: await logada({}) });
    const s = await secao();
    expect(within(s).getByText("5 de 6")).toBeInTheDocument();
    expect(within(s).queryByRole("list")).not.toBeInTheDocument();
    expect(within(s).getByRole("link", { name: "Ligar o 2FA" })).toHaveClass("botao--primario");
    const ver = within(s).getByRole("button", { name: "Ver os passos" });
    expect(ver).toHaveAttribute("aria-expanded", "false");
    await usuario.click(ver);
    expect(within(s).getAllByRole("listitem")).toHaveLength(6);
    expect(within(s).getByRole("button", { name: "Esconder os passos" })).toHaveFocus();
  });

  it("depois de completo, não volta (pausar o robô em papel não reabre a lista)", async () => {
    const fonte = await logada({});
    await fonte.iniciarDoisFatores();
    await fonte.ativarDoisFatores("123456");
    const primeira = renderizarNaRota(<ComeceAqui />, { fonte });
    await new Promise((r) => setTimeout(r, 100));
    expect(screen.queryByRole("region", { name: "Primeiros passos" })).not.toBeInTheDocument();
    primeira.unmount();
    for (const r of await fonte.robos())
      if (r.rede === "papel") await fonte.atualizarRobo(r.id, { pausado: true });
    renderizarNaRota(<ComeceAqui />, { fonte });
    await new Promise((r) => setTimeout(r, 100));
    expect(screen.queryByRole("region", { name: "Primeiros passos" })).not.toBeInTheDocument();
  });

  it("sem violações do axe", async () => {
    const { container } = renderizarNaRota(<ComeceAqui />, { fonte: await logada() });
    await secao();
    const r = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
    expect(r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.html).join(" | ")}`)).toEqual([]);
  });
});
