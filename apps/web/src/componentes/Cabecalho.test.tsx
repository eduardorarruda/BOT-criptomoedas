import { render, screen } from "@testing-library/react";
import { Bot } from "lucide-react";
import { describe, expect, it } from "vitest";
import { Cabecalho, ContextoSecao, Painel } from "./Cabecalho";

describe("Cabecalho", () => {
  it("mostra o grupo do menu como sobretítulo, vindo da casca", () => {
    render(
      <ContextoSecao.Provider value="Construir">
        <Cabecalho titulo="Robôs" acoes={<button type="button">Novo robô</button>}>
          Cada robô segue uma estratégia.
        </Cabecalho>
      </ContextoSecao.Provider>,
    );
    expect(screen.getByRole("heading", { level: 1, name: "Robôs" })).toBeInTheDocument();
    expect(screen.getByText("Construir")).toHaveClass("cabecalho__sobretitulo");
    expect(screen.getByText("Cada robô segue uma estratégia.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Novo robô" })).toBeInTheDocument();
  });

  it("o sobretítulo explícito vence o da casca, e null esconde", () => {
    const { rerender } = render(
      <ContextoSecao.Provider value="Construir">
        <Cabecalho titulo="X" sobretitulo="Simulação" />
      </ContextoSecao.Provider>,
    );
    expect(screen.getByText("Simulação")).toBeInTheDocument();
    rerender(
      <ContextoSecao.Provider value="Construir">
        <Cabecalho titulo="X" sobretitulo={null} />
      </ContextoSecao.Provider>,
    );
    expect(screen.queryByText("Construir")).toBeNull();
  });

  it("fora da casca não inventa sobretítulo; aceita meta e abas", () => {
    const { container } = render(
      <Cabecalho titulo="Sozinho" meta={<span>atualizado agora</span>} abas={<nav aria-label="Abas" />} />,
    );
    expect(container.querySelector(".cabecalho__sobretitulo")).toBeNull();
    expect(screen.getByText("atualizado agora")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Abas" })).toBeInTheDocument();
    expect(container.firstChild).toHaveClass("cabecalho--com-abas");
  });
});

describe("Painel", () => {
  it("dá nome à seção pelo título e mostra descrição e ícone", () => {
    const { container } = render(
      <Painel titulo="Robôs" id="t-robos" descricao="Os que estão ligados." icone={Bot} variante="destaque">
        conteúdo
      </Painel>,
    );
    expect(screen.getByRole("region", { name: "Robôs" })).toHaveClass("painel--destaque");
    expect(screen.getByText("Os que estão ligados.")).toBeInTheDocument();
    expect(container.querySelector(".painel__icone")).toHaveAttribute("aria-hidden", "true");
  });

  it("semBorda continua valendo (vira a variante plana)", () => {
    const { container } = render(<Painel semBorda>só conteúdo</Painel>);
    expect(container.firstChild).toHaveClass("painel--aberto");
    expect(container.firstChild).toHaveClass("painel--plano");
  });
});
