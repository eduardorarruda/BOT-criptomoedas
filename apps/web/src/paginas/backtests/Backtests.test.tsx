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

/** Sob cobertura e com os outros pacotes rodando juntos, a primeira carga demora. */
const resultado = () => screen.findByRole("region", { name: /RSI.*v3 · BTCUSDT 1h/ }, { timeout: 15_000 });

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
      diasDeEvento: "ignorar",
      custos: { taxaPorLado: 0.00075, deslizamentoBps: 8, meioSpreadBps: 2 },
      risco: { modo: "sem_limites" },
      precisaoMinuto: false,
      execucao: "fechamento",
      validacao: { fracaoDentroDaAmostra: 0.8, janelas: 5, modoJanelas: "ancorada", limiteRuina: 0.3 },
    });
  });

  it("escolhe executar na abertura do candle seguinte e pede isso, no cripto e no WIN", async () => {
    const fonte = criarFonteDemo({ latenciaMs: [0, 0] });
    const criar = vi.spyOn(fonte, "criarBacktest");
    montar(fonte);
    await resultado();
    await userEvent.click(screen.getByText(/Custos, limites e validação/));
    const seletor = screen.getByLabelText("Executar ordens");
    expect(seletor).toHaveValue("fechamento");
    expect(screen.getByText(/É a forma mais simples, mas otimista/)).toBeInTheDocument();
    await userEvent.selectOptions(seletor, "proximaAbertura");
    expect(screen.getByText(/só chega ao mercado no candle seguinte/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Rodar backtest" }));
    await waitFor(() => expect(criar).toHaveBeenCalledTimes(1));
    expect(criar.mock.calls[0]![0].configuracao).toMatchObject({ execucao: "proximaAbertura" });

    await userEvent.selectOptions(screen.getByLabelText("Mercado"), "WIN-IBOV");
    await userEvent.selectOptions(screen.getByLabelText("Estratégia"), "e-win-faixa");
    await userEvent.click(screen.getByText(/Custos, sessão, tamanho e validação/));
    await userEvent.selectOptions(screen.getByLabelText("Executar ordens"), "proximaAbertura");
    await userEvent.click(screen.getByRole("button", { name: "Rodar backtest" }));
    await waitFor(() => expect(criar).toHaveBeenCalledTimes(2));
    expect(criar.mock.calls[1]![0].configuracao).toMatchObject({
      mercado: "win",
      execucao: "proximaAbertura",
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

describe("mini índice (WIN)", () => {
  const resultadoWin = async () => {
    await resultado();
    await userEvent.click(screen.getByRole("button", { name: /WIN-IBOV · 5m/ }));
    return screen.findByRole("region", { name: /v1 · WIN-IBOV 5m/ });
  };

  it("resultado em reais e pontos, IR estimado, referência da sessão e o aviso da aproximação", async () => {
    montar();
    const r = await resultadoWin();
    expect(within(r).getByRole("note")).toHaveTextContent(
      "Aproximação: o índice à vista não tem a base do futuro nem o horário completo do WIN; valide com dados reais do WIN antes de operar.",
    );
    const kpis = within(r).getByLabelText("Indicadores do backtest");
    for (const rotulo of [
      "Resultado líquido",
      "Depois do IR (estimado)",
      "Por contrato",
      "Custos do mini índice",
    ])
      expect(within(kpis).getByText(rotulo)).toBeInTheDocument();
    expect(within(kpis).getAllByText(/R\$/).length).toBeGreaterThan(3);
    expect(within(kpis).getAllByText(/pontos/).length).toBeGreaterThan(0);
    expect(within(kpis).getByText(/ficar de fora: R\$ 0,00/)).toBeInTheDocument();
    expect(within(r).getByRole("table", { name: "IR estimado por mês" })).toBeInTheDocument();
    expect(within(r).getByText(/não é parecer tributário\. Day trade paga 20%/)).toBeInTheDocument();
    const veredito = within(r).getByRole("region", { name: "Veredito" });
    expect(within(veredito).getByText(/Custos consomem \d+% do ganho bruto/)).toBeInTheDocument();
    expect(within(veredito).getByText(/depois do IR estimado/)).toBeInTheDocument();
    expect(within(veredito).getByText("Rodou na aproximação pelo Ibovespa, não no WIN")).toBeInTheDocument();
    expect(within(veredito).getByText(/sempre comprado na sessão/)).toBeInTheDocument();
    expect(within(r).getByText(/R\$ 0,20 por ponto por contrato, tick de 5 pontos/)).toBeInTheDocument();
    expect(within(r).getByText(/vendido, pela máxima/)).toBeInTheDocument();
  });

  it("pede o backtest do WIN com o modelo do mercado (custos, sessão, tamanho)", async () => {
    const fonte = criarFonteDemo({ latenciaMs: [0, 0] });
    const criar = vi.spyOn(fonte, "criarBacktest");
    montar(fonte);
    await resultado();
    await userEvent.selectOptions(screen.getByLabelText("Mercado"), "WIN-IBOV");
    expect(screen.getByText(/^Aproximação: o índice à vista/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Par")).not.toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText("Estratégia"), "e-win-faixa");
    await userEvent.click(screen.getByText(/Custos, sessão, tamanho e validação/));
    await userEvent.clear(screen.getByLabelText("Deslizamento (ticks)"));
    await userEvent.type(screen.getByLabelText("Deslizamento (ticks)"), "2");
    await userEvent.clear(screen.getByLabelText("Risco por operação (R$)"));
    await userEvent.type(screen.getByLabelText("Risco por operação (R$)"), "80");
    await userEvent.selectOptions(screen.getByLabelText(/^Limites de risco/), "sem");
    await userEvent.click(screen.getByRole("button", { name: "Rodar backtest" }));
    await waitFor(() => expect(criar).toHaveBeenCalled());
    const pedido = criar.mock.calls[0]![0];
    expect(pedido).toMatchObject({ estrategiaId: "e-win-faixa", simbolo: "WIN-IBOV", intervalo: "5m" });
    expect(pedido.configuracao).toEqual({
      diasDeEvento: "ignorar",
      mercado: "win",
      saldoInicial: "5000",
      risco: { modo: "sem_limites" },
      execucao: "fechamento",
      validacao: { fracaoDentroDaAmostra: 0.7, janelas: 5, modoJanelas: "rolante", limiteRuina: 0.3 },
      win: {
        tarifaB3PorContrato: "0.25",
        corretagemPorContrato: "0",
        deslizamentoTicks: 2,
        inicioEntradas: "09:15",
        fimEntradas: "17:30",
        zeragem: "18:15",
        pularLeilaoAbertura: true,
        margemPorContrato: "155",
        contratosMaximos: 5,
        riscoPorOperacao: "80",
      },
    });
    // o período acaba no último candle gravado, não hoje
    expect(pedido.fim).toBeLessThanOrEqual(Date.now());
  });

  it("WIN de verdade sem candles importados: explica como importar do MetaTrader 5 e não deixa rodar", async () => {
    const fonte = criarFonteDemo({ latenciaMs: [0, 0] });
    vi.spyOn(fonte, "dadosWin").mockResolvedValue([]);
    montar(fonte);
    await resultado();
    expect(within(screen.getByLabelText("Mercado")).queryByText(/aproximação pelo Ibovespa/)).toBeNull();
    await userEvent.selectOptions(screen.getByLabelText("Mercado"), "WIN");
    expect(screen.getByText("Ainda não há candles do WIN importados")).toBeInTheDocument();
    expect(screen.getByText(/Exportar barras/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Rodar backtest" })).toBeDisabled();
  });

  it("estratégia que vende não roda no cripto: explica e não deixa rodar", async () => {
    montar();
    await resultado();
    await userEvent.selectOptions(screen.getByLabelText("Estratégia"), "e-win-faixa");
    expect(
      screen.getByText("Esta estratégia vende a descoberto: só roda no mini índice."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Rodar backtest" })).toBeDisabled();
  });

  it("campos do WIN inválidos: explica e não deixa rodar", async () => {
    montar();
    await resultado();
    await userEvent.selectOptions(screen.getByLabelText("Mercado"), "WIN");
    await userEvent.click(screen.getByText(/Custos, sessão, tamanho e validação/));
    await userEvent.clear(screen.getByLabelText("Margem por contrato (R$)"));
    await userEvent.type(screen.getByLabelText("Margem por contrato (R$)"), "0");
    expect(screen.getAllByRole("alert").some((a) => /maior que zero/.test(a.textContent ?? ""))).toBe(true);
    expect(screen.getByRole("button", { name: "Rodar backtest" })).toBeDisabled();
  });

  it("acessível (axe): resultado do WIN e o formulário do WIN aberto", async () => {
    const { container } = montar();
    await resultadoWin();
    await userEvent.selectOptions(screen.getByLabelText("Mercado"), "WIN-IBOV");
    await userEvent.click(screen.getByText(/Custos, sessão, tamanho e validação/));
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
      execucao: "fechamento" as const,
      diasDeEvento: "ignorar" as const,
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
    expect(configuracaoDoFormulario(a, 30, []).diasDeEvento).toBe("ignorar");
    expect(configuracaoDoFormulario({ ...a, diasDeEvento: "bloquear" }, 30, []).diasDeEvento).toBe(
      "bloquear",
    );
    expect(configuracaoDoFormulario({ ...a, limites: "padrao" }, 30, []).risco).toEqual({ modo: "robo" });
  });
});
