import type { Carteira as CarteiraDTO, StatusBinance } from "@zentrade/contratos/esquemas";
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from "@tanstack/react-router";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ErroApi } from "../../api/erros";
import { criarFonteDemo } from "../../demo/fonteDemo";
import { renderizar } from "../../teste/renderizar";
import { Carteira } from "./Carteira";
import { ativoDemo, carteiraDemo, statusDemo } from "./demo";
import { criarFonteCarteiraDemo, type FonteCarteira } from "./fonte";
import { ContextoFonteCarteira } from "./ganchos";

const DESCONECTADA: CarteiraDTO = {
  ...carteiraDemo(),
  conectada: false,
  rede: null,
  redes: [],
  moedas: [],
  avisos: [],
};

function montar(sobrescrever: Partial<FonteCarteira> = {}) {
  const fonte: FonteCarteira = { ...criarFonteCarteiraDemo(), ...sobrescrever };
  const raiz = createRootRoute({
    component: () => (
      <ContextoFonteCarteira.Provider value={fonte}>
        <Carteira />
      </ContextoFonteCarteira.Provider>
    ),
  });
  const roteador = createRouter({ routeTree: raiz, history: createMemoryHistory({ initialEntries: ["/"] }) });
  renderizar(<RouterProvider router={roteador} />, criarFonteDemo({ latenciaMs: [0, 0] }));
  return fonte;
}

describe("tela Carteira", () => {
  it("sem conta: explica que uma chave só de leitura basta e leva ao cadastro", async () => {
    montar({ carteira: async () => DESCONECTADA });
    expect(await screen.findByText("Nenhuma conta da Binance conectada")).toBeInTheDocument();
    expect(screen.getByText(/só de leitura/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Cadastrar uma chave" })).toHaveAttribute("href", "/contas");
    expect(screen.queryByRole("button", { name: /Sincronizar/ })).not.toBeInTheDocument();
  });

  it("de bater o olho: cartões, tabela com totais e o donut com a legenda em texto", async () => {
    montar();
    expect(await screen.findByText("Resultado líquido")).toBeInTheDocument();
    for (const t of ["Total investido", "Valor atual", "Resultado bruto", "Taxas pagas"])
      expect(screen.getAllByText(t).length).toBeGreaterThan(0);
    const tabela = screen.getByRole("table", { name: /Carteira por moeda/ });
    const linhas = within(tabela).getAllByRole("row");
    // Começa pela maior fatia da conta.
    expect(linhas[1]).toHaveTextContent("ETH");
    expect(within(tabela).getByText("Total")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /Alocação da conta: ETH/ })).toBeInTheDocument();
    // ETH tem saldo de depósito, sem negociação: a linha avisa.
    expect(within(linhas[1]!).getByLabelText("1 aviso(s)")).toBeInTheDocument();
  });

  it("ordena pela coluna clicada e diz a ordem ao leitor de tela", async () => {
    montar();
    const botao = await screen.findByRole("button", { name: "Moeda" });
    await userEvent.click(botao);
    expect(botao.closest("th")).toHaveAttribute("aria-sort", "ascending");
    const tabela = screen.getByRole("table", { name: /Carteira por moeda/ });
    expect(within(tabela).getAllByRole("row")[1]).toHaveTextContent("BTC");
    await userEvent.click(botao);
    expect(botao.closest("th")).toHaveAttribute("aria-sort", "descending");
    expect(within(tabela).getAllByRole("row")[1]).toHaveTextContent("USDT");
  });

  it("troca a parcela (robô × manual) sem sair da tela", async () => {
    montar();
    await screen.findByText("Resultado líquido");
    await userEvent.click(screen.getByRole("radio", { name: "Manual" }));
    expect(screen.getByRole("radio", { name: "Manual" })).toBeChecked();
  });

  it("sincronizar agora: mostra o estado e avisa o resultado", async () => {
    let concluir: () => void = () => undefined;
    const sincronizar = vi.fn(
      () =>
        new Promise<Awaited<ReturnType<FonteCarteira["sincronizar"]>>>((ok) => {
          concluir = () =>
            ok({
              rede: "testnet",
              em: 1,
              negociacoesNovas: 3,
              simbolos: [],
              saldos: 2,
              parcial: false,
              avisos: [],
            });
        }),
    );
    montar({ sincronizar });
    await userEvent.click(await screen.findByRole("button", { name: "Sincronizar agora" }));
    expect(await screen.findByRole("button", { name: "Sincronizando…" })).toBeDisabled();
    concluir();
    expect(await screen.findByText("Carteira sincronizada: 3 negociações novas.")).toBeInTheDocument();
    expect(sincronizar).toHaveBeenCalledWith("testnet");
  });

  it("erro na sincronização aparece com a mensagem da API", async () => {
    montar({
      sincronizar: async () => {
        throw new ErroApi("binance_limite", "Limite de requisições da Binance atingido.", 429);
      },
    });
    await userEvent.click(await screen.findByRole("button", { name: "Sincronizar agora" }));
    expect(await screen.findByText("Limite de requisições da Binance atingido.")).toBeInTheDocument();
  });

  it("detalhe da moeda: números por parcela e as negociações com a origem", async () => {
    montar({ ativo: async (a) => ativoDemo(a)! });
    await userEvent.click(await screen.findByRole("button", { name: /^BTC/ }));
    const dialogo = await screen.findByRole("dialog");
    expect(await within(dialogo).findByText("Negociações")).toBeInTheDocument();
    expect(within(dialogo).getAllByText("Robô").length).toBeGreaterThan(1);
    expect(within(dialogo).getByText("Preço médio")).toBeInTheDocument();
  });

  it("chave com permissão de saque: faixa de atenção com o caminho para trocar", async () => {
    const comSaque: StatusBinance = {
      contas: [
        {
          ...statusDemo().contas[0]!,
          rede: "real",
          podeSacar: true,
          permissoesLidas: true,
          avisos: ["Esta chave tem permissão de SAQUE. O ZenTrade nunca saca."],
        },
      ],
    };
    montar({ status: async () => comSaque });
    expect(await screen.findByText(/permissão de SAQUE/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Trocar a chave" })).toBeInTheDocument();
  });

  it("chave recusada pela Binance: diz qual conta e o motivo", async () => {
    const recusada: StatusBinance = {
      contas: [{ ...statusDemo().contas[0]!, conectada: false, erro: "Chave inválida (-2015)." }],
    };
    montar({ status: async () => recusada });
    await waitFor(() => expect(screen.getByText(/não aceitou a chave/)).toBeInTheDocument());
    expect(screen.getByText(/Chave inválida/)).toBeInTheDocument();
  });

  it("erro ao carregar a carteira: mensagem e tentar de novo", async () => {
    montar({
      carteira: async () => {
        throw new ErroApi("binance_indisponivel", "A Binance não respondeu.", 502);
      },
    });
    expect(await screen.findByText("A Binance não respondeu.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tentar de novo" })).toBeInTheDocument();
  });
});
