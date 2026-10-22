import { screen, within } from "@testing-library/react";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import type { DecisaoDTO } from "@zentrade/contratos/esquemas";
import { describe, expect, it } from "vitest";
import type { Fonte } from "../../api/fonte";
import { criarFonteDemo } from "../../demo/fonteDemo";
import { renderizar } from "../../teste/renderizar";
import { DecisaoPorDentro } from "./DecisaoPorDentro";

async function abrir(id: string, mudar: (d: DecisaoDTO) => DecisaoDTO = (d) => d, fonteBase?: Fonte) {
  const base = fonteBase ?? criarFonteDemo({ latenciaMs: [0, 0] });
  const fonte: Fonte = { ...base, decisao: async (x) => mudar(await base.decisao(x)) };
  const raiz = createRootRoute();
  const rota = createRoute({
    getParentRoute: () => raiz,
    path: "/decisoes/$id",
    component: DecisaoPorDentro,
  });
  const roteador = createRouter({
    routeTree: raiz.addChildren([rota]),
    history: createMemoryHistory({ initialEntries: [`/decisoes/${id}`] }),
  });
  return { ...renderizar(<RouterProvider router={roteador} />, fonte), fonte };
}

describe("Decisão por dentro", () => {
  it("conta a decisão em seis partes, na ordem em que aconteceu", async () => {
    await abrir("d-01");
    await screen.findByRole("region", { name: /Quando/ });
    const titulos = screen
      .getAllByRole("heading", { level: 2 })
      .map((h) => h.textContent?.replace(/^\d+/, ""));
    expect(titulos).toEqual([
      "Quando",
      "O que a regra viu",
      "Cenário de mercado naquele momento",
      "O que o Claude pensou",
      "Risco",
      "Resultado",
    ]);
  });

  it("quando: data e hora no fuso da instância", async () => {
    await abrir("d-01");
    const quando = await screen.findByRole("region", { name: /Quando/ });
    expect(within(quando).getByText(/no fuso da instância/)).toBeInTheDocument();
    expect(within(quando).getByText("BTCUSDT · velas de 1h")).toBeInTheDocument();
  });

  it("o que a regra viu: cada condição com ✓ ou ✗ e os valores", async () => {
    await abrir("d-01");
    const regra = await screen.findByRole("region", { name: /O que a regra viu/ });
    const lista = within(regra).getByRole("list", { name: "Condições da regra naquele momento" });
    expect(within(lista).getByText(/RSI\(14\) \(28,4\) < 30/)).toBeInTheDocument();
    expect(within(lista).getAllByText(/Verdadeira:/)).toHaveLength(3);
  });

  it("cenário de mercado naquele momento, com a frase e os números", async () => {
    await abrir("d-01");
    const cenario = await screen.findByRole("region", { name: /Cenário de mercado/ });
    expect(within(cenario).getByText(/3,7% acima da média de 200 velas/)).toBeInTheDocument();
    expect(within(cenario).getByText("Preço × média de 200")).toBeInTheDocument();
  });

  it("os três futuros lado a lado, qual favoreceu a decisão e por que os outros não", async () => {
    await abrir("d-01");
    const claude = await screen.findByRole("region", { name: /O que o Claude pensou/ });
    const futuros = within(claude).getByRole("list", { name: "Os três futuros que o Claude pesou" });
    const itens = within(futuros).getAllByRole("listitem");
    expect(itens).toHaveLength(3);
    expect(within(itens[0]!).getByText("Favoreceu a entrada")).toBeInTheDocument();
    expect(within(itens[0]!).getByText(/Passou do mínimo/)).toBeInTheDocument();
    expect(within(itens[1]!).getByText(/^Não decidiu:/)).toBeInTheDocument();
    expect(within(itens[2]!).getByText(/^Não decidiu:/)).toBeInTheDocument();
    for (const i of itens) {
      expect(within(i).getByText("Confirma se")).toBeInTheDocument();
      expect(within(i).getByText("Perde a validade se")).toBeInTheDocument();
      expect(within(i).getByText("Resultado estimado (líquido)")).toBeInTheDocument();
    }
    expect(within(claude).getByText("Os cenários sustentaram a entrada")).toBeInTheDocument();
    expect(within(claude).getByText("Principal argumento contra")).toBeInTheDocument();
    expect(within(claude).getByText(/Valor esperado = soma de probabilidade/)).toBeInTheDocument();
  });

  it("decisão barrada pela confiança: o veredito diz o motivo e o risco mostra a barreira", async () => {
    await abrir("d-02");
    const claude = await screen.findByRole("region", { name: /O que o Claude pensou/ });
    expect(
      within(claude).getByText(/o Claude propôs|barrou|aguardar|vetou/i, { selector: ".veredito__titulo" }),
    ).toBeInTheDocument();
    const risco = screen.getByRole("region", { name: /Risco/ });
    expect(within(risco).getByText(/abaixo do mínimo do robô/)).toBeInTheDocument();
  });

  it("Claude desligado no robô: diz isso com clareza e não finge análise", async () => {
    await abrir("d-01", (d) => {
      const { proposta: _p, custoIaUsd: _c, ...resto } = d;
      return { ...resto, roboId: "r-bnb" };
    });
    const claude = await screen.findByRole("region", { name: /O que o Claude pensou/ });
    expect(within(claude).getByText("O Claude estava desligado neste robô.")).toBeInTheDocument();
    expect(within(claude).queryByRole("list", { name: /três futuros/ })).toBeNull();
  });

  it("decisão antiga, sem cenário nem condições: avisa em vez de inventar", async () => {
    await abrir("d-01", (d) => {
      const { regime: _r, condicoes: _c, ...resto } = d;
      return resto;
    });
    expect(await screen.findByText(/anterior ao registro condição por condição/)).toBeInTheDocument();
    expect(screen.getByText(/só passou a ser guardado junto da decisão/)).toBeInTheDocument();
  });

  it("resultado: o desfecho e o placar do Claude quando existem", async () => {
    await abrir("d-04");
    const r = await screen.findByRole("region", { name: /Resultado/ });
    expect(within(r).getByText(/A ida e volta fechou com|Ainda sem desfecho/)).toBeInTheDocument();
  });

  it("decisão que não existe mais: erro com saída", async () => {
    await abrir("nao-existe");
    expect(await screen.findByText(/não existe mais/i)).toBeInTheDocument();
  });

  it("decisão que aguarda você mantém os botões de aprovar e recusar no fim", async () => {
    await abrir("d-01");
    expect(await screen.findByRole("button", { name: "Aprovar" })).toBeInTheDocument();
  });
});
