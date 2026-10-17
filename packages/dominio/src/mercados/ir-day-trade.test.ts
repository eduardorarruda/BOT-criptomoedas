import { describe, expect, it } from "vitest";
import { dec } from "../dinheiro.js";
import { apurarIrDayTrade, type ResultadoDoDia } from "./ir-day-trade.js";

const dia = (d: string, r: string | number): ResultadoDoDia => ({ dia: d, resultado: dec(r) });

describe("IR do day trade (estimativa: 20% do ganho líquido do mês, com prejuízo compensado)", () => {
  it("mês positivo sem prejuízo anterior: 20% do resultado; IRRF de 1% dos dias positivos", () => {
    const a = apurarIrDayTrade([dia("2026-03-02", 300), dia("2026-03-03", -100), dia("2026-03-04", 50)]);
    expect(a.meses).toHaveLength(1);
    const m = a.meses[0]!;
    expect(m.mes).toBe("2026-03");
    expect(m.resultado.toString()).toBe("250");
    expect(m.base.toString()).toBe("250");
    expect(m.ir.toString()).toBe("50");
    // dedo-duro: 1% de 300 e de 50 (dias positivos), só informativo
    expect(m.irrf.toString()).toBe("3.5");
    expect(a.irTotal.toString()).toBe("50");
    expect(a.irrfTotal.toString()).toBe("3.5");
    expect(a.prejuizoACompensar.toString()).toBe("0");
  });

  it("prejuízo de um mês abate o ganho dos seguintes, sem prazo (atravessa o ano)", () => {
    const a = apurarIrDayTrade([
      dia("2025-11-10", -400),
      dia("2025-12-10", 100),
      dia("2026-01-12", 500),
      dia("2026-02-12", 200),
    ]);
    const [nov, dez, jan, fev] = a.meses;
    expect(nov).toMatchObject({ mes: "2025-11" });
    expect(nov!.ir.toString()).toBe("0");
    expect(nov!.prejuizoDepois.toString()).toBe("400");
    // dezembro: 100 de ganho, todo compensado; sobra 300 de prejuízo
    expect(dez!.compensado.toString()).toBe("100");
    expect(dez!.base.toString()).toBe("0");
    expect(dez!.prejuizoDepois.toString()).toBe("300");
    // janeiro: 500 − 300 = 200 de base → R$ 40
    expect(jan!.prejuizoAntes.toString()).toBe("300");
    expect(jan!.base.toString()).toBe("200");
    expect(jan!.ir.toString()).toBe("40");
    expect(fev!.ir.toString()).toBe("40");
    expect(a.irTotal.toString()).toBe("80");
    expect(a.prejuizoACompensar.toString()).toBe("0");
  });

  it("alternar meses bons e ruins faz pagar antes de recuperar (o efeito da nota 03)", () => {
    const a = apurarIrDayTrade([dia("2026-01-05", 1000), dia("2026-02-05", -1000)]);
    expect(a.irTotal.toString()).toBe("200");
    expect(a.prejuizoACompensar.toString()).toBe("1000");
    // o líquido do período é zero, mas o imposto estimado foi R$ 200
    expect(a.meses.reduce((s, m) => s.plus(m.resultado), dec(0)).toString()).toBe("0");
  });

  it("dias fora de ordem e do mesmo dia somam; meses saem em ordem; IR em centavos", () => {
    const a = apurarIrDayTrade([dia("2026-05-20", "10.01"), dia("2026-04-02", 5), dia("2026-05-20", "0.03")]);
    expect(a.meses.map((m) => m.mes)).toEqual(["2026-04", "2026-05"]);
    expect(a.meses[1]!.resultado.toString()).toBe("10.04");
    // 20% de 10,04 = 2,008 → R$ 2,01
    expect(a.meses[1]!.ir.toString()).toBe("2.01");
    // IRRF por dia: o dia 20/05 somou 10,04 → 0,1004 → R$ 0,10
    expect(a.meses[1]!.irrf.toString()).toBe("0.1");
  });

  it("sem operações: nada a pagar", () => {
    expect(apurarIrDayTrade([])).toMatchObject({ meses: [] });
    expect(apurarIrDayTrade([]).irTotal.toString()).toBe("0");
  });

  it("propriedade: o IR nunca passa de 20% da soma dos meses positivos nem fica negativo", () => {
    for (let s = 1; s < 60; s++) {
      const dias = Array.from({ length: 30 }, (_, i) =>
        dia(`2026-${String(1 + ((i * s) % 12)).padStart(2, "0")}-10`, ((i * 37 * s) % 400) - 190),
      );
      const a = apurarIrDayTrade(dias);
      const positivos = a.meses
        .filter((m) => m.resultado.gt(0))
        .reduce((t, m) => t.plus(m.resultado), dec(0));
      expect(a.irTotal.gte(0)).toBe(true);
      expect(a.irTotal.lte(positivos.times("0.2").plus("0.01").times(1))).toBe(true);
      for (const m of a.meses) expect(m.base.gte(0) && m.prejuizoDepois.gte(0)).toBe(true);
    }
  });
});
