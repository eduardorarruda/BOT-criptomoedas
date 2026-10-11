import { describe, expect, it, vi } from "vitest";
import { PRAZO_TELA_MS, violacoesNaTela } from "../teste/acessibilidade";

vi.mock("lightweight-charts", () => import("../teste/graficoFalso"));

/** axe nas telas de "Acompanhar" (dividido por grupo do menu para rodar em paralelo). */
describe("acessibilidade: Acompanhar", () => {
  it.each<[string, RegExp]>([
    ["/", /visão geral/i],
    ["/aovivo", /ao vivo/i],
    ["/aovivo?robo=r-sol", /ao vivo/i],
    ["/mercado", /mercado/i],
    ["/decisoes", /decisões/i],
    ["/ordens", /ordens/i],
    ["/patrimonio", /patrimônio/i],
  ])(
    "%s sem violações",
    async (caminho, titulo) => expect(await violacoesNaTela(caminho, titulo)).toEqual([]),
    PRAZO_TELA_MS,
  );
});
