import { screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Fonte } from "../../api/fonte";
import { criarFonteDemo } from "../../demo/fonteDemo";
import { renderizarNaRota } from "../../teste/rota";
import { VisaoGeral } from "../VisaoGeral";

vi.mock("lightweight-charts", () => import("../../teste/graficoFalso"));

async function logada(vazio = false): Promise<Fonte> {
  const fonte = criarFonteDemo({ latenciaMs: [0, 0], primeiraAnaliseMs: 60_000, vazio });
  await fonte.entrar({ email: "voce@exemplo.com", senha: "x", codigo2fa: "123456" });
  return fonte;
}

const antes = (a: Element, b: Element) =>
  Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

describe("Visão geral: o que pede ação vem primeiro", () => {
  it("a decisão que aguarda você aparece uma vez só, antes dos indicadores do dia", async () => {
    renderizarNaRota(<VisaoGeral />, { fonte: await logada() });
    const aguardando = await screen.findByRole("heading", { name: "Aguardando você" });
    await screen.findByRole("heading", { name: "Últimas decisões" });
    await screen.findAllByText("BTC paciente");
    expect(screen.getAllByRole("button", { name: /^aprovar/i })).toHaveLength(1);
    const indicadores = await screen.findByLabelText("Resumo do dia");
    expect(antes(aguardando, indicadores)).toBe(true);
  });
});

describe("Visão geral: ordem e contagem", () => {
  it("o que pede ação vem antes até dos primeiros passos", async () => {
    renderizarNaRota(<VisaoGeral />, { fonte: await logada() });
    const aguardando = await screen.findByRole("heading", { name: "Aguardando você" });
    const passos = await screen.findByRole("region", { name: "Primeiros passos" });
    expect(antes(aguardando, passos)).toBe(true);
  });

  it("Últimas decisões mostra seis respondidas, mesmo com uma pendente no topo", async () => {
    renderizarNaRota(<VisaoGeral />, { fonte: await logada() });
    const titulo = await screen.findByRole("heading", { name: "Últimas decisões" });
    const painel = titulo.closest("section") as HTMLElement;
    await waitFor(() => expect(within(painel).getAllByRole("article")).toHaveLength(6));
  });
});

describe("Visão geral numa instalação nova", () => {
  it("sem robô e sem histórico, não mostra indicadores zerados nem gráficos vazios: diz quando enchem", async () => {
    renderizarNaRota(<VisaoGeral />, { fonte: await logada(true) });
    expect(await screen.findByText(/o painel enche quando o primeiro robô ligar/i)).toBeInTheDocument();
    expect(screen.queryByLabelText("Resumo do dia")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Curva de patrimônio" })).not.toBeInTheDocument();
  });

  it("sem estratégia, o painel vazio leva a criar a estratégia primeiro", async () => {
    renderizarNaRota(<VisaoGeral />, { fonte: await logada(true) });
    const link = await screen.findByRole("link", { name: "Criar uma estratégia" });
    expect(link).toHaveAttribute("href", "/estrategias");
  });
});
