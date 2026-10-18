import { describe, expect, it } from "vitest";
import { detectarSimboloContinuoWin, ErroSimboloContinuoMt5 } from "./simbolo-continuo-mt5.js";

describe("detectarSimboloContinuoWin", () => {
  it("prefere o nome configurado, se ele existir entre os disponíveis", () => {
    expect(detectarSimboloContinuoWin(["WIN$N", "WINZ26", "WINM$"], "WINM$")).toBe("WINM$");
  });

  it("nome configurado que não existe: falha listando o que há", () => {
    expect(() => detectarSimboloContinuoWin(["WIN$N", "WINZ26"], "WIN_ERRADO")).toThrow(
      ErroSimboloContinuoMt5,
    );
  });

  it("sem configuração, tenta WIN$N, depois WIN$, depois WIN@, nessa ordem", () => {
    expect(detectarSimboloContinuoWin(["WINZ26", "WIN$N", "WIN$"])).toBe("WIN$N");
    expect(detectarSimboloContinuoWin(["WINZ26", "WIN$"])).toBe("WIN$");
    expect(detectarSimboloContinuoWin(["WINZ26", "WIN@"])).toBe("WIN@");
  });

  it("nenhum candidato conhecido: falha listando os símbolos WIN* que existem", () => {
    expect(() => detectarSimboloContinuoWin(["WINZ26", "WINF27"])).toThrow(/WINZ26, WINF27/);
  });
});
