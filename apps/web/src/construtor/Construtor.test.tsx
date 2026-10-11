import { validarRegra } from "@zentrade/dominio";
import { createEvent, fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { NovaEstrategia } from "../api/fonte";
import { criarFonteDemo } from "../demo/fonteDemo";
import { renderizar } from "../teste/renderizar";
import { Construtor } from "./Construtor";
import { estadoVazio } from "./estado";

function montar() {
  const aoSalvar = vi.fn<(id: string | null, e: NovaEstrategia) => void>();
  renderizar(
    <Construtor inicial={estadoVazio()} salvando={false} aoSalvar={aoSalvar} />,
    criarFonteDemo({ latenciaMs: [0, 0] }),
  );
  return { aoSalvar };
}

function transferencia() {
  const dados = new Map<string, string>();
  return {
    setData: (t: string, v: string) => dados.set(t, v),
    getData: (t: string) => dados.get(t) ?? "",
    clearData: () => dados.clear(),
    setDragImage: () => undefined,
    dropEffect: "none",
    effectAllowed: "all",
  };
}

const disparar = (el: HTMLElement, criar: (e: HTMLElement) => Event, dataTransfer: object) =>
  fireEvent(el, Object.assign(criar(el), { dataTransfer }));

describe("Construtor de estratégias", () => {
  it("monta pelo teclado uma árvore E/OU/NÃO válida e salva", async () => {
    const { aoSalvar } = montar();
    const usuario = userEvent.setup();
    const salvar = screen.getByRole("button", { name: "Criar estratégia" });
    expect(salvar).toBeDisabled();
    expect(screen.getByText(/Dê um nome à estratégia/)).toBeInTheDocument();

    await usuario.type(screen.getByLabelText("Nome da estratégia"), "Minha regra");
    const raiz = screen.getByRole("group", { name: "Adicionar ao grupo E" });
    await usuario.click(within(raiz).getByRole("button", { name: /Grupo OU/ }));
    const ou = screen.getByRole("group", { name: "Adicionar ao grupo OU" });
    await usuario.click(within(ou).getByRole("button", { name: /Condição/ }));
    await usuario.click(within(ou).getByRole("button", { name: /NÃO/ }));
    expect(screen.getByText(/NÃO" está vazio/)).toBeInTheDocument();
    const nao = screen.getByRole("group", { name: "Adicionar ao NÃO" });
    await usuario.click(within(nao).getByRole("button", { name: /Condição/ }));

    expect(screen.getByText(/Tudo certo/)).toBeInTheDocument();
    expect(salvar).toBeEnabled();
    await usuario.click(salvar);
    const [id, estrategia] = aoSalvar.mock.calls[0]!;
    expect(id).toBeNull();
    expect(estrategia.nome).toBe("Minha regra");
    expect(validarRegra(estrategia.entrada)).toEqual([]);
    expect(estrategia.entrada).toMatchObject({
      tipo: "e",
      regras: [
        { tipo: "comparar" },
        { tipo: "ou", regras: [{ tipo: "comparar" }, { tipo: "nao", regra: { tipo: "comparar" } }] },
      ],
    });
  });

  it("mostra a regra em palavras com os rótulos do domínio e atualiza ao editar", async () => {
    montar();
    const usuario = userEvent.setup();
    expect(screen.getByText(/RSI\(14\) abaixo de 30\./)).toBeInTheDocument();
    await usuario.selectOptions(screen.getByLabelText("Comparação"), ">");
    expect(screen.getByText(/RSI\(14\) acima de 30\./)).toBeInTheDocument();
    const valor = screen.getByLabelText("Lado direito: valor");
    await usuario.clear(valor);
    await usuario.type(valor, "70,5");
    expect(screen.getByText(/RSI\(14\) acima de 70,5\./)).toBeInTheDocument();
  });

  it("move, nega e remove condições pelos botões (alternativa ao arrastar)", async () => {
    montar();
    const usuario = userEvent.setup();
    const raiz = screen.getByRole("group", { name: "Adicionar ao grupo E" });
    await usuario.click(within(raiz).getByRole("button", { name: /Grupo OU/ }));
    await usuario.selectOptions(
      screen.getByLabelText(/Mover condição RSI\(14\) abaixo de 30 para outro grupo/),
      "Grupo E › Grupo OU",
    );
    expect(screen.getByText(/Compra quando/).parentElement).toHaveTextContent(
      "Compra quando RSI(14) abaixo de 30.",
    );
    await usuario.click(screen.getByRole("button", { name: /Negar condição RSI/ }));
    expect(screen.getByText(/não \(RSI\(14\) abaixo de 30\)/)).toBeInTheDocument();
    await usuario.click(screen.getByRole("button", { name: "Tirar o NÃO" }));
    await usuario.click(screen.getByRole("button", { name: /Remover condição RSI/ }));
    expect(screen.getAllByText(/grupo vazio/i).length).toBeGreaterThan(0);
  });

  it("aceita um bloco arrastado da paleta para a árvore", () => {
    montar();
    const dataTransfer = transferencia();
    const bloco = screen.getByText("Grupo OU", { selector: "strong" }).closest("li")!;
    disparar(bloco, createEvent.dragStart, dataTransfer);
    const [zona] = screen.getAllByText("Soltar aqui");
    disparar(zona!, createEvent.dragOver, dataTransfer);
    disparar(zona!, createEvent.drop, dataTransfer);
    expect(screen.getByRole("group", { name: "Adicionar ao grupo OU" })).toBeInTheDocument();
    expect(screen.queryByText("Soltar aqui")).toBeNull();
  });

  it("move uma condição arrastando pela alça", async () => {
    montar();
    const raiz = screen.getByRole("group", { name: "Adicionar ao grupo E" });
    await userEvent.click(within(raiz).getByRole("button", { name: /Grupo OU/ }));
    const dataTransfer = transferencia();
    const alca = document.querySelector<HTMLElement>(".no--comparar .no__alca")!;
    disparar(alca, createEvent.dragStart, dataTransfer);
    const ou = screen.getByRole("group", { name: "Adicionar ao grupo OU" }).closest<HTMLElement>(".no--ou")!;
    const zona = within(ou).getByText("Soltar aqui");
    disparar(zona, createEvent.dragOver, dataTransfer);
    disparar(zona, createEvent.drop, dataTransfer);
    expect(within(ou).getByLabelText("Comparação")).toBeInTheDocument();
  });
});
