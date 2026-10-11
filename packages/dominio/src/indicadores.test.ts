import { describe, expect, it } from "vitest";
import { ema, rsi, sma } from "./indicadores.js";

describe("indicadores", () => {
  const v = [1, 2, 3, 4, 5, 6];

  it("média simples do fim da série e de candles atrás", () => {
    expect(sma(v, 3)).toBe(5);
    expect(sma(v, 3, 1)).toBe(4);
    expect(sma(v, 7)).toBeNull();
    expect(sma(v, 3, 4)).toBeNull();
  });

  it("média exponencial semeada pela média simples", () => {
    // semente = (1+2+3)/3 = 2; k = 0,5 → 3 → 4 → 5
    expect(ema([1, 2, 3, 4, 5, 6], 3)).toBeCloseTo(5, 10);
    expect(ema([1, 2], 3)).toBeNull();
  });

  it("RSI de Wilder: só altas dá 100, só quedas dá 0", () => {
    expect(rsi([1, 2, 3, 4, 5, 6], 3)).toBe(100);
    expect(rsi([6, 5, 4, 3, 2, 1], 3)).toBe(0);
    expect(rsi([1, 2], 3)).toBeNull();
  });

  it("RSI num caso misto conhecido", () => {
    // variações +1 e -1: médias de ganho e perda iguais → 50
    expect(rsi([10, 11, 10], 2)).toBeCloseTo(50, 10);
    // mais duas variações (+1, -1) pela suavização de Wilder: ganho 0,375, perda 0,625 → 37,5
    expect(rsi([10, 11, 10, 11, 10], 2)).toBeCloseTo(37.5, 10);
  });

  it("recusa período inválido", () => {
    expect(() => sma(v, 0)).toThrow(/período/);
    expect(() => ema(v, 1.5)).toThrow(/período/);
    expect(() => rsi(v, -1)).toThrow(/período/);
  });
});
