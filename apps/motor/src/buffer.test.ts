import { describe, expect, it } from "vitest";
import { BufferCandles } from "./buffer.js";
import { candle } from "./teste/candles.js";

describe("buffer circular de candles", () => {
  it("guarda os últimos N em ordem, descartando os mais antigos", () => {
    const b = new BufferCandles(3);
    [1, 2, 3, 4, 5].forEach((i) => b.adicionar(candle(i * 60_000, 100 + i)));
    expect(b.lista().map((c) => c.abertura)).toEqual([180_000, 240_000, 300_000]);
    expect(b.fechamentos()).toEqual([103, 104, 105]);
    expect(b.tamanho).toBe(3);
    expect(b.ultimo()?.abertura).toBe(300_000);
  });

  it("recusa candle repetido ou mais velho que o último (o mesmo candle não decide duas vezes)", () => {
    const b = new BufferCandles(10);
    expect(b.adicionar(candle(60_000, 100))).toBe(true);
    expect(b.adicionar(candle(60_000, 100))).toBe(false);
    expect(b.adicionar(candle(0, 99))).toBe(false);
    expect(b.tamanho).toBe(1);
  });

  it("entrega o contexto completo (OHLCV) alinhado, para as regras com máxima, mínima e volume", () => {
    const b = new BufferCandles(3);
    [1, 2].forEach((i) => b.adicionar(candle(i * 60_000, 100 + i)));
    const ctx = b.contexto();
    expect(ctx.fechamentos).toEqual(b.fechamentos());
    expect(ctx.maximas).toHaveLength(2);
    expect(ctx.minimas).toHaveLength(2);
    expect(ctx.aberturas).toHaveLength(2);
    expect(ctx.volumes).toHaveLength(2);
  });

  it("vazio não tem último; capacidade precisa ser positiva", () => {
    expect(new BufferCandles(2).ultimo()).toBeUndefined();
    expect(new BufferCandles(2).lista()).toEqual([]);
    expect(() => new BufferCandles(0)).toThrow(/capacidade/);
  });
});
