import { describe, expect, it, vi } from "vitest";
import { PRAZO_TELA_MS, violacoesNaTela } from "../teste/acessibilidade";

vi.mock("lightweight-charts", () => import("../teste/graficoFalso"));

/** axe nas telas fora do menu: entrar (sem sessão) e endereço que não existe. */
describe("acessibilidade: entrada e 404", () => {
  it(
    "/entrar sem violações",
    async () => expect(await violacoesNaTela("/entrar", /zentrade/i, { sessao: false })).toEqual([]),
    PRAZO_TELA_MS,
  );

  it(
    "endereço inexistente sem violações",
    async () => expect(await violacoesNaTela("/isto-nao-existe", /esta página não existe/i)).toEqual([]),
    PRAZO_TELA_MS,
  );
});
