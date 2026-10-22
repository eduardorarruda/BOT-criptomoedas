import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { criarFonteDemo } from "../../demo/fonteDemo";
import { renderizarNaRota } from "../../teste/rota";
import { PensamentoDoRobo } from "./PensamentoDoRobo";

async function abrir(roboId: string) {
  const fonte = criarFonteDemo({ latenciaMs: [0, 0] });
  const robo = (await fonte.robos()).find((r) => r.id === roboId)!;
  renderizarNaRota(<PensamentoDoRobo robo={robo} />, { fonte });
}

describe("Robô por dentro", () => {
  it("mostra a conclusão, o cenário e cada condição da regra com ✓ ou ✗", async () => {
    await abrir("r-btc");
    expect(
      await screen.findByText(/^Fico de fora: não é verdade que RSI\(14\) \(47,3\) < 30\.$/),
    ).toBeInTheDocument();
    const regra = screen.getByRole("list", { name: "Regra de entrada, condição por condição" });
    expect(within(regra).getByText(/RSI\(14\) \(47,3\) < 30/)).toBeInTheDocument();
    expect(within(regra).getAllByText(/Falsa:/).length).toBeGreaterThan(0);
    expect(within(regra).getAllByText(/Verdadeira:/).length).toBeGreaterThan(0);
    expect(screen.getByText(/3,7% acima da média de 200 velas/)).toBeInTheDocument();
  });

  it("diz se o Claude confere as entradas ou está desligado", async () => {
    await abrir("r-btc");
    expect(await screen.findByText("Claude confere as entradas")).toBeInTheDocument();
  });

  it("Claude desligado aparece com todas as letras", async () => {
    await abrir("r-bnb");
    expect(await screen.findByText("Claude desligado")).toBeInTheDocument();
  });

  it("linha do tempo curta: mudanças de cenário e sinais, não cada vela", async () => {
    await abrir("r-eth");
    const linha = await screen.findByRole("list", { name: /Mudanças de cenário e sinais/ });
    expect(within(linha).getAllByRole("listitem")).toHaveLength(3);
    expect(within(linha).getByText("A regra deu sinal")).toBeInTheDocument();
    expect(within(linha).getByText("O cenário mudou")).toBeInTheDocument();
    expect(within(linha).getByText("Primeira leitura")).toBeInTheDocument();
  });

  it("robô novo, sem nenhuma vela fechada ainda: explica quando o pensamento aparece", async () => {
    const fonte = criarFonteDemo({ latenciaMs: [0, 0] });
    const novo = await fonte.criarRobo({
      nome: "Novo",
      simbolo: "BTCUSDT",
      intervalo: "1h",
      rede: "papel",
      estrategiaId: "e-rsi",
      estrategiaVersao: 3,
      limites: (await fonte.robos())[0]!.limites,
    });
    renderizarNaRota(<PensamentoDoRobo robo={novo} />, { fonte });
    expect(await screen.findByText("Ainda sem pensamento")).toBeInTheDocument();
  });
});
