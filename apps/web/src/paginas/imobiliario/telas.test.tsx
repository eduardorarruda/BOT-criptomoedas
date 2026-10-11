import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { configure, fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import type { Fonte } from "../../api/fonte";
import { renderizar } from "../../teste/renderizar";
import { criarFonteImobiliarioDemo } from "./demo";
import { DetalheInvestimento } from "./DetalheInvestimento";
import type { FonteImobiliario } from "./fonte";
import { ProvedorFonteImobiliario } from "./ganchos";
import { NovoInvestimento } from "./NovoInvestimento";
import { SimFii } from "./simuladores/SimFii";
import { SimFinanciamento } from "./simuladores/SimFinanciamento";
import { SimGanhoCapital } from "./simuladores/SimGanhoCapital";
import { VisaoImobiliario } from "./VisaoImobiliario";

// As contas da carteira de exemplo (financiamento de 360 meses, TIR) pesam sob carga: mais folga.
configure({ asyncUtilTimeout: 15_000 });
vi.setConfig({ testTimeout: 60_000 });

const fonteApp = { demo: false } as unknown as Fonte;

/** As telas usam <Link>: um roteador em memória só com a raiz basta para os testes. */
function comRoteador(ui: ReactElement) {
  const raiz = createRootRoute({ component: () => ui });
  const roteador = createRouter({ routeTree: raiz, history: createMemoryHistory({ initialEntries: ["/"] }) });
  return <RouterProvider router={roteador as never} />;
}

function montar(ui: ReactElement, fonte: FonteImobiliario) {
  return renderizar(
    <ProvedorFonteImobiliario fonte={fonte}>{comRoteador(ui)}</ProvedorFonteImobiliario>,
    fonteApp,
  );
}

/** Troca o valor de uma vez (digitar letra a letra refaria a conta a cada tecla). */
function trocar(rotulo: RegExp, valor: string) {
  fireEvent.change(screen.getByLabelText(rotulo), { target: { value: valor } });
}

describe("simuladores", () => {
  it(
    "financiamento: Price de 100 mil a 1% a.m. em 12 meses = R$ 8.884,88 (sem seguros)",
    { timeout: 60_000 },
    async () => {
      renderizar(<SimFinanciamento />, fonteApp);
      trocar(/Valor financiado/, "100.000");
      trocar(/Prazo/, "12");
      trocar(/Juros ao ano/, "12,682503013197");
      for (const r of [/Seguro sobre o saldo/, /Seguro fixo/, /Tarifa mensal/, /Custos na contratação/])
        trocar(r, "");
      await waitFor(() =>
        expect(screen.getByText(/Price — parcelas iguais/).parentElement).toHaveTextContent("R$ 8.884,88"),
      );
      expect(screen.getAllByRole("img", { name: /Saldo devedor/ }).length).toBeGreaterThan(0);
      expect(screen.getByText(/Premissas desta conta/)).toBeInTheDocument();
    },
  );

  it("financiamento: campo inválido vira explicação, não tela quebrada", async () => {
    renderizar(<SimFinanciamento />, fonteApp);
    trocar(/Prazo/, "0");
    expect(await screen.findByRole("alert")).toHaveTextContent(/Prazo/);
  });

  it("FII: 200 cotas a R$ 0,85 rendem R$ 170,00 por mês", async () => {
    renderizar(<SimFii />, fonteApp);
    const renda = await screen.findByText("Renda mensal");
    expect(renda.parentElement).toHaveTextContent("R$ 170,00");
    expect(screen.getByText("Cotas para a renda alvo").parentElement).toHaveTextContent("1.177");
  });

  it("venda e IR: mostra a tabela datada e as isenções como premissas", async () => {
    renderizar(<SimGanhoCapital />, fonteApp);
    expect(await screen.findByText(/conferida em 11\/10\/2026/)).toBeInTheDocument();
    expect(screen.getByText(/R\$ 440\.000,00/)).toBeInTheDocument();
    expect(screen.getByText("Imposto estimado").parentElement).toHaveTextContent("R$");
  });
});

describe("visão geral", () => {
  it("com a carteira de exemplo: patrimônio, alocação e um cartão por investimento", async () => {
    montar(<VisaoImobiliario />, criarFonteImobiliarioDemo("2026-10-11"));
    expect(await screen.findByText("Patrimônio imobiliário líquido")).toBeInTheDocument();
    expect(screen.getByText("Alocação por tipo")).toBeInTheDocument();
    const lista = screen.getByRole("region", { name: "Investimentos" });
    expect(within(lista).getAllByRole("link").length).toBeGreaterThanOrEqual(4);
  });

  it("vazia: explica o que fazer", async () => {
    const vazia = {
      visao: async () => ({
        dataBase: "2026-10-11",
        cdiAnual: null,
        patrimonio: "0",
        investido: "0",
        rendaMensal: "0",
        resultadoLiquido: "0",
        quantidade: 0,
        alocacao: [],
        itens: [],
      }),
    } as unknown as FonteImobiliario;
    montar(<VisaoImobiliario />, vazia);
    expect(await screen.findByText("Nenhum investimento imobiliário ainda")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Usar os simuladores" })).toBeInTheDocument();
  });
});

describe("detalhe", () => {
  it("imóvel financiado: métricas, tabela, lançamentos e premissas; lança uma receita", async () => {
    const fonte = criarFonteImobiliarioDemo("2026-10-11");
    const apto = (await fonte.visao({})).itens.find((i) => i.investimento.financiamento)!.investimento;
    const raiz = createRootRoute();
    const rota = createRoute({
      getParentRoute: () => raiz,
      path: "/imobiliario/$id",
      component: DetalheInvestimento,
    });
    const roteador = createRouter({
      routeTree: raiz.addChildren([rota]),
      history: createMemoryHistory({ initialEntries: [`/imobiliario/${apto.id}`] }),
    });
    renderizar(
      <ProvedorFonteImobiliario fonte={fonte}>
        <RouterProvider router={roteador as never} />
      </ProvedorFonteImobiliario>,
      fonteApp,
    );
    expect(await screen.findByRole("heading", { name: apto.nome })).toBeInTheDocument();
    expect(screen.getByText("Patrimônio líquido")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: /Financiamento SAC/ })).toBeInTheDocument();
    expect(screen.getByText(/Parcelas com vencimento até a data-base/)).toBeInTheDocument();

    const form = screen.getByRole("form", { name: "Novo lançamento" });
    await userEvent.click(within(form).getByRole("button", { name: "Lançar" }));
    expect(await within(form).findByText(/valor maior que zero/)).toBeInTheDocument();
    fireEvent.change(within(form).getByLabelText(/^Valor/), { target: { value: "2.730,00" } });
    await userEvent.click(within(form).getByRole("button", { name: "Lançar" }));
    await waitFor(async () =>
      expect((await fonte.detalhe(apto.id, {})).lancamentos.at(-1)?.valor).toBe("2730"),
    );
  });
});

describe("cadastro guiado", () => {
  it("escolhe o tipo, aponta os campos faltando e cadastra", async () => {
    const criar = vi.fn(async () => {
      throw new Error("não deveria navegar no teste");
    });
    const fonte = { ...criarFonteImobiliarioDemo("2026-10-11"), criar } as FonteImobiliario;
    montar(<NovoInvestimento />, fonte);
    await userEvent.click(await screen.findByRole("button", { name: /^Fundo imobiliário \(FII\)/ }));
    await userEvent.click(screen.getByRole("button", { name: "Cadastrar" }));
    expect(await screen.findByText("Confira os campos marcados.")).toBeInTheDocument();
    expect(criar).not.toHaveBeenCalled();

    await userEvent.type(screen.getByLabelText(/^Nome/), "Logística");
    await userEvent.type(screen.getByLabelText(/^Ticker/), "HGLG11");
    await userEvent.type(screen.getByLabelText(/^Data da compra/), "2026-01-05");
    await userEvent.type(screen.getByLabelText(/^Cotas compradas/), "10");
    await userEvent.type(screen.getByLabelText(/^Total pago/), "1.580,00");
    await userEvent.click(screen.getByRole("button", { name: "Cadastrar" }));
    await waitFor(() => expect(criar).toHaveBeenCalledOnce());
    expect(criar.mock.calls[0]).toEqual([
      expect.objectContaining({
        tipo: "fii",
        ticker: "HGLG11",
        lancamentosIniciais: [expect.objectContaining({ valor: "1580", quantidade: "10" })],
      }),
    ]);
  });
});
