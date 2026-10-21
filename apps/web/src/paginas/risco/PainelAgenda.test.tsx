import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { describe, expect, it, vi } from "vitest";
import { renderizarNaRota } from "../../teste/rota";
import { ErroApi } from "../../api/erros";
import { criarFonteAgendaDemo, type FonteAgenda } from "./agenda-fonte";
import { ContextoFonteAgenda } from "./agenda-ganchos";
import { PainelAgenda } from "./PainelAgenda";

function montar(sobrescrever: Partial<FonteAgenda> = {}, vazio = false) {
  const base = criarFonteAgendaDemo(Date.now, vazio);
  const fonte: FonteAgenda = {
    ...base,
    criar: vi.fn(base.criar),
    remover: vi.fn(base.remover),
    confirmar: vi.fn(base.confirmar),
    sugerir: vi.fn(base.sugerir),
    ...sobrescrever,
  };
  renderizarNaRota(
    <ContextoFonteAgenda.Provider value={fonte}>
      <PainelAgenda />
    </ContextoFonteAgenda.Provider>,
  );
  return fonte;
}

const painel = async () =>
  (await screen.findByRole("heading", { level: 2, name: "Agenda de eventos" })).closest(
    "section",
  ) as HTMLElement;

describe("painel Agenda de eventos", () => {
  it("lista os eventos com impacto, mercado e horário, e explica que o filtro é opcional", async () => {
    montar();
    const p = await painel();
    expect((await within(p).findAllByText("Copom — decisão da Selic")).length).toBeGreaterThan(0);
    expect(within(p).getAllByText("Alto impacto").length).toBeGreaterThan(0);
    expect(within(p).getAllByText("O dia todo", { exact: false }).length).toBeGreaterThan(0);
    expect(within(p).getByText(/piorou as estratégias de tendência/)).toBeInTheDocument();
  });

  it("cadastra um evento e valida antes de enviar", async () => {
    const fonte = montar({}, true);
    const p = await painel();
    expect(await within(p).findByText("Nenhum evento nos próximos 90 dias")).toBeInTheDocument();
    await userEvent.click(within(p).getByRole("button", { name: "Cadastrar evento" }));
    expect(fonte.criar).not.toHaveBeenCalled();
    expect((await within(p).findAllByRole("alert")).length).toBeGreaterThan(0);
    await userEvent.type(within(p).getByLabelText("Dia do evento"), "2026-10-28");
    await userEvent.type(within(p).getByLabelText("Título"), "Copom — decisão da Selic");
    await userEvent.click(within(p).getByRole("button", { name: "Cadastrar evento" }));
    await waitFor(() =>
      expect(fonte.criar).toHaveBeenCalledWith(
        expect.objectContaining({
          data: "2026-10-28",
          titulo: "Copom — decisão da Selic",
          mercado: "win",
          impacto: "alto",
        }),
      ),
    );
  });

  it("remover pede confirmação e só então remove", async () => {
    const fonte = montar();
    const p = await painel();
    await userEvent.click(await within(p).findByRole("button", { name: /Remover Copom/ }));
    expect(fonte.remover).not.toHaveBeenCalled();
    await userEvent.click(await screen.findByRole("button", { name: "Remover evento" }));
    await waitFor(() => expect(fonte.remover).toHaveBeenCalledWith("ev-1"));
    await waitFor(() => expect(within(p).queryByText("Copom — decisão da Selic")).not.toBeInTheDocument());
  });

  it("sugestão do Claude entra marcada; confirmar tira a marca", async () => {
    const fonte = montar();
    const p = await painel();
    await userEvent.click(within(p).getByRole("button", { name: "Sugerir eventos da semana" }));
    await waitFor(() => expect(fonte.sugerir).toHaveBeenCalledOnce());
    expect((await within(p).findAllByText("Sugerido pelo Claude")).length).toBe(2);
    await userEvent.click(within(p).getByRole("button", { name: /Confirmar CPI/ }));
    await waitFor(() => expect(within(p).getAllByText("Sugerido pelo Claude")).toHaveLength(1));
    expect(fonte.confirmar).toHaveBeenCalled();
  });

  it("erro ao sugerir aparece como aviso e não quebra a tela", async () => {
    montar({
      sugerir: () => Promise.reject(new ErroApi("assistente_indisponivel", "O Claude está desligado", 503)),
    });
    const p = await painel();
    await userEvent.click(within(p).getByRole("button", { name: "Sugerir eventos da semana" }));
    expect(await screen.findByText(/O Claude está desligado/)).toBeInTheDocument();
  });

  it("sem violações de acessibilidade (axe)", async () => {
    montar();
    const p = await painel();
    await within(p).findAllByText("Copom — decisão da Selic");
    const r = await axe.run(p, { rules: { "color-contrast": { enabled: false } } });
    expect(r.violations.map((v) => v.id)).toEqual([]);
  });
});
