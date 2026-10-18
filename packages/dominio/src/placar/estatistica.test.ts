import { describe, expect, it } from "vitest";
import { brier, intervaloWilson } from "./estatistica.js";

describe("intervalo de Wilson (95%)", () => {
  it("8 acertos em 10: de 49% a 94% (a conta feita à mão)", () => {
    const i = intervaloWilson(8, 10);
    expect(i.inferior).toBeCloseTo(0.49016, 4);
    expect(i.superior).toBeCloseTo(0.94332, 4);
  });

  it("40 em 50 estreita o intervalo em torno de 80%", () => {
    const i = intervaloWilson(40, 50);
    expect(i.inferior).toBeCloseTo(0.66962, 4);
    expect(i.superior).toBeCloseTo(0.88757, 4);
  });

  it("nos extremos fica dentro de [0, 1]", () => {
    expect(intervaloWilson(0, 5).inferior).toBe(0);
    expect(intervaloWilson(5, 5).superior).toBeCloseTo(1, 12);
    expect(intervaloWilson(0, 0)).toEqual({ inferior: 0, superior: 1 });
  });

  it("recusa contagem sem sentido", () => {
    expect(() => intervaloWilson(3, 2)).toThrow(RangeError);
    expect(() => intervaloWilson(-1, 2)).toThrow(RangeError);
    expect(() => intervaloWilson(1.5, 2)).toThrow(RangeError);
  });
});

describe("Brier score", () => {
  it("média do quadrado da distância entre a confiança e o que aconteceu", () => {
    // (0,8 − 1)² = 0,04; (0,6 − 0)² = 0,36 → média 0,2
    expect(
      brier([
        { confianca: 0.8, acertou: true },
        { confianca: 0.6, acertou: false },
      ]),
    ).toBeCloseTo(0.2, 12);
  });

  it("perfeito é 0; chutar 50% dá 0,25; sem dados, null", () => {
    expect(brier([{ confianca: 1, acertou: true }])).toBe(0);
    expect(brier([{ confianca: 0.5, acertou: false }])).toBe(0.25);
    expect(brier([])).toBeNull();
  });
});
