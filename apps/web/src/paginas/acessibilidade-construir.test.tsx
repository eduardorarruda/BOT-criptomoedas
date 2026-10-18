import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PRAZO_TELA_MS, violacoesNaTela } from "../teste/acessibilidade";

vi.mock("lightweight-charts", () => import("../teste/graficoFalso"));

/** No construtor, escolhe "Os dois sentidos": aparecem as abas e o interruptor do lado vendido. */
async function escolherOsDoisSentidos(): Promise<RegExp> {
  await userEvent.click(await screen.findByRole("radio", { name: "Os dois sentidos" }, { timeout: 30_000 }));
  await screen.findByRole("radio", { name: "Entrada vendida (quando vender)" });
  return /estratégias/i;
}

/** axe nas telas de "Construir" (dividido por grupo do menu para rodar em paralelo). */
describe("acessibilidade: Construir", () => {
  it.each<[string, RegExp]>([
    ["/robos", /robôs/i],
    ["/estrategias", /estratégias/i],
    ["/backtests", /backtests/i],
    ["/conhecimento", /conhecimento/i],
  ])(
    "%s sem violações",
    async (caminho, titulo) => expect(await violacoesNaTela(caminho, titulo)).toEqual([]),
    PRAZO_TELA_MS,
  );

  it(
    "/estrategias com os dois sentidos (abas do lado vendido) sem violações",
    async () =>
      expect(
        await violacoesNaTela("/estrategias", /estratégias/i, { depois: escolherOsDoisSentidos }),
      ).toEqual([]),
    PRAZO_TELA_MS,
  );
});
