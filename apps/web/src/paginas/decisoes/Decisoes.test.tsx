import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { buscaAtual, renderizarNaRota } from "../../teste/rota";
import { Decisoes } from "../Decisoes";

const ESPERA = { timeout: 10_000 };

describe("tela Decisões com filtros", () => {
  it("abre pelo link já filtrada, com os totais do recorte", async () => {
    renderizarNaRota(<Decisoes />, { caminho: "/decisoes?robo=r-sol&estado=executada" });
    expect(await screen.findByRole("checkbox", { name: /SOL rompimento/ }, ESPERA)).toBeChecked();
    expect(await screen.findByLabelText(/Totais das decisões filtradas/, {}, ESPERA)).toHaveTextContent(
      /Executadas/,
    );
    expect(screen.getByRole("checkbox", { name: /Executada/ })).toBeChecked();
    const cartoes = screen.getAllByRole("article");
    expect(cartoes.length).toBeGreaterThan(0);
    for (const c of cartoes) {
      expect(c).toHaveTextContent("SOL rompimento");
      expect(c).toHaveTextContent("Executada");
    }
  });

  it("tabela, ordem e página vão para a URL; a linha abre o cartão", async () => {
    const usuario = userEvent.setup();
    const { roteador } = renderizarNaRota(<Decisoes />, { caminho: "/decisoes" });
    await usuario.click(await screen.findByRole("radio", { name: "Tabela" }, ESPERA));
    await waitFor(() => expect(buscaAtual(roteador).visao).toBe("tabela"));
    const tabela = await screen.findByRole("table", { name: /Decisões filtradas/ });
    const [primeira] = within(tabela).getAllByRole("button", { expanded: false });
    await usuario.click(primeira!);
    expect(primeira).toHaveAttribute("aria-expanded", "true");
    expect(within(tabela).getByText(/Por que o sinal disparou/i)).toBeInTheDocument();
    await usuario.selectOptions(screen.getByRole("combobox", { name: "Ordenar" }), "custo");
    await waitFor(() => expect(buscaAtual(roteador).ordem).toBe("custo"));
  });

  it("pagina quando passa de 20 cartões", async () => {
    const usuario = userEvent.setup();
    const { roteador } = renderizarNaRota(<Decisoes />, { caminho: "/decisoes" });
    const paginas = await screen.findByRole("navigation", { name: "Páginas de decisões" }, ESPERA);
    expect(screen.getAllByRole("article")).toHaveLength(20);
    await usuario.click(within(paginas).getByRole("button", { name: /Próxima/ }));
    await waitFor(() => expect(buscaAtual(roteador).pagina).toBe(2));
    // Mudar um filtro volta para a página 1.
    await usuario.click(screen.getByRole("radio", { name: "30 dias" }));
    await waitFor(() => expect(buscaAtual(roteador)).toEqual({ periodo: "30d" }));
  });

  it("filtro que esconde tudo mostra o porquê e o caminho de volta", async () => {
    const usuario = userEvent.setup();
    const { roteador } = renderizarNaRota(<Decisoes />, {
      caminho: "/decisoes?q=nada-disso-existe&visao=tabela",
    });
    expect(await screen.findByText("Nenhum item com esses filtros", {}, ESPERA)).toBeInTheDocument();
    await usuario.click(screen.getByRole("button", { name: "Limpar filtros" }));
    await waitFor(() => expect(buscaAtual(roteador)).toEqual({ visao: "tabela" }));
  });
});
