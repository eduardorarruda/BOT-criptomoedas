import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Bot } from "lucide-react";
import { describe, expect, it, vi } from "vitest";
import { ErroCarregar, Esqueleto, EstadoVazio } from "./Estados";

describe("EstadoVazio", () => {
  it("centrado, com o anel do Ensō em volta do ícone, título, texto e ação", () => {
    const { container } = render(
      <EstadoVazio icone={Bot} titulo="Nenhum robô ainda" acao={<button type="button">Criar</button>}>
        Um robô novo nasce só observando.
      </EstadoVazio>,
    );
    expect(screen.getByText("Nenhum robô ainda")).toBeInTheDocument();
    expect(screen.getByText("Um robô novo nasce só observando.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Criar" })).toBeInTheDocument();
    expect(container.querySelector(".estado-vazio__anel")).toHaveAttribute("aria-hidden", "true");
  });

  it("compacto não desenha o anel; o ícone é opcional", () => {
    const { container, rerender } = render(
      <EstadoVazio compacto icone={Bot} titulo="Nada">
        texto
      </EstadoVazio>,
    );
    expect(container.firstChild).toHaveClass("estado-vazio--compacto");
    expect(container.querySelector(".estado-vazio__anel")).toBeNull();
    rerender(<EstadoVazio titulo="Sem ícone">texto</EstadoVazio>);
    expect(container.querySelector(".estado-vazio__simbolo")).toBeNull();
  });
});

describe("ErroCarregar", () => {
  it("diz que não carregou, mostra a mensagem e tenta de novo", async () => {
    const tentar = vi.fn();
    render(<ErroCarregar erro={new Error("A API não respondeu.")} tentarDeNovo={tentar} />);
    const alerta = screen.getByRole("alert");
    expect(alerta).toHaveTextContent("Não deu para carregar");
    await userEvent.click(screen.getByRole("button", { name: "Tentar de novo" }));
    expect(tentar).toHaveBeenCalledTimes(1);
  });
});

describe("Esqueleto", () => {
  it("anuncia o carregamento uma vez, com o rótulo", () => {
    render(<Esqueleto rotulo="Carregando robôs" />);
    expect(screen.getByRole("status", { name: "Carregando robôs" })).toBeInTheDocument();
  });

  it("desenha a forma pedida", () => {
    const { container, rerender } = render(<Esqueleto forma="kpis" quantidade={5} />);
    expect(container.querySelectorAll(".esqueleto__cartao")).toHaveLength(5);
    rerender(<Esqueleto forma="lista" linhas={3} />);
    expect(container.querySelectorAll(".esqueleto__item")).toHaveLength(3);
    rerender(<Esqueleto forma="grafico" altura={200} />);
    expect(container.querySelector(".esqueleto--grafico")).toHaveStyle({ height: "200px" });
    rerender(<Esqueleto altura={90} />);
    expect(container.querySelector(".esqueleto--bloco")).not.toHaveClass("esqueleto--grafico");
    rerender(<Esqueleto linhas={2} />);
    expect(container.querySelectorAll(".esqueleto__linha")).toHaveLength(2);
  });
});
