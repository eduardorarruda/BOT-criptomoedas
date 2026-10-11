import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { buscaAtual, renderizarNaRota } from "../../teste/rota";
import { Ordens } from "../Ordens";

const ESPERA = { timeout: 10_000 };

describe("tela Ordens com filtros", () => {
  it("filtra ordens e posições pelo robô vindo do link", async () => {
    renderizarNaRota(<Ordens />, { caminho: "/ordens?robo=r-sol" });
    const tabela = await screen.findByRole("table", { name: /Ordens enviadas/ }, ESPERA);
    const linhas = within(tabela).getAllByRole("row").slice(1);
    expect(linhas.length).toBeGreaterThan(0);
    for (const l of linhas) expect(l).toHaveTextContent("SOL rompimento");
    const posicoes = await screen.findByRole("table", { name: /Posição de cada robô/ }, ESPERA);
    expect(within(posicoes).getAllByRole("row")).toHaveLength(2);
    expect(screen.getByLabelText("Totais das ordens filtradas")).toHaveTextContent(/Valor executado/);
  });

  it("estado rejeitada mostra o motivo; agrupar por robô põe títulos na tabela", async () => {
    const usuario = userEvent.setup();
    const { roteador } = renderizarNaRota(<Ordens />, { caminho: "/ordens" });
    await usuario.click(await screen.findByRole("checkbox", { name: /Rejeitada/ }, ESPERA));
    await waitFor(() => expect(buscaAtual(roteador).estado).toBe("REJEITADA"));
    expect(await screen.findByText(/saldo insuficiente/)).toBeInTheDocument();
    await usuario.click(screen.getByRole("button", { name: "Mais filtros" }));
    await usuario.click(screen.getByRole("radio", { name: "Robô" }));
    await waitFor(() => expect(buscaAtual(roteador).agrupar).toBe("robo"));
    const tabela = screen.getByRole("table", { name: /Ordens enviadas/ });
    expect(within(tabela).getByRole("rowheader", { name: /BTC paciente/ })).toBeInTheDocument();
  });

  it("sem resultado: diz e limpa", async () => {
    const usuario = userEvent.setup();
    const { roteador } = renderizarNaRota(<Ordens />, { caminho: "/ordens?q=zzz-nada" });
    expect(await screen.findByText("Nenhum item com esses filtros", {}, ESPERA)).toBeInTheDocument();
    await usuario.click(screen.getByRole("button", { name: "Limpar filtros" }));
    await waitFor(() => expect(buscaAtual(roteador)).toEqual({}));
  });
});
