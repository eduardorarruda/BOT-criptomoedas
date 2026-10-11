import { describe, expect, it, vi } from "vitest";
import { PRAZO_TELA_MS, violacoesNaTela } from "../teste/acessibilidade";

vi.mock("lightweight-charts", () => import("../teste/graficoFalso"));

/** axe nas telas de "Proteger" (dividido por grupo do menu para rodar em paralelo). */
describe("acessibilidade: Proteger", () => {
  it.each<[string, RegExp]>([
    ["/risco", /risco/i],
    ["/automacoes", /automações/i],
    ["/contas", /contas/i],
    ["/tokens", /tokens/i],
  ])(
    "%s sem violações",
    async (caminho, titulo) => expect(await violacoesNaTela(caminho, titulo)).toEqual([]),
    PRAZO_TELA_MS,
  );
});
