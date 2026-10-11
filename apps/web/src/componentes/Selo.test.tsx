import { render, screen } from "@testing-library/react";
import { Pause } from "lucide-react";
import { describe, expect, it } from "vitest";
import { Selo } from "./Selo";

describe("Selo", () => {
  it("sempre tem texto; o tom vira classe", () => {
    render(<Selo tom="info">Novo</Selo>);
    expect(screen.getByText("Novo")).toHaveClass("selo", "selo--info");
  });

  it("mostra o ponto só quando não há ícone", () => {
    const { container, rerender } = render(<Selo ponto>Ativo</Selo>);
    expect(container.querySelector(".selo__ponto")).toHaveAttribute("aria-hidden", "true");
    rerender(
      <Selo ponto icone={Pause}>
        Pausado
      </Selo>,
    );
    expect(container.querySelector(".selo__ponto")).toBeNull();
    expect(container.querySelector("svg")).toBeInTheDocument();
  });
});
