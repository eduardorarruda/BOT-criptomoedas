import { describe, expect, it } from "vitest";
import { dentroDoPeriodo, descreverPeriodo, intervaloDoPeriodo } from "./periodo";

const DIA = 86_400_000;
// 11/10/2026 15:00 no horário local do teste.
const AGORA = new Date(2026, 9, 11, 15, 0, 0).getTime();

describe("período", () => {
  it("sem período (ou 'tudo') não corta nada", () => {
    expect(intervaloDoPeriodo({}, AGORA)).toBeNull();
    expect(intervaloDoPeriodo({ periodo: "tudo" }, AGORA)).toBeNull();
  });

  it("últimos N dias contam até agora", () => {
    expect(intervaloDoPeriodo({ periodo: "7d" }, AGORA)).toEqual({ inicio: AGORA - 7 * DIA, fim: AGORA });
    expect(intervaloDoPeriodo({ periodo: "90d" }, AGORA)?.inicio).toBe(AGORA - 90 * DIA);
  });

  it("no ano começa em 1º de janeiro; 12 meses volta um ano", () => {
    expect(intervaloDoPeriodo({ periodo: "ano" }, AGORA)?.inicio).toBe(new Date(2026, 0, 1).getTime());
    expect(intervaloDoPeriodo({ periodo: "12m" }, AGORA)?.inicio).toBe(new Date(2025, 9, 11, 15).getTime());
  });

  it("personalizado vai do começo do dia inicial ao fim do dia final", () => {
    const i = intervaloDoPeriodo({ periodo: "personalizado", de: "2026-10-01", ate: "2026-10-05" }, AGORA);
    expect(i?.inicio).toBe(new Date(2026, 9, 1).getTime());
    expect(i?.fim).toBe(new Date(2026, 9, 6).getTime() - 1);
  });

  it("personalizado com só uma ponta deixa a outra aberta; datas trocadas são desvirada", () => {
    expect(intervaloDoPeriodo({ periodo: "personalizado", de: "2026-10-01" }, AGORA)).toEqual({
      inicio: new Date(2026, 9, 1).getTime(),
      fim: Number.POSITIVE_INFINITY,
    });
    const trocado = intervaloDoPeriodo(
      { periodo: "personalizado", de: "2026-10-05", ate: "2026-10-01" },
      AGORA,
    );
    expect(trocado?.inicio).toBe(new Date(2026, 9, 1).getTime());
    expect(intervaloDoPeriodo({ periodo: "personalizado" }, AGORA)).toBeNull();
  });

  it("dentro do período", () => {
    const i = intervaloDoPeriodo({ periodo: "7d" }, AGORA);
    expect(dentroDoPeriodo(AGORA - DIA, i)).toBe(true);
    expect(dentroDoPeriodo(AGORA - 8 * DIA, i)).toBe(false);
    expect(dentroDoPeriodo(AGORA - 800 * DIA, null)).toBe(true);
  });

  it("descreve em palavras", () => {
    expect(descreverPeriodo({ periodo: "30d" })).toBe("últimos 30 dias");
    expect(descreverPeriodo({ periodo: "personalizado", de: "2026-10-01", ate: "2026-10-05" })).toBe(
      "de 01/10/2026 a 05/10/2026",
    );
    expect(descreverPeriodo({ periodo: "personalizado", ate: "2026-10-05" })).toBe("até 05/10/2026");
    expect(descreverPeriodo({})).toBe("todo o histórico");
  });
});
