import { render, screen, within } from "@testing-library/react";
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

  it("só com estratégias que vendem: pede uma que só compra", () => {
    render(
      <FormRobo estrategias={[ESTRATEGIA_WIN]} enviando={false} aoCriar={vi.fn()} aoCancelar={vi.fn()} />,
    );
    expect(screen.getByText(/crie uma estratégia que só compra/)).toBeInTheDocument();
  });
});
