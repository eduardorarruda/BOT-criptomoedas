import { describe, expect, it } from "vitest";
import { avaliar, contextoDeCandles, type Regra } from "@zentrade/dominio";
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
    [1, 2, 3, 4].forEach((i) =>
      b.adicionar(candle(i * 60_000, 100 + i, 60_000, { minima: String(99 + i), maxima: String(102 + i) })),
    );
    expect(b.contexto()).toEqual(contextoDeCandles(b.lista()));
    expect(b.contexto().maximas).toEqual([104, 105, 106]);
  });

  it("vazio não tem último; capacidade precisa ser positiva", () => {
    expect(new BufferCandles(2).ultimo()).toBeUndefined();
    expect(new BufferCandles(2).lista()).toEqual([]);
    expect(() => new BufferCandles(0)).toThrow(/capacidade/);
  });

  it("o robô ao vivo e o backtest avaliam a regra de horário igual: o contexto leva o fuso da instância", () => {
    // 15:00 UTC = 12:00 em Brasília = 11:00 em Nova York (UTC−4 em outubro)
    const abertura = Date.UTC(2026, 9, 20, 15, 0);
    const janela: Regra = { tipo: "horario", de: "12:00", ate: "13:00" };
    const doRobo = (fuso?: string) => {
      const b = new BufferCandles(3, fuso);
      b.adicionar(candle(abertura, 100, 300_000));
      return b.contexto();
    };
    const doBacktest = (fuso?: string) => contextoDeCandles([candle(abertura, 100, 300_000)], fuso);
    for (const fuso of [undefined, "America/Sao_Paulo", "America/New_York"]) {
      expect(doRobo(fuso)).toEqual(doBacktest(fuso));
      expect(avaliar(janela, doRobo(fuso)).valor).toBe(avaliar(janela, doBacktest(fuso)).valor);
    }
    expect(avaliar(janela, doRobo()).valor).toBe(true);
    expect(avaliar(janela, doRobo("America/New_York")).valor).toBe(false);
  });
});
