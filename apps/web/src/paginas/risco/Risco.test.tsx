import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderizarNaRota } from "../../teste/rota";
import { Risco } from "../Risco";
import { criarFonteRiscoDemo, type FonteRisco } from "./fonte";
import { ContextoFonteRisco } from "./ganchos";

const AGORA = Date.UTC(2026, 9, 12, 15);

function montar(sobrescrever: Partial<FonteRisco> = {}) {
  const base = criarFonteRiscoDemo(() => AGORA);
  const fonte: FonteRisco = {
    ...base,
    salvarLimites: vi.fn(base.salvarLimites),
    liberar: vi.fn(base.liberar),
    aceitar: vi.fn(base.aceitar),
    reconciliar: vi.fn(base.reconciliar),
    marcarLidos: vi.fn(base.marcarLidos),
    ...sobrescrever,
  };
  renderizarNaRota(
    <ContextoFonteRisco.Provider value={fonte}>
      <Risco />
    </ContextoFonteRisco.Provider>,
  );
  return fonte;
}

/** A primeira renderização carrega a tela inteira (e os dados da demonstração): prazo folgado. */
const painel = async (titulo: string) =>
  (await screen.findByRole("heading", { level: 2, name: titulo }, { timeout: 10_000 })).closest(
    "section",
  ) as HTMLElement;

describe("tela Risco: conta, pausas, divergências, orçamento e avisos", () => {
  it("mostra as pausas com o motivo e quando acabam; liberar pede confirmação", async () => {
    const fonte = montar();
    const pausas = await painel("Pausas em vigor");
    expect(within(pausas).getByText("Sequência de stops (robô)")).toBeInTheDocument();
    expect(within(pausas).getAllByText(/Libera sozinha às/).length).toBeGreaterThan(0);
    expect(within(pausas).getByText(/Só depois de resolver a divergência/)).toBeInTheDocument();
    await userEvent.click(within(pausas).getByRole("button", { name: "Liberar agora" }));
    await userEvent.click(await screen.findByRole("button", { name: "Liberar compras" }));
    await waitFor(() => expect(fonte.liberar).toHaveBeenCalledOnce());
    await waitFor(() =>
      expect(within(pausas).queryByText("Sequência de stops (robô)")).not.toBeInTheDocument(),
    );
  });

  it("barras da conta por rede e do orçamento de IA", async () => {
    montar();
    const conta = await painel("Limites da conta agora");
    expect(within(conta).getAllByRole("meter").length).toBeGreaterThanOrEqual(5);
    // Duas redes (testnet e papel), cada uma com as próprias barras.
    const [testnet] = within(conta).getAllByRole("meter", { name: /Exposição somando os robôs/ });
    expect(testnet).toHaveAttribute("aria-valuenow", "59");
    const orcamento = await painel("Orçamento de IA");
    expect(within(orcamento).getByRole("meter", { name: "Gasto com IA no mês" })).toHaveAttribute(
      "aria-valuenow",
      "82",
    );
  });

  it("divergência: explica, confere de novo e aceita o saldo com confirmação", async () => {
    const fonte = montar();
    const div = await painel("Divergências com a corretora");
    expect(await within(div).findByText(/Falta 0,4 SOL/)).toBeInTheDocument();
    expect(within(div).getByText(/nada foi vendido nem comprado/)).toBeInTheDocument();
    expect(within(div).getByRole("link", { name: /ver ordens/ })).toHaveAttribute("href", "/ordens");
    await userEvent.click(within(div).getByRole("button", { name: "Conferir agora" }));
    await waitFor(() => expect(fonte.reconciliar).toHaveBeenCalledOnce());
    await userEvent.click(within(div).getByRole("button", { name: "Aceitar saldo da corretora" }));
    const dialogo = await screen.findByRole("dialog");
    expect(within(dialogo).getByText(/Nenhuma ordem é/)).toBeInTheDocument();
    await userEvent.click(within(dialogo).getByRole("button", { name: "Aceitar e ajustar a posição" }));
    await waitFor(() => expect(fonte.aceitar).toHaveBeenCalledWith("div-sol"));
    expect(await within(div).findByText("Saldo conferido")).toBeInTheDocument();
  });

  it("salva os limites lidos do formulário e aponta o campo errado", async () => {
    const fonte = montar();
    const form = await painel("Limites da conta");
    const perda = within(form).getByLabelText("Perda máxima do dia (US$)");
    await userEvent.clear(perda);
    await userEvent.type(perda, "120,5");
    const janela = within(form).getByLabelText("Janela da queda (horas)");
    await userEvent.clear(janela);
    await userEvent.type(janela, "0");
    await userEvent.click(within(form).getByRole("button", { name: "Salvar limites da conta" }));
    expect(await within(form).findByText(/inteiro de 1 a 720/)).toBeInTheDocument();
    expect(fonte.salvarLimites).not.toHaveBeenCalled();
    await userEvent.clear(janela);
    await userEvent.type(janela, "48");
    await userEvent.click(within(form).getByRole("button", { name: "Salvar limites da conta" }));
    await waitFor(() =>
      expect(fonte.salvarLimites).toHaveBeenCalledWith(
        expect.objectContaining({
          perdaDiariaMaxima: "120.5",
          quedaJanelaHoras: 48,
          orcamentoIaMensalUsd: "25",
        }),
      ),
    );
  });

  it("avisos: gravidade, novos e marcar como lidos", async () => {
    const fonte = montar();
    const avisos = await painel("Avisos");
    expect(await within(avisos).findByText("Saldo de SOL não bate com a corretora")).toBeInTheDocument();
    expect(within(avisos).getAllByText("Crítico").length).toBeGreaterThan(0);
    await userEvent.click(within(avisos).getByRole("button", { name: "Marcar como lidos" }));
    await waitFor(() => expect(fonte.marcarLidos).toHaveBeenCalledOnce());
    await waitFor(() =>
      expect(within(avisos).queryByRole("button", { name: "Marcar como lidos" })).not.toBeInTheDocument(),
    );
  });

  it("erro ao carregar a conta explica e deixa tentar de novo", async () => {
    montar({ situacao: () => Promise.reject(new Error("API fora")) });
    expect(await screen.findByRole("button", { name: /Tentar de novo/ })).toBeInTheDocument();
  });
});

describe("tela Risco: o estado vem antes da configuração", () => {
  it("avisos e divergências aparecem antes do formulário de limites da conta", async () => {
    montar();
    const avisos = await painel("Avisos");
    const divergencias = await painel("Divergências com a corretora");
    const formulario = await painel("Limites da conta");
    const antes = (a: Element, b: Element) =>
      Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(antes(divergencias, formulario)).toBe(true);
    expect(antes(avisos, formulario)).toBe(true);
  });
});
