import type { Patrimonio as PatrimonioDTO } from "@zentrade/contratos/esquemas";
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from "@tanstack/react-router";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { describe, expect, it, vi } from "vitest";
import { ErroApi } from "../../api/erros";
import { criarFonteDemo } from "../../demo/fonteDemo";
import { renderizar } from "../../teste/renderizar";
import { patrimonioDemo } from "./demo";
import type { FontePatrimonio } from "./fonte";
import { ContextoFontePatrimonio } from "./ganchos";
import { Patrimonio } from "./Patrimonio";

const AGORA = Date.now();
/** 1840,25 USDT × 5,43 = 9.992,56 + 48.210,37 + 312.400 (o demo). */
const TOTAL = "R$ 370.602,93";

function montar(patrimonio: FontePatrimonio["patrimonio"], caminho = "/") {
  const fonte: FontePatrimonio = { patrimonio };
  const raiz = createRootRoute({
    component: () => (
      <ContextoFontePatrimonio.Provider value={fonte}>
        <Patrimonio />
      </ContextoFontePatrimonio.Provider>
    ),
  });
  const roteador = createRouter({
    routeTree: raiz,
    history: createMemoryHistory({ initialEntries: [caminho] }),
  });
  return {
    ...renderizar(<RouterProvider router={roteador} />, criarFonteDemo({ latenciaMs: [0, 0] })),
    roteador,
  };
}

const VAZIO: PatrimonioDTO = {
  ...patrimonioDemo(AGORA),
  total: "0",
  cambio: null,
  avisos: [],
  classes: patrimonioDemo(AGORA).classes.map((c) => ({
    ...c,
    situacao: "vazia",
    valor: "0",
    investido: null,
    fracao: null,
    itens: 0,
    atualizadoEm: null,
    moedaOrigem: null,
  })),
};

function semCambio(): PatrimonioDTO {
  const p = patrimonioDemo(AGORA);
  const [cripto, ...resto] = p.classes;
  return {
    ...p,
    parcial: true,
    cambio: null,
    total: "360610.37",
    classes: [
      {
        ...cripto!,
        situacao: "indisponivel",
        valor: null,
        fracao: null,
        avisos: ["Sem cotação USDT/BRL na Binance agora: a cripto aparece só em USDT e fica fora do total."],
      },
      ...resto,
    ],
    avisos: ["O total não inclui tudo: veja o aviso de cada classe."],
  };
}

const OPCOES_AXE: axe.RunOptions = {
  rules: { "color-contrast": { enabled: false } },
  resultTypes: ["violations"],
};

describe("tela Patrimônio", () => {
  it("de bater o olho: total, composição com legenda em texto e um cartão por classe com link", async () => {
    montar(async () => patrimonioDemo(AGORA));
    expect(await screen.findByRole("heading", { level: 1, name: "Patrimônio" })).toBeInTheDocument();
    expect((await screen.findAllByText(TOTAL)).length).toBeGreaterThan(0);
    expect(
      screen.getByRole("img", {
        name: /Composição do patrimônio: Cripto 2,7%, Renda fixa 13,0%, Imobiliário 84,3%/,
      }),
    ).toBeInTheDocument();
    const cartoes = screen.getByRole("list", { name: "Classes do patrimônio" });
    expect(within(cartoes).getAllByRole("listitem")).toHaveLength(3);
    expect(screen.getByRole("link", { name: /Ver a carteira cripto/ })).toHaveAttribute("href", "/carteira");
    expect(screen.getByRole("link", { name: /Ver a renda fixa/ })).toHaveAttribute("href", "/renda-fixa");
    expect(screen.getByRole("link", { name: /Ver o imobiliário/ })).toHaveAttribute("href", "/imobiliario");
    expect(screen.getByText(/por USDT \(par USDTBRL/)).toHaveTextContent(/R\$ 5,43 por USDT/);
    expect(screen.getByText(/não é recomendação/)).toBeInTheDocument();
  });

  it("cripto sem câmbio: total marcado como parcial, valor em USDT e o motivo", async () => {
    montar(async () => semCambio());
    expect(await screen.findByText("Total parcial")).toBeInTheDocument();
    expect(screen.getByText("US$ 1.840,25 em USDT")).toBeInTheDocument();
    expect(screen.getByText(/Sem cotação USDT\/BRL/)).toBeInTheDocument();
    expect(screen.getByText("Fora do total")).toBeInTheDocument();
    expect(screen.queryByText(/por USDT/)).not.toBeInTheDocument();
  });

  it("nada cadastrado: explica e leva a cada tela de cadastro", async () => {
    montar(async () => VAZIO);
    expect(await screen.findByText("Nada para somar ainda")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Conectar a Binance" })).toHaveAttribute("href", "/contas");
    expect(screen.getByRole("link", { name: "Cadastrar renda fixa" })).toHaveAttribute("href", "/renda-fixa");
    expect(screen.getByRole("link", { name: "Cadastrar imóvel ou FII" })).toHaveAttribute(
      "href",
      "/imobiliario/novo",
    );
    expect(screen.queryByRole("img", { name: /Composição/ })).not.toBeInTheDocument();
  });

  it("erro ao carregar: mensagem da API e tentar de novo", async () => {
    const patrimonio = vi
      .fn<FontePatrimonio["patrimonio"]>()
      .mockRejectedValueOnce(new ErroApi("sem_conexao", "Sem conexão com a API.", 0))
      .mockResolvedValue(patrimonioDemo(AGORA));
    montar(patrimonio);
    expect(await screen.findByText("Sem conexão com a API.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Tentar de novo" }));
    expect((await screen.findAllByText(TOTAL)).length).toBeGreaterThan(0);
  });

  it("carregando: esqueleto com rótulo, sem número inventado", async () => {
    montar(() => new Promise(() => undefined));
    expect(await screen.findByRole("status", { name: "Carregando o patrimônio" })).toBeInTheDocument();
    expect(screen.queryByText(/R\$/)).not.toBeInTheDocument();
  });

  it("só informa: nenhum conselho em nenhum estado da tela", async () => {
    const { container } = montar(async () => semCambio());
    await screen.findByText("Total parcial");
    expect(container.textContent).not.toMatch(/você deveria|recomendamos|sugerimos|aconselh/i);
  });

  it.each<[string, () => PatrimonioDTO, string]>([
    ["completo", () => patrimonioDemo(AGORA), "Total em reais"],
    ["parcial", semCambio, "Total parcial"],
    ["vazio", () => VAZIO, "Nada para somar ainda"],
  ])("acessível (axe) no estado %s", async (_estado, dados, marco) => {
    const { container } = montar(async () => dados());
    await screen.findByText(marco);
    const r = await axe.run(container, OPCOES_AXE);
    expect(r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.html).join(" | ")}`)).toEqual([]);
  });

  it("escolher o que somar: total, fatias e cartões seguem a escolha (e a URL)", async () => {
    const { roteador } = montar(async () => patrimonioDemo(AGORA));
    expect((await screen.findAllByText(TOTAL)).length).toBeGreaterThan(0);
    await userEvent.click(screen.getByRole("checkbox", { name: "Renda fixa" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Cripto" }));
    await waitFor(() =>
      expect((roteador.state.location.search as Record<string, unknown>).classes).toBe("cripto,renda_fixa"),
    );
    // 9.992,56 + 48.210,37
    expect((await screen.findAllByText("R$ 58.202,93")).length).toBeGreaterThan(0);
    expect(screen.getByText(/Soma de cripto \+ renda fixa/)).toBeInTheDocument();
    const imob = screen.getByRole("listitem", { name: "Imobiliário" });
    expect(within(imob).getByText("Fora desta soma")).toBeInTheDocument();
  });

  it("visão em tabela pela URL, com valor − investido", async () => {
    montar(async () => patrimonioDemo(AGORA), "/?visao=tabela");
    const tabela = await screen.findByRole("table", { name: /Classes do patrimônio/ });
    expect(within(tabela).getAllByRole("row")).toHaveLength(4);
    expect(within(tabela).getByText("+R$ 3.210,37")).toBeInTheDocument();
  });
});
