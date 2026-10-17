import { describe, expect, it, vi } from "vitest";
import { PRAZO_TELA_MS, violacoesNaTela } from "../teste/acessibilidade";

vi.mock("lightweight-charts", () => import("../teste/graficoFalso"));

/** axe nas telas de uma instalação nova: "Comece aqui", 2FA e os estados vazios. */
describe("acessibilidade: primeira vez (exemplo vazio)", () => {
  it.each<[string, RegExp]>([
    ["/", /visão geral/i],
    ["/contas", /contas e chaves/i],
    ["/assistente/configuracoes", /configurações do assistente/i],
    ["/robos", /robôs/i],
    ["/estrategias", /estratégias/i],
    ["/backtests", /backtests/i],
    ["/decisoes", /decisões/i],
    ["/ordens", /ordens e posições/i],
    ["/aovivo", /ao vivo/i],
    ["/risco", /risco/i],
  ])(
    "%s sem violações",
    async (caminho, titulo) => expect(await violacoesNaTela(caminho, titulo, { vazio: true })).toEqual([]),
    PRAZO_TELA_MS,
  );
});
