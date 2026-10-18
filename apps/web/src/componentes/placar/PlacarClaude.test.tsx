import { placarParaDTO, type PlacarDTO } from "@zentrade/contratos/esquemas";
import { calcularPlacar, dec, type DecisaoPlacar } from "@zentrade/dominio";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { describe, expect, it, vi } from "vitest";
import type { Fonte } from "../../api/fonte";
import { renderizar } from "../../teste/renderizar";
import { ConteudoPlacar, PlacarClaude } from "./PlacarClaude";

let seq = 0;
const d = (
  claude: DecisaoPlacar["claude"],
  confianca: number,
  resultado: number | null,
  robo = "r1",
): DecisaoPlacar => ({
  id: `d${++seq}`,
  em: seq,
  claude,
  confianca,
  fonte: "contrafactual",
  resultado: resultado === null ? null : dec(resultado),
  retorno: resultado === null ? null : resultado / 100,
  moeda: "USDT",
  roboId: robo,
  roboNome: robo === "r1" ? "BTC 15m" : "SOL 1h",
  estrategiaId: "e1",
  estrategiaNome: "Rompimento",
  mercado: "cripto",
});

/** 4 aprovações (3 certas), 2 vetos (1 certo), 1 pendente, em dois robôs. */
const placar = (): PlacarDTO =>
  placarParaDTO(
    calcularPlacar([
      d("aprovou", 0.9, 4),
      d("aprovou", 0.85, 3),
      d("aprovou", 0.8, 2, "r2"),
      d("aprovou", 0.6, -9),
      d("vetou", 0.7, -5),
      d("vetou", 0.65, 6, "r2"),
      d("aprovou", 0.7, null),
    ]),
    0,
  );

const OPCOES_AXE: axe.RunOptions = {
  rules: { "color-contrast": { enabled: false } },
  resultTypes: ["violations"],
};

describe("placar do Claude na tela", () => {
  it("mostra precisão contra a meta, vetos, dinheiro agregado e o aviso de poucas amostras", () => {
    render(<ConteudoPlacar placar={placar()} comRobos />);
    const grade = screen.getByLabelText("Placar do Claude");
    const kpis = within(grade);
    expect(kpis.getByText("Aprovações certas").closest(".kpi")).toHaveTextContent("75%");
    expect(kpis.getByText("Abaixo da meta de 80%")).toBeInTheDocument();
    expect(kpis.getByText("Vetos certos").closest(".kpi")).toHaveTextContent("50%");
    // aprovadas: 4 + 3 + 2 − 9 = 0; aprovar tudo: 0 − 5 + 6 = 1 → o Claude tirou US$ 1
    expect(kpis.getByText("O que o Claude agregou").closest(".kpi")).toHaveTextContent("−US$ 1,00");
    expect(screen.getByText(/Só 6 decisões avaliadas/)).toBeInTheDocument();
    expect(screen.getByText(/1 esperando o mercado/)).toBeInTheDocument();
  });

  it("explica por que a % de acerto engana, com o acerto necessário para empatar", () => {
    render(<ConteudoPlacar placar={placar()} comRobos />);
    const bloco = screen.getByRole("region", { name: /% de acerto.*engana/i });
    // ganho médio 3, perda média 9: empata acertando 9 ÷ 12 = 75%
    expect(bloco).toHaveTextContent("US$ 3,00");
    expect(bloco).toHaveTextContent("US$ 9,00");
    expect(bloco).toHaveTextContent("acertar 75%");
  });

  it("sugere o limite de confiança e abre a conta de cada limite", async () => {
    render(<ConteudoPlacar placar={placar()} comRobos />);
    const limite = screen.getByRole("region", { name: "Limite de confiança" });
    expect(limite).toHaveTextContent("pelo menos 0,65");
    expect(limite).toHaveTextContent("100%");
    expect(limite).toHaveTextContent("poucos casos");
    await userEvent.click(screen.getByText("Ver a conta de cada limite de confiança"));
    const tabela = screen.getByRole("table", { name: /Se só valessem/ });
    expect(within(tabela).getAllByRole("row")).toHaveLength(1 + 9);
  });

  it("calibração em tabela e o placar por robô", () => {
    render(<ConteudoPlacar placar={placar()} comRobos />);
    const calibracao = screen.getByRole("table", { name: /Calibração/ });
    expect(within(calibracao).getByRole("rowheader", { name: "0,90 a 1,00" })).toBeInTheDocument();
    const robos = screen.getByRole("table", { name: /por robô/ });
    expect(within(robos).getByRole("rowheader", { name: "SOL 1h" })).toBeInTheDocument();
  });

  it("sem decisões do Claude: estado vazio que diz quando o placar começa", () => {
    render(<ConteudoPlacar placar={placarParaDTO(calcularPlacar([]), 0)} comRobos />);
    expect(screen.getByText("Ainda sem decisões do Claude")).toBeInTheDocument();
  });

  it("sem violações de acessibilidade (axe)", async () => {
    const { container } = render(<ConteudoPlacar placar={placar()} comRobos />);
    const r = await axe.run(container, OPCOES_AXE);
    expect(r.violations.map((v) => v.id)).toEqual([]);
  });

  it("pede o placar à fonte com o robô escolhido", async () => {
    const fonte = { placar: vi.fn(async () => placar()) } as unknown as Fonte;
    renderizar(<PlacarClaude roboId="r2" />, fonte);
    expect(await screen.findByRole("heading", { name: "Placar do Claude" })).toBeInTheDocument();
    expect(await screen.findByText("Aprovações certas")).toBeInTheDocument();
    expect(fonte.placar).toHaveBeenCalledWith({ roboId: "r2" });
    // com um robô escolhido, a tabela por robô sai
    expect(screen.queryByRole("table", { name: /por robô/ })).toBeNull();
  });
});
