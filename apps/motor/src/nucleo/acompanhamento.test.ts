import { dec, type Execucao } from "@zentrade/dominio";
import { describe, expect, it } from "vitest";
import { candle } from "../teste/candles.js";
import { candlesDesde, inicioDaPosicao } from "./acompanhamento.js";

const ex = (lado: Execucao["lado"], quantidade: string, em: number): Execucao => ({
  lado,
  preco: dec(100),
  quantidade: dec(quantidade),
  taxaCotacao: dec(0),
  em,
});

describe("início da posição aberta (para refazer o acompanhamento depois de um reinício)", () => {
  it("é a primeira compra depois da última vez que a posição zerou", () => {
    expect(inicioDaPosicao([])).toBeNull();
    expect(inicioDaPosicao([ex("COMPRA", "1", 10)])).toBe(10);
    expect(inicioDaPosicao([ex("COMPRA", "1", 10), ex("VENDA", "1", 20)])).toBeNull();
    expect(inicioDaPosicao([ex("COMPRA", "1", 10), ex("VENDA", "1", 20), ex("COMPRA", "2", 30)])).toBe(30);
    expect(inicioDaPosicao([ex("COMPRA", "1", 10), ex("VENDA", "0.4", 20)])).toBe(10);
  });

  it("conta só os candles que fecharam depois da entrada", () => {
    const candles = [candle(0, 1), candle(60_000, 1), candle(120_000, 1)];
    expect(candlesDesde(candles, 59_999)).toBe(2);
    expect(candlesDesde(candles, 200_000)).toBe(0);
  });
});
