import { screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Fonte } from "../api/fonte";
import { criarFonteDemo } from "../demo/fonteDemo";
import { renderizarNaRota } from "../teste/rota";
import { AoVivo } from "./aovivo/AoVivo";
import { Backtests } from "./Backtests";
import { Decisoes } from "./Decisoes";
import { Estrategias } from "./Estrategias";
import { Ordens } from "./Ordens";
import { Risco } from "./Risco";
import { Robos } from "./Robos";

vi.mock("lightweight-charts", () => import("../teste/graficoFalso"));

/** Instalação nova: cada tela vazia aponta o próximo passo (e não mostra controles sem uso). */
async function vazia(): Promise<Fonte> {
  const fonte = criarFonteDemo({ latenciaMs: [0, 0], primeiraAnaliseMs: 60_000, vazio: true });
  await fonte.entrar({ email: "voce@exemplo.com", senha: "x", codigo2fa: "123456" });
  return fonte;
}

const ESPERA = { timeout: 10_000 };
const proximoPasso = async () => screen.findByRole("link", { name: "Criar uma estratégia" }, ESPERA);

describe("primeira vez: telas vazias levam ao próximo passo", () => {
  it("Robôs sem estratégia: primeiro a estratégia", async () => {
    renderizarNaRota(<Robos />, { fonte: await vazia() });
    expect(await proximoPasso()).toHaveAttribute("href", "/estrategias");
  });

  it("Backtests sem estratégia: sem formulário que não roda, e o link para criar", async () => {
    renderizarNaRota(<Backtests />, { fonte: await vazia() });
    expect(await proximoPasso()).toHaveAttribute("href", "/estrategias");
    expect(screen.queryByRole("button", { name: /rodar backtest/i })).not.toBeInTheDocument();
  });

  it("Estratégias sem nenhuma: os modelos já abertos", async () => {
    renderizarNaRota(<Estrategias />, { fonte: await vazia() });
    const resumo = await screen.findByText("Começar de um modelo", {}, ESPERA);
    expect(resumo.closest("details")).toHaveAttribute("open");
  });

  it("Decisões sem nada: sem filtros vazios, com o próximo passo", async () => {
    renderizarNaRota(<Decisoes />, { caminho: "/decisoes", fonte: await vazia() });
    expect(await proximoPasso()).toBeInTheDocument();
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
  });

  it("Ordens sem nada: sem filtros vazios, com o próximo passo", async () => {
    renderizarNaRota(<Ordens />, { caminho: "/ordens", fonte: await vazia() });
    expect(await proximoPasso()).toBeInTheDocument();
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
  });

  it("Ao vivo sem robô: o próximo passo é um botão, não um link solto", async () => {
    renderizarNaRota(<AoVivo />, { fonte: await vazia() });
    expect(await proximoPasso()).toHaveClass("botao");
  });

  it("Risco sem robô: limites por robô explicam, em vez de tabela vazia", async () => {
    renderizarNaRota(<Risco />, { fonte: await vazia() });
    const titulo = await screen.findByRole("heading", { name: "Limites por robô" }, ESPERA);
    const painel = titulo.closest("section") as HTMLElement;
    expect(
      await within(painel).findByRole("link", { name: "Criar uma estratégia" }, ESPERA),
    ).toBeInTheDocument();
    expect(within(painel).queryByRole("columnheader")).not.toBeInTheDocument();
  });
});
