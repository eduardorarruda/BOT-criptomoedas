import { waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PRAZO_TELA_MS, violacoesNaTela } from "../teste/acessibilidade";

vi.mock("lightweight-charts", () => import("../teste/graficoFalso"));

/** Abre o primeiro investimento pelo cartão (os ids do exemplo nascem a cada carga). */
async function abrirPrimeiroInvestimento(): Promise<RegExp> {
  await waitFor(() => expect(document.querySelector("a.imob-cartao")).not.toBeNull(), { timeout: 30_000 });
  const cartao = document.querySelector<HTMLAnchorElement>("a.imob-cartao");
  const nome = cartao?.querySelector(".imob-cartao__nome")?.textContent ?? "";
  if (!cartao || !nome) throw new Error("nenhum investimento no exemplo");
  await userEvent.click(cartao);
  return new RegExp(`^${nome.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i");
}

/** axe nas abas e telas de cadastro e simulação de renda fixa e imobiliário. */
describe("acessibilidade: cadastros e simuladores", () => {
  it.each<[string, RegExp]>([
    ["/renda-fixa?aba=conectar", /renda fixa/i],
    ["/renda-fixa?aba=cadastrar", /renda fixa/i],
    ["/renda-fixa?aba=simuladores", /renda fixa/i],
    ["/imobiliario/novo", /cadastrar investimento/i],
    ["/imobiliario/simuladores", /simuladores imobiliários/i],
    ["/imobiliario/id-que-nao-existe", /investimento imobiliário/i],
  ])(
    "%s sem violações",
    async (caminho, titulo) => expect(await violacoesNaTela(caminho, titulo)).toEqual([]),
    PRAZO_TELA_MS,
  );

  it(
    "/imobiliario/$id (um investimento do exemplo) sem violações",
    async () =>
      expect(
        await violacoesNaTela("/imobiliario", /imobiliário/i, { depois: abrirPrimeiroInvestimento }),
      ).toEqual([]),
    PRAZO_TELA_MS,
  );
});
