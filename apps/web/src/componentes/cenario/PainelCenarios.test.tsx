import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { criarFonteDemo } from "../../demo/fonteDemo";
import { renderizarNaRota } from "../../teste/rota";
import { PainelCenarios } from "./PainelCenarios";

describe("Cenário agora", () => {
  it("um cartão por ativo: alta, queda e lateral, com ícone e palavra, não só cor", async () => {
    renderizarNaRota(<PainelCenarios />, { fonte: criarFonteDemo({ latenciaMs: [0, 0] }) });
    const btc = await screen.findByRole("article", { name: /BTC\/USDT em 1 h: tendência de alta/ });
    expect(btc.querySelector(".selo")).toHaveTextContent("Alta");
    expect(within(btc).getByText(/3,7% acima da média de 200 velas/)).toBeInTheDocument();
    const eth = screen.getByRole("article", { name: /ETH\/USDT em 15 min: tendência de queda/ });
    expect(eth.querySelector(".selo")).toHaveTextContent("Queda");
    const sol = screen.getByRole("article", { name: /SOL\/USDT em 4 h: mercado lateral/ });
    expect(sol.querySelector(".selo")).toHaveTextContent("Lateral");
  });

  it("cada cartão diz o que os robôs do ativo estão fazendo e por quê", async () => {
    renderizarNaRota(<PainelCenarios />, { fonte: criarFonteDemo({ latenciaMs: [0, 0] }) });
    const btc = await screen.findByRole("article", { name: /BTC\/USDT/ });
    const lista = within(btc).getByRole("list", { name: "Robôs em BTC/USDT" });
    expect(within(lista).getByRole("link", { name: "BTC paciente" })).toHaveAttribute(
      "href",
      expect.stringContaining("/aovivo"),
    );
    expect(within(lista).getByText("Fora")).toBeInTheDocument();
    expect(within(lista).getByText(/não é verdade que RSI\(14\) \(47,3\) < 30/)).toBeInTheDocument();
    expect(within(lista).getByText("Claude confere")).toBeInTheDocument();
    const bnb = screen.getByRole("article", { name: /BNB\/USDT/ });
    expect(within(bnb).getByText("Claude desligado")).toBeInTheDocument();
  });

  it("a régua da média tem texto para leitor de tela com o número e o limiar", async () => {
    renderizarNaRota(<PainelCenarios />, { fonte: criarFonteDemo({ latenciaMs: [0, 0] }) });
    const btc = await screen.findByRole("article", { name: /BTC\/USDT/ });
    expect(
      within(btc).getByRole("img", { name: /Inclinação da média de 200 velas: \+1,9% em 50 velas.*0,4%/ }),
    ).toBeInTheDocument();
  });

  it("os números que justificam o cenário aparecem com rótulo", async () => {
    renderizarNaRota(<PainelCenarios />, { fonte: criarFonteDemo({ latenciaMs: [0, 0] }) });
    const btc = await screen.findByRole("article", { name: /BTC\/USDT/ });
    expect(within(btc).getByText("Preço × média de 200")).toBeInTheDocument();
    expect(within(btc).getByText("Eficiência da tendência")).toBeInTheDocument();
    expect(within(btc).getByText("Variação em 7 dias")).toBeInTheDocument();
  });

  it("sem nenhum robô lendo ainda, explica quando o cenário aparece", async () => {
    renderizarNaRota(<PainelCenarios />, { fonte: criarFonteDemo({ latenciaMs: [0, 0], vazio: true }) });
    expect(await screen.findByText("Ainda sem leitura")).toBeInTheDocument();
  });

  it("explica como o cenário é decidido", async () => {
    renderizarNaRota(<PainelCenarios />, { fonte: criarFonteDemo({ latenciaMs: [0, 0] }) });
    await screen.findByRole("article", { name: /BTC\/USDT/ });
    expect(screen.getByText("Como o cenário é decidido")).toBeInTheDocument();
  });
});
