import { describe, expect, it } from "vitest";
import { dentroDoPeriodo, descreverPeriodo, intervaloDoPeriodo } from "./periodo";

const DIA = 86_400_000;
// 11/10/2026 15:00 em Brasília (o fuso da instância, não o do navegador).
const AGORA = Date.parse("2026-10-11T15:00:00-03:00");
const BRT = (iso: string) => Date.parse(`${iso}-03:00`);

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
    expect(intervaloDoPeriodo({ periodo: "ano" }, AGORA)?.inicio).toBe(BRT("2026-01-01T00:00:00"));
    expect(intervaloDoPeriodo({ periodo: "12m" }, AGORA)?.inicio).toBe(BRT("2025-10-11T15:00:00"));
  });

  it("personalizado vai do começo do dia inicial ao fim do dia final", () => {
    const i = intervaloDoPeriodo({ periodo: "personalizado", de: "2026-10-01", ate: "2026-10-05" }, AGORA);
    expect(i?.inicio).toBe(BRT("2026-10-01T00:00:00"));
    expect(i?.fim).toBe(BRT("2026-10-06T00:00:00") - 1);
  });

  it("personalizado com só uma ponta deixa a outra aberta; datas trocadas são desvirada", () => {
    expect(intervaloDoPeriodo({ periodo: "personalizado", de: "2026-10-01" }, AGORA)).toEqual({
      inicio: BRT("2026-10-01T00:00:00"),
      fim: Number.POSITIVE_INFINITY,
    });
    const trocado = intervaloDoPeriodo(
      { periodo: "personalizado", de: "2026-10-05", ate: "2026-10-01" },
      AGORA,
    );
    expect(trocado?.inicio).toBe(BRT("2026-10-01T00:00:00"));
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
