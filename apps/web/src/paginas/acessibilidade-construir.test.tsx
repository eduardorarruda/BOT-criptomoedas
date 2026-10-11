import { describe, expect, it, vi } from "vitest";
import { PRAZO_TELA_MS, violacoesNaTela } from "../teste/acessibilidade";

vi.mock("lightweight-charts", () => import("../teste/graficoFalso"));

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
});
