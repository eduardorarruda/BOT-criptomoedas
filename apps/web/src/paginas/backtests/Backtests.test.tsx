import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { describe, expect, it, vi } from "vitest";
import type { Fonte } from "../../api/fonte";
import { criarFonteDemo } from "../../demo/fonteDemo";
import { renderizar } from "../../teste/renderizar";
import { Backtests } from "../Backtests";
import { configuracaoDoFormulario, lerBps } from "./FormBacktest";

const OPCOES_AXE: axe.RunOptions = {
  rules: { "color-contrast": { enabled: false } },
  resultTypes: ["violations"],
};

function montar(fonte: Fonte = criarFonteDemo({ latenciaMs: [0, 0] })) {
  return { ...renderizar(<Backtests />, fonte), fonte };
}

/** Uma verificação do veredito pelo texto inteiro (o tom vai num trecho só para leitor de tela). */
const checagem = (raiz: HTMLElement, texto: string) =>
  within(raiz).getByText(
    (_, el) => el?.classList.contains("bt-veredito__titulo") === true && el.textContent === texto,
  );

const resultado = () => screen.findByRole("region", { name: /RSI.*v3 · BTCUSDT 1h/ });

describe("tela Backtests", () => {
  it("resultado validado: veredito, indicadores, buy and hold, validação, tentativas e aviso", async () => {
    montar();
    const r = await resultado();
    const veredito = within(r).getByRole("region", { name: "Veredito" });
    expect(within(veredito).getAllByRole("listitem").length).toBeGreaterThanOrEqual(8);
    expect(checagem(veredito, "Verde: Fora da amostra (OOS) manteve o resultado")).toBeInTheDocument();
    expect(within(veredito).getByText(/Não é recomendação de investir nem de operar/)).toBeInTheDocument();
    const kpis = within(r).getByLabelText("Indicadores do backtest");
    for (const rotulo of [
      "Resultado líquido",
      "Buy and hold",
      "Sharpe · Sortino",
      "Fator de lucro",
      "Maior queda",
    ])
      expect(within(kpis).getByText(rotulo)).toBeInTheDocument();
    expect(within(r).getByRole("img", { name: /Retorno acumulado \(simulado\)/ })).toBeInTheDocument();
    expect(within(r).getByRole("img", { name: /Queda a partir do pico/ })).toBeInTheDocument();
    expect(within(r).getByRole("table", { name: "Comparação dentro e fora da amostra" })).toBeInTheDocument();
    const wf = within(r).getByRole("table", { name: "Janelas do walk-forward" });
    expect(within(wf).getAllByRole("row")).toHaveLength(6);
    expect(within(r).getByText(/Supõe que cada operação independe das outras/)).toBeInTheDocument();
    expect(within(r).getByRole("heading", { name: "3 tentativas desta estratégia" })).toBeInTheDocument();
    expect(within(r).getByText("Sharpe deflacionado")).toBeInTheDocument();
    expect(within(r).getByText(/não garante resultado futuro/)).toBeInTheDocument();
  });

  it("backtest antigo continua aparecendo, com o aviso de que rodou sem validação", async () => {
    montar();
    await resultado();
    const antigo = screen.getByRole("button", { name: /ETHUSDT · 1h.*antigo, sem validação/ });
    await userEvent.click(antigo);
    const r = await screen.findByRole("region", { name: /v1 · ETHUSDT 1h/ });
    expect(within(r).getByText(/Backtest de antes da validação/)).toBeInTheDocument();
    expect(checagem(r, "Verde: Terminou no lucro depois dos custos")).toBeInTheDocument();
    expect(within(r).queryByRole("table", { name: "Janelas do walk-forward" })).not.toBeInTheDocument();
  });

  it("backtest sem limites aparece marcado como menos realista", async () => {
    montar();
    await resultado();
    await userEvent.click(screen.getByRole("button", { name: /SOLUSDT · 4h/ }));
    const r = await screen.findByRole("region", { name: /SOLUSDT 4h/ });
    expect(checagem(r, "Amarelo: Sem os limites de risco do robô")).toBeInTheDocument();
    expect(within(r).getByText(/nenhum \(menos realista/)).toBeInTheDocument();
    expect(within(r).getByText("Piorou fora da amostra")).toBeInTheDocument();
  });

  it("pede o backtest com custos, limites e validação escolhidos", async () => {
    const fonte = criarFonteDemo({ latenciaMs: [0, 0] });
    const criar = vi.spyOn(fonte, "criarBacktest");
    montar(fonte);
    await resultado();
    await userEvent.click(screen.getByText(/Custos, limites e validação/));
    await userEvent.selectOptions(screen.getByLabelText("Taxa da corretora por ponta"), "bnb");
    await userEvent.clear(screen.getByLabelText("Deslizamento (pontos-base)"));
    await userEvent.type(screen.getByLabelText("Deslizamento (pontos-base)"), "8");
    await userEvent.selectOptions(screen.getByLabelText(/^Limites de risco/), "sem");
    await userEvent.selectOptions(screen.getByLabelText(/^Dentro da amostra/), "0.8");
    await userEvent.click(screen.getByRole("radio", { name: "Ancorada" }));
    expect(screen.getByRole("checkbox", { name: /Precisão de 1 minuto/ })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Rodar backtest" }));
    await waitFor(() => expect(criar).toHaveBeenCalled());
    expect(criar.mock.calls[0]?.[0].configuracao).toEqual({
      custos: { taxaPorLado: 0.00075, deslizamentoBps: 8, meioSpreadBps: 2 },
      risco: { modo: "sem_limites" },
      precisaoMinuto: false,
      validacao: { fracaoDentroDaAmostra: 0.8, janelas: 5, modoJanelas: "ancorada", limiteRuina: 0.3 },
    });
  });

  it("deslizamento inválido: explica e não deixa rodar", async () => {
    montar();
    await resultado();
    await userEvent.click(screen.getByText(/Custos, limites e validação/));
    await userEvent.clear(screen.getByLabelText("Meio spread (pontos-base)"));
    await userEvent.type(screen.getByLabelText("Meio spread (pontos-base)"), "500");
    expect(screen.getAllByRole("alert").some((a) => /de 0 a 100/.test(a.textContent ?? ""))).toBe(true);
    expect(screen.getByRole("button", { name: "Rodar backtest" })).toBeDisabled();
  });

  it("nunca recomenda investir ou operar", async () => {
    const { container } = montar();
    await resultado();
    expect(container.textContent).not.toMatch(/você deveria|recomendamos|sugerimos|aconselh|invista/i);
  });

  it("acessível (axe), com o painel de opções aberto", async () => {
    const { container } = montar();
    await resultado();
    await userEvent.click(screen.getByText(/Custos, limites e validação/));
    const r = await axe.run(container, OPCOES_AXE);
    expect(r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.html).join(" | ")}`)).toEqual([]);
  });
});

describe("configuração do formulário", () => {
  it("pontos-base aceitam vírgula e recusam fora de 0–100", () => {
    expect(lerBps("2,5")).toBe(2.5);
    expect(lerBps("")).toBeNull();
    expect(lerBps("-1")).toBeNull();
    expect(lerBps("101")).toBeNull();
  });

  it("limites copiados de um robô e precisão de 1 minuto só até 31 dias", () => {
    const limites = {
      perdaDiariaMaxima: "15",
      exposicaoMaxima: "200",
      riscoPorOperacao: "4",
      ordensPorHoraMax: 4,
      pausaAposPerdaMin: 60,
      confiancaMinima: 0.7,
    };
    const robo = { id: "r1", limites } as Parameters<typeof configuracaoDoFormulario>[2][number];
    const a = {
      taxa: "vip0" as const,
      deslizamento: "5",
      meioSpread: "2",
      limites: "r1",
      precisaoMinuto: true,
      fracaoDentro: "0.7",
      janelas: "5",
      modoJanelas: "rolante" as const,
      ruina: "0.3",
    };
    expect(configuracaoDoFormulario(a, 30, [robo])).toMatchObject({
      risco: { modo: "robo", limites },
      precisaoMinuto: true,
    });
    expect(configuracaoDoFormulario(a, 90, [robo]).precisaoMinuto).toBe(false);
    expect(configuracaoDoFormulario({ ...a, limites: "padrao" }, 30, []).risco).toEqual({ modo: "robo" });
  });
});
