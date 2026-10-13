import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { TabelaRolagem } from "./TabelaRolagem";

describe("TabelaRolagem", () => {
  it("é uma região com nome que recebe foco pelo Tab (para rolar pelo teclado)", async () => {
    render(
      <TabelaRolagem rotulo="Limites de cada robô" className="extra">
        <table>
          <tbody>
            <tr>
              <td>1</td>
            </tr>
          </tbody>
        </table>
      </TabelaRolagem>,
    );
    const regiao = screen.getByRole("region", { name: "Limites de cada robô" });
    expect(regiao).toHaveClass("tabela-rolagem", "extra");
    await userEvent.tab();
    expect(regiao).toHaveFocus();
  });
});
