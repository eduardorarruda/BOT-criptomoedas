import { describe, expect, it } from "vitest";
import { ehSimboloB3, intervalosAcima, noPregaoB3 } from "./pregao.js";

/** Hora de Brasília (UTC−3 desde 2019) em ms UTC. */
const brt = (dia: number, hora: number, minuto = 0) => Date.UTC(2026, 6, dia, hora + 3, minuto);

describe("pregão da B3", () => {
  it("só WIN e WIN-IBOV são símbolos da B3", () => {
    expect(ehSimboloB3("WIN")).toBe(true);
    expect(ehSimboloB3("WIN-IBOV")).toBe(true);
    expect(ehSimboloB3("BTCUSDT")).toBe(false);
    expect(ehSimboloB3("win")).toBe(false);
  });

  it("aceita aberturas das 09:00 às 18:20 (o pregão de derivativos vai até 18:25)", () => {
    expect(noPregaoB3(brt(1, 9, 0))).toBe(true);
    expect(noPregaoB3(brt(1, 18, 20))).toBe(true);
    expect(noPregaoB3(brt(1, 18, 0))).toBe(true);
    expect(noPregaoB3(brt(1, 8, 55))).toBe(false);
    expect(noPregaoB3(brt(1, 18, 25))).toBe(false);
    expect(noPregaoB3(brt(1, 18, 30))).toBe(false);
  });

  it("recusa sábado e domingo", () => {
    expect(noPregaoB3(brt(4, 10, 0))).toBe(false); // sábado
    expect(noPregaoB3(brt(5, 10, 0))).toBe(false); // domingo
    expect(noPregaoB3(brt(6, 10, 0))).toBe(true); // segunda
  });

  it("usa o horário de Brasília, não o UTC: 21:30 UTC são 18:30 em Brasília", () => {
    expect(noPregaoB3(Date.UTC(2026, 6, 1, 21, 30))).toBe(false);
    expect(noPregaoB3(Date.UTC(2026, 6, 1, 12, 0))).toBe(true); // 09:00
  });

  it("antes de 2019, com horário de verão: 11:00 UTC era 09:00 em Brasília", () => {
    expect(noPregaoB3(Date.UTC(2018, 11, 10, 11, 0))).toBe(true);
    expect(noPregaoB3(Date.UTC(2018, 11, 10, 10, 55))).toBe(false);
  });

  it("intervalos maiores montados a partir de cada um", () => {
    expect(intervalosAcima("5m")).toEqual(["15m", "1h"]);
    expect(intervalosAcima("15m")).toEqual(["1h"]);
    expect(intervalosAcima("1h")).toEqual([]);
  });
});
