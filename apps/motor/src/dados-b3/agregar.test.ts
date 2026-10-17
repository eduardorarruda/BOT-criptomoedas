import { dec, type Candle } from "@zentrade/dominio";
import { describe, expect, it } from "vitest";
import { agregar } from "./agregar.js";

const M5 = 300_000;
const BASE = Date.UTC(2026, 6, 1, 13, 0); // 10:00 em Brasília

const k = (i: number, o: number, h: number, l: number, c: number, v = 10): Candle => ({
  abertura: BASE + i * M5,
  fechamento: BASE + (i + 1) * M5 - 1,
  abre: dec(o),
  maxima: dec(h),
  minima: dec(l),
  fecha: dec(c),
  volume: dec(v),
});

const texto = (c: Candle) => ({
  abertura: c.abertura,
  fechamento: c.fechamento,
  abre: c.abre.toString(),
  maxima: c.maxima.toString(),
  minima: c.minima.toString(),
  fecha: c.fecha.toString(),
  volume: c.volume.toString(),
});

describe("agregação de candles", () => {
  it("5m → 15m: abertura do primeiro, máxima e mínima do grupo, fechamento do último, volume somado", () => {
    const cincos = [k(0, 100, 110, 95, 105, 1), k(1, 105, 120, 100, 115, 2), k(2, 115, 118, 90, 92, 3)];
    expect(agregar(cincos, "5m", "15m").map(texto)).toEqual([
      {
        abertura: BASE,
        fechamento: BASE + 3 * M5 - 1,
        abre: "100",
        maxima: "120",
        minima: "90",
        fecha: "92",
        volume: "6",
      },
    ]);
  });

  it("5m → 1h com 12 candles por hora; a ordem de entrada não importa", () => {
    const cincos = Array.from({ length: 24 }, (_, i) => k(i, 100 + i, 101 + i, 99 + i, 100.5 + i));
    const horas = agregar([...cincos].reverse(), "5m", "1h");
    expect(horas).toHaveLength(2);
    expect(horas[0]?.abre.toString()).toBe("100");
    expect(horas[0]?.fecha.toString()).toBe("111.5");
    expect(horas[1]?.abertura).toBe(BASE + 12 * M5);
    expect(horas[1]?.fechamento).toBe(BASE + 24 * M5 - 1);
    expect(horas[1]?.maxima.toString()).toBe("124");
    expect(horas[1]?.volume.toString()).toBe("120");
  });

  it("15m → 1h encadeado dá o mesmo que 5m → 1h direto", () => {
    const cincos = Array.from({ length: 36 }, (_, i) =>
      k(i, 100 + (i % 7), 108 + (i % 5), 95 - (i % 3), 101),
    );
    const direto = agregar(cincos, "5m", "1h");
    const encadeado = agregar(agregar(cincos, "5m", "15m"), "15m", "1h");
    expect(encadeado.map(texto)).toEqual(direto.map(texto));
  });

  it("buraco no meio não vira candle inventado: o grupo sai só com o que existe", () => {
    const cincos = [k(0, 100, 101, 99, 100), k(2, 100, 103, 99, 102), k(6, 102, 104, 101, 103)];
    const quinzes = agregar(cincos, "5m", "15m");
    expect(quinzes.map((c) => c.abertura)).toEqual([BASE, BASE + 6 * M5]);
    expect(quinzes[0]?.fecha.toString()).toBe("102");
  });

  it("candle repetido (mesma abertura) conta uma vez só, o último lido", () => {
    const cincos = [k(0, 100, 101, 99, 100, 5), k(0, 100, 105, 99, 104, 7), k(1, 104, 106, 103, 105, 1)];
    const [q] = agregar(cincos, "5m", "15m");
    expect(q?.maxima.toString()).toBe("106");
    expect(q?.volume.toString()).toBe("8");
  });

  it("recusa agregar para um intervalo menor ou que não é múltiplo", () => {
    expect(() => agregar([], "15m", "5m")).toThrow(/não dá para montar/);
    expect(() => agregar([], "1h", "1h")).toThrow(/não dá para montar/);
    expect(agregar([], "5m", "1h")).toEqual([]);
  });
});
