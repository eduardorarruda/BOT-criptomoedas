import type { PropostaAgente } from "@zentrade/contratos/esquemas";
import { fireEvent, render, screen, within } from "@testing-library/react";
import axe from "axe-core";
import { describe, expect, it } from "vitest";
import { Cenarios } from "./Cenarios";

const BASE: PropostaAgente = {
  acao: "comprar",
  confianca: 0.72,
  tamanhoRelativo: 0.8,
  justificativa: "Recuo dentro de tendência de alta.",
  riscos: [],
  fontes: [],
};

const COM_CENARIOS: PropostaAgente = {
  ...BASE,
  // Fora de ordem de propósito: a tela mostra sempre alta, lateral, baixa.
  cenarios: [
    {
      nome: "baixa",
      probabilidade: 0.2,
      horizonte: 12,
      gatilho: "Fechamento abaixo de 63.900",
      invalidacao: "Volta acima da SMA(20)",
      resultadoEstimado: -2.7,
    },
    {
      nome: "alta",
      probabilidade: 0.5,
      horizonte: 24,
      gatilho: "Fechamento acima de 64.600 com volume",
      invalidacao: "Perder a SMA(200)",
      resultadoEstimado: 2.8,
    },
    {
      nome: "lateral",
      probabilidade: 0.3,
      horizonte: 24,
      gatilho: "Preço preso entre 63.900 e 64.600",
      invalidacao: "Rompimento de qualquer lado",
      resultadoEstimado: -0.2,
    },
  ],
  contraArgumento: "O fluxo em fundos de BTC à vista desacelerou: pode faltar comprador.",
  avaliacao: {
    valorEsperado: 0.8,
    favoravel: "alta",
    probabilidadeFavoravel: 0.5,
    limiar: 0.4,
    aplicada: true,
    aprovada: true,
    motivo: "Valor esperado positivo e a alta tem 50% de chance, acima do mínimo de 40%.",
  },
};

const OPCOES_AXE: axe.RunOptions = {
  rules: { "color-contrast": { enabled: false } },
  resultTypes: ["violations"],
};

/** Abre os cenários e o argumento contra (começam recolhidos). */
function renderAberto(proposta: PropostaAgente) {
  const r = render(<Cenarios proposta={proposta} />);
  fireEvent.click(screen.getByRole("button", { name: /^Ver / }));
  return r;
}

describe("Cenarios (prévias de futuro)", () => {
  it("começa recolhido: resumo à vista, cenários e argumento contra num botão acessível", () => {
    render(<Cenarios proposta={COM_CENARIOS} />);
    expect(screen.getByText("Valor esperado líquido")).toBeInTheDocument();
    const botao = screen.getByRole("button", { name: "Ver os 3 cenários e o argumento contra" });
    expect(botao).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
    fireEvent.click(botao);
    expect(botao).toHaveAttribute("aria-expanded", "true");
    expect(botao).toHaveTextContent("Esconder os 3 cenários e o argumento contra");
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    expect(document.getElementById(botao.getAttribute("aria-controls")!)).not.toHaveAttribute("hidden");
  });

  it("mostra os três cenários em ordem, com probabilidade, horizonte, gatilho, invalidação e resultado", () => {
    renderAberto(COM_CENARIOS);
    const secao = screen.getByRole("heading", {
      level: 3,
      name: "Prévias de futuro (cenários)",
    }).parentElement!;
    const itens = within(secao).getAllByRole("listitem");
    expect(itens.map((i) => within(i).getByRole("heading").textContent)).toEqual([
      "Alta",
      "Lateral",
      "Baixa",
    ]);

    const [alta, lateral, baixa] = itens;
    expect(within(alta!).getByRole("meter", { name: "Probabilidade do cenário de alta" })).toHaveAttribute(
      "aria-valuenow",
      "50",
    );
    expect(within(alta!).getByText("50%")).toBeInTheDocument();
    expect(alta).toHaveTextContent("em até 24 candles");
    expect(alta).toHaveTextContent("Fechamento acima de 64.600 com volume");
    expect(alta).toHaveTextContent("Perder a SMA(200)");
    expect(within(alta!).getByText("+2,80%")).toBeInTheDocument();
    expect(within(lateral!).getByText("−0,20%")).toBeInTheDocument();
    expect(within(baixa!).getByText("−2,70%")).toBeInTheDocument();
    expect(baixa).toHaveTextContent("em até 12 candles");
  });

  it("destaca o cenário favorável à operação com texto, não só com cor", () => {
    renderAberto(COM_CENARIOS);
    const [alta, lateral] = screen.getAllByRole("listitem");
    expect(alta).toHaveTextContent("Favorável à operação");
    expect(lateral).not.toHaveTextContent("Favorável à operação");
  });

  it("mostra o valor esperado calculado pelo código, o limiar e o veredito da regra com o motivo", () => {
    render(<Cenarios proposta={COM_CENARIOS} />);
    expect(screen.getByText("Valor esperado líquido")).toBeInTheDocument();
    expect(screen.getByText("+0,80%")).toBeInTheDocument();
    expect(screen.getByText("Chance do favorável (alta)").closest("div")).toHaveTextContent(
      "50% (mínimo de 40%)",
    );
    expect(screen.getByText("A regra dos cenários aprovou")).toBeInTheDocument();
    expect(screen.getByText(/Valor esperado positivo e a alta tem 50% de chance/)).toBeInTheDocument();
  });

  it("mostra o principal argumento contra a proposta", () => {
    renderAberto(COM_CENARIOS);
    expect(screen.getByText("Principal argumento contra")).toBeInTheDocument();
    expect(screen.getByText(/pode faltar comprador/)).toBeInTheDocument();
  });

  it("quando a regra barrou, diz que barrou e por quê", () => {
    const barrada: PropostaAgente = {
      ...COM_CENARIOS,
      acao: "aguardar",
      avaliacao: {
        valorEsperado: -0.05,
        favoravel: "alta",
        probabilidadeFavoravel: 0.3,
        limiar: 0.4,
        aplicada: true,
        aprovada: false,
        motivo: "A alta tem 30% de chance, abaixo do mínimo de 40%.",
      },
    };
    render(<Cenarios proposta={barrada} />);
    expect(screen.getByText("A regra dos cenários barrou a entrada")).toBeInTheDocument();
    expect(screen.getByText("−0,05%")).toBeInTheDocument();
    expect(screen.getByText(/abaixo do mínimo de 40%\./)).toBeInTheDocument();
  });

  it("quando a regra não se aplica (a proposta não abre posição), diz que só informa", () => {
    const saida: PropostaAgente = {
      ...COM_CENARIOS,
      acao: "vender",
      avaliacao: { ...COM_CENARIOS.avaliacao!, aplicada: false, motivo: "Venda para sair: só informa." },
    };
    render(<Cenarios proposta={saida} />);
    expect(screen.getByText(/A regra dos cenários só informa/)).toBeInTheDocument();
    expect(screen.queryByText("A regra dos cenários aprovou")).toBeNull();
  });

  it("sem avaliação do código, mostra os cenários sem valor esperado nem destaque", () => {
    const { avaliacao: _, ...semAvaliacao } = COM_CENARIOS;
    renderAberto(semAvaliacao);
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    expect(screen.queryByText("Valor esperado líquido")).toBeNull();
    expect(screen.queryByText("Favorável à operação")).toBeNull();
  });

  it("proposta anterior aos cenários: não mostra o bloco e não quebra", () => {
    const { container } = render(<Cenarios proposta={BASE} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("não tem violações de acessibilidade (axe), mesmo com vários cartões na tela", async () => {
    const { container } = render(
      <main>
        <h1>Decisões</h1>
        <h2>Hoje</h2>
        <Cenarios proposta={COM_CENARIOS} />
        <Cenarios proposta={COM_CENARIOS} />
      </main>,
    );
    screen.getAllByRole("button", { name: /^Ver / }).forEach((b) => fireEvent.click(b));
    const r = await axe.run(container, OPCOES_AXE);
    expect(r.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });
});
