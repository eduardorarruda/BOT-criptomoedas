import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { AVANCADO_INICIAL, GrupoDiasDeEvento, type Avancado } from "./CamposCripto";

function Exemplo({ aoMudar }: { readonly aoMudar: (a: Avancado) => void }) {
  const [a, setA] = useState<Avancado>(AVANCADO_INICIAL);
  return (
    <GrupoDiasDeEvento
      a={a}
      mudar={(p) => {
        const novo = { ...a, ...p };
        setA(novo);
        aoMudar(novo);
      }}
    />
  );
}

describe("backtest: filtro de dias de evento", () => {
  it("nasce em ignorar, explica o risco de bloquear e aceita bloquear e reduzir", async () => {
    let ultimo = AVANCADO_INICIAL;
    render(<Exemplo aoMudar={(a) => (ultimo = a)} />);
    const campo = screen.getByLabelText("Dias de Copom, payroll, eleição");
    expect(campo).toHaveValue("ignorar");
    expect(screen.getByText(/costumam ganhar justamente nesses dias/)).toBeInTheDocument();
    await userEvent.selectOptions(campo, "bloquear");
    expect(ultimo.diasDeEvento).toBe("bloquear");
    expect(screen.getByText(/As velas ficam/)).toBeInTheDocument();
    await userEvent.selectOptions(campo, "reduzir");
    expect(ultimo.diasDeEvento).toBe("reduzir");
  });

  it("sem violações de acessibilidade (axe)", async () => {
    render(<Exemplo aoMudar={() => undefined} />);
    const r = await axe.run(document.body, {
      rules: { "color-contrast": { enabled: false }, region: { enabled: false } },
    });
    expect(r.violations.map((v) => v.id)).toEqual([]);
  });
});
