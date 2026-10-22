import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ESTRATEGIAS, ESTRATEGIA_WIN } from "../../demo/dados";
import { FormRobo } from "./FormRobo";

describe("criar robô", () => {
  it("só oferece estratégias que compram: as que vendem são do backtest do mini índice", () => {
    render(<FormRobo estrategias={ESTRATEGIAS} enviando={false} aoCriar={vi.fn()} aoCancelar={vi.fn()} />);
    const opcoes = within(screen.getByLabelText("Estratégia")).getAllByRole("option");
    expect(opcoes.map((o) => o.getAttribute("value"))).not.toContain(ESTRATEGIA_WIN.id);
    expect(opcoes).toHaveLength(ESTRATEGIAS.length - 1);
    expect(screen.getByText(/Uma estratégia que vende não aparece/)).toBeInTheDocument();
  });

  it("Claude: começa decidindo, explica o teste de replay e cria o robô com ele desligado", async () => {
    const aoCriar = vi.fn();
    render(<FormRobo estrategias={ESTRATEGIAS} enviando={false} aoCriar={aoCriar} aoCancelar={vi.fn()} />);
    const seletor = screen.getByLabelText(/^Claude/);
    expect(seletor).toHaveValue("decide");
    expect(within(seletor).getAllByRole("option")).toHaveLength(2);
    expect(screen.getByText(/indistinguível do acaso/)).toBeInTheDocument();
    await userEvent.selectOptions(seletor, "desligado");
    await userEvent.type(screen.getByLabelText("Nome"), "P1 sem Claude");
    await userEvent.click(screen.getByRole("button", { name: /Criar robô/ }));
    expect(aoCriar).toHaveBeenCalledWith(
      expect.objectContaining({ limites: expect.objectContaining({ agente: "desligado" }) }),
    );
  });

  it("só com estratégias que vendem: pede uma que só compra", () => {
    render(
      <FormRobo estrategias={[ESTRATEGIA_WIN]} enviando={false} aoCriar={vi.fn()} aoCancelar={vi.fn()} />,
    );
    expect(screen.getByText(/crie uma estratégia que só compra/)).toBeInTheDocument();
  });
});
