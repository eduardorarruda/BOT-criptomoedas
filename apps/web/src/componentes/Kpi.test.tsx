import { render, screen, within } from "@testing-library/react";
import { TrendingDown } from "lucide-react";
import { describe, expect, it } from "vitest";
import { CartaoKpi, GradeKpi } from "./Kpi";

describe("GradeKpi e CartaoKpi", () => {
  it("lê como lista de definições: rótulo, valor, variação e nota", () => {
    render(
      <GradeKpi rotulo="Resumo do dia" colunas={3}>
        <CartaoKpi
          destaque
          rotulo="Resultado do dia"
          valor="US$ 10,00"
          variacao="+US$ 3,35 em 30 dias"
          tomVariacao="ganho"
          nota="inclui posições abertas"
          grafico={<svg data-testid="mini" />}
        />
        <CartaoKpi icone={TrendingDown} rotulo="Maior queda" valor="-US$ 2,00" tom="perda" />
      </GradeKpi>,
    );
    const grade = screen.getByLabelText("Resumo do dia");
    expect(grade.tagName).toBe("DL");
    expect(grade).toHaveClass("grade-kpi--3");
    const termos = within(grade).getAllByRole("term");
    expect(termos.map((t) => t.textContent)).toEqual(["Resultado do dia", "Maior queda"]);
    expect(screen.getByText("+US$ 3,35 em 30 dias")).toHaveClass("kpi__variacao--ganho");
    expect(screen.getByText("inclui posições abertas")).toHaveClass("kpi__nota");
    // o minigráfico é enfeite: fica fora da árvore de acessibilidade
    expect(screen.getByTestId("mini").parentElement).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByText("Resultado do dia").closest(".kpi")).toHaveClass("kpi--destaque");
    expect(screen.getByText("Maior queda").closest(".kpi")).toHaveClass("kpi--perda");
  });

  it("sem variação, nota nem gráfico, mostra só rótulo e valor", () => {
    render(
      <GradeKpi>
        <CartaoKpi rotulo="Taxas" valor="US$ 0,34" />
      </GradeKpi>,
    );
    const cartao = screen.getByText("Taxas").closest(".kpi")!;
    expect(cartao.querySelectorAll("dd")).toHaveLength(1);
  });
});
