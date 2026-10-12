import { dec } from "@zentrade/dominio";
import { describe, expect, it } from "vitest";
import { serie } from "../teste/candles.js";
import { curvaBuyHold } from "./buy-hold.js";
import { SEM_CUSTOS } from "./custos.js";

describe("buy and hold do mesmo par e período", () => {
  it("sem custos: o patrimônio acompanha o preço desde a primeira abertura", () => {
    const r = curvaBuyHold(serie(0, [100, 110, 90, 120]), dec(1000), SEM_CUSTOS);
    expect(r.curva.map((p) => p.patrimonio.toFixed())).toEqual(["1000", "1100", "900", "1200"]);
    expect(r.curva[1]?.em).toBe(2 * 60_000 - 1);
    expect(r.final.toFixed()).toBe("1200");
  });

  it("com custos: paga taxa e deslizamento na compra e na venda final (feito à mão)", () => {
    // f = 10 bps, taxa 0,1%: q = 1000 / (100 × 1,001 × 1,001) = 9,98003…
    // final = q × 110 × 0,999 × 0,999
    const custos = { taxaPorLado: 0.001, deslizamentoBps: 8, meioSpreadBps: 2 };
    const r = curvaBuyHold(serie(0, [100, 110]), dec(1000), custos);
    const q = 1000 / (100 * 1.001 * 1.001);
    expect(r.curva[0]?.patrimonio.toNumber()).toBeCloseTo(q * 100, 9);
    expect(r.final.toNumber()).toBeCloseTo(q * 110 * 0.999 * 0.999, 9);
  });

  it("sem candles: nada comprado, saldo intacto", () => {
    expect(curvaBuyHold([], dec(1000), SEM_CUSTOS)).toEqual({ curva: [], final: dec(1000) });
  });
});
