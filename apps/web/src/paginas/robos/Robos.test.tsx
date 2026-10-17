import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { Fonte } from "../../api/fonte";
import { criarFonteDemo } from "../../demo/fonteDemo";
import { renderizarNaRota } from "../../teste/rota";
import { Robos } from "../Robos";

const ESPERA = { timeout: 10_000 };

async function logada(): Promise<Fonte> {
  const fonte = criarFonteDemo({ latenciaMs: [0, 0], primeiraAnaliseMs: 60_000 });
  await fonte.entrar({ email: "voce@exemplo.com", senha: "x", codigo2fa: "123456" });
  return fonte;
}

/** A API demora para responder: dá para ver o que a tela mostra enquanto espera. */
function lenta(fonte: Fonte): Fonte & { soltar: () => void } {
  let soltar: () => void = () => undefined;
  const espera = new Promise<void>((r) => {
    soltar = r;
  });
  return {
    ...fonte,
    atualizarRobo: async (id, m) => {
      await espera;
      return fonte.atualizarRobo(id, m);
    },
    soltar: () => soltar(),
  };
}

const cartao = async (nome: string) =>
  (await screen.findByRole("heading", { level: 2, name: nome }, ESPERA)).closest("li") as HTMLElement;

describe("Robôs: pausar e desfazer", () => {
  it("pausar aparece na hora, antes da resposta da API", async () => {
    const usuario = userEvent.setup();
    const fonte = lenta(await logada());
    renderizarNaRota(<Robos />, { fonte });
    const btc = await cartao("BTC paciente");
    await usuario.click(within(btc).getByRole("button", { name: "Pausar" }));
    expect(within(btc).getByText("Pausado")).toBeInTheDocument();
    fonte.soltar();
  });

  it("retomar espera a confirmação: continua pausado enquanto a API não responde", async () => {
    const usuario = userEvent.setup();
    const fonte = lenta(await logada());
    renderizarNaRota(<Robos />, { fonte });
    const bnb = await cartao("BNB em teste");
    await usuario.click(within(bnb).getByRole("button", { name: "Retomar" }));
    expect(within(bnb).getByText("Pausado")).toBeInTheDocument();
    expect(within(bnb).getByRole("button", { name: "Retomar" })).toHaveAttribute("aria-busy", "true");
    fonte.soltar();
    await waitFor(() => expect(within(bnb).queryByText("Pausado")).not.toBeInTheDocument());
  });

  it("o aviso de pausa tem Desfazer, que retoma o robô", async () => {
    const usuario = userEvent.setup();
    renderizarNaRota(<Robos />, { fonte: await logada() });
    const btc = await cartao("BTC paciente");
    await usuario.click(within(btc).getByRole("button", { name: "Pausar" }));
    await usuario.click(await screen.findByRole("button", { name: "Desfazer" }, ESPERA));
    expect(await within(btc).findByRole("button", { name: "Pausar" }, ESPERA)).toBeInTheDocument();
    expect(within(btc).queryByText("Pausado")).not.toBeInTheDocument();
  });

  it("sair do automático não oferece Desfazer (o automático só volta pelo diálogo)", async () => {
    const usuario = userEvent.setup();
    renderizarNaRota(<Robos />, { fonte: await logada() });
    const sol = await cartao("SOL rompimento");
    await usuario.click(within(sol).getByRole("radio", { name: "Observar" }));
    expect(await screen.findByText(/SOL rompimento agora está em Observar/, {}, ESPERA)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Desfazer" })).not.toBeInTheDocument();
  });
});
