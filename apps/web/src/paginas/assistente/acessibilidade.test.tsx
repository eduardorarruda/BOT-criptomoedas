import { describe, expect, it, vi } from "vitest";
import { PRAZO_TELA_MS, violacoesNaTela } from "../../teste/acessibilidade";

vi.mock("lightweight-charts", () => import("../../teste/graficoFalso"));

/** axe no assistente dentro da aplicação inteira (modo de demonstração, com conversas de exemplo). */
describe("acessibilidade: Assistente", () => {
  it.each<[string, RegExp]>([
    ["/assistente", /^assistente$/i],
    ["/assistente?conversa=exemplo-carteira", /carteira cripto/i],
    ["/assistente/configuracoes", /configurações do assistente/i],
  ])(
    "%s sem violações",
    async (caminho, titulo) => expect(await violacoesNaTela(caminho, titulo)).toEqual([]),
    PRAZO_TELA_MS,
  );
});
