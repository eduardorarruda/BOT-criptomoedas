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

  it("RSI(14) bate com o exemplo publicado da StockCharts (ChartSchool, planilha cs-rsi)", () => {
    // 33 fechamentos do exemplo e os 19 RSI publicados com 2 casas, a partir do 15º.
    const fechamentos = [
      44.3389, 44.0902, 44.1497, 43.6124, 44.3278, 44.8264, 45.0955, 45.4245, 45.8433, 46.0826, 45.8931,
      46.0328, 45.614, 46.282, 46.282, 46.0028, 46.0328, 46.4116, 46.2222, 45.6439, 46.2122, 46.2521, 45.7137,
      46.4515, 45.7835, 45.3548, 44.0288, 44.1783, 44.2181, 44.5672, 43.4205, 42.6628, 43.1314,
    ];
    const publicados = [
      70.53, 66.32, 66.55, 69.41, 66.36, 57.97, 62.93, 63.26, 56.06, 62.38, 54.71, 50.42, 39.99, 41.46, 41.87,
      45.46, 37.3, 33.08, 37.77,
    ];
    publicados.forEach((esperado, i) => {
      const deslocamento = publicados.length - 1 - i;
      expect(Math.abs(rsi(fechamentos, 14, deslocamento)! - esperado)).toBeLessThan(0.005);
    });
  });

  it("recusa período inválido", () => {
    expect(() => sma(v, 0)).toThrow(/período/);
    expect(() => ema(v, 1.5)).toThrow(/período/);
    expect(() => rsi(v, -1)).toThrow(/período/);
  });
});
