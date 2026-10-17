import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { describe, expect, it, vi } from "vitest";
import type { Comando } from "./comandos";
import { Paleta } from "./Paleta";

function comandos() {
  const feito = vi.fn<(id: string) => void>();
  const lista: Comando[] = [
    { id: "visao", titulo: "Visão geral", grupo: "Ir para", atalho: "g v", executar: () => feito("visao") },
    { id: "robos", titulo: "Robôs", grupo: "Ir para", atalho: "g r", executar: () => feito("robos") },
    {
      id: "risco",
      titulo: "Risco",
      grupo: "Ir para",
      palavras: "parar tudo",
      executar: () => feito("risco"),
    },
    { id: "tema", titulo: "Mudar para o tema claro", grupo: "Ações", executar: () => feito("tema") },
  ];
  return { lista, feito };
}

function montar() {
  const { lista, feito } = comandos();
  const aoFechar = vi.fn();
  render(<Paleta aberta comandos={lista} aoFechar={aoFechar} />);
  return { feito, aoFechar };
}

describe("Paleta de comandos", () => {
  it("abre com o foco na busca e a primeira opção ativa", () => {
    montar();
    const busca = screen.getByRole("combobox", { name: /buscar comando/i });
    expect(busca).toHaveFocus();
    const ativa = busca.getAttribute("aria-activedescendant");
    expect(ativa).toBeTruthy();
    expect(document.getElementById(ativa ?? "")).toHaveTextContent("Visão geral");
  });

  it("digitar filtra (sem acento, por sinônimo) e Enter executa e fecha", async () => {
    const usuario = userEvent.setup();
    const { feito, aoFechar } = montar();
    await usuario.type(screen.getByRole("combobox"), "parar");
    expect(screen.getAllByRole("option")).toHaveLength(1);
    await usuario.keyboard("{Enter}");
    expect(feito).toHaveBeenCalledWith("risco");
    expect(aoFechar).toHaveBeenCalled();
  });

  it("setas mudam a opção ativa, e ela fica marcada", async () => {
    const usuario = userEvent.setup();
    const { feito } = montar();
    await usuario.keyboard("{ArrowDown}{ArrowDown}");
    const ativa = screen.getAllByRole("option").find((o) => o.getAttribute("aria-selected") === "true");
    expect(ativa).toHaveTextContent("Risco");
    await usuario.keyboard("{ArrowUp}{Enter}");
    expect(feito).toHaveBeenCalledWith("robos");
  });

  it("clicar numa opção executa", async () => {
    const usuario = userEvent.setup();
    const { feito } = montar();
    await usuario.click(screen.getByRole("option", { name: /mudar para o tema claro/i }));
    expect(feito).toHaveBeenCalledWith("tema");
  });

  it("sem resultado, diz o que buscou", async () => {
    const usuario = userEvent.setup();
    montar();
    await usuario.type(screen.getByRole("combobox"), "xyz");
    expect(screen.getByText(/nada com “xyz”/i)).toBeInTheDocument();
  });

  it("mostra os grupos e os atalhos", () => {
    montar();
    const ir = screen.getByRole("group", { name: "Ir para" });
    expect(within(ir).getByText("g r")).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Ações" })).toBeInTheDocument();
  });

  it("sem violações do axe", async () => {
    montar();
    const r = await axe.run(document.body, { rules: { "color-contrast": { enabled: false } } });
    expect(r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.html).join(" | ")}`)).toEqual([]);
  });
});
