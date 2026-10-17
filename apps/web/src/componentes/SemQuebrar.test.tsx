import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SemQuebrar } from "./SemQuebrar";

function Quebra(): never {
  throw new Error("pedaço não carregou");
}

describe("SemQuebrar", () => {
  it("se o que está dentro falha, some sozinho e o resto da tela fica", () => {
    const erro = vi.spyOn(console, "error").mockImplementation(() => undefined);
    render(
      <>
        <p>tela</p>
        <SemQuebrar>
          <Quebra />
        </SemQuebrar>
      </>,
    );
    expect(screen.getByText("tela")).toBeInTheDocument();
    erro.mockRestore();
  });
});
