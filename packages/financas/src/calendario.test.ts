import { describe, expect, it } from "vitest";
import {
  diaDaSemana,
  diasCorridos,
  diasUteis,
  ehDiaUtil,
  ErroCalendario,
  FERIADOS_NACIONAIS,
  feriadosNacionais,
  mesDe,
  pascoa,
  proximoDiaUtil,
  somarDias,
  somarDiasUteis,
  somarMeses,
  validarDia,
} from "./calendario.js";

describe("datas de calendário", () => {
  it("valida o formato AAAA-MM-DD e a data real", () => {
    expect(validarDia("2026-02-28")).toBe("2026-02-28");
    expect(() => validarDia("2026-02-30")).toThrow(ErroCalendario);
    expect(() => validarDia("26-02-01")).toThrow(/AAAA-MM-DD/);
    expect(() => validarDia("2026-13-01")).toThrow(ErroCalendario);
  });

  it("soma dias, conta dias corridos e acha o dia da semana", () => {
    expect(somarDias("2026-12-31", 1)).toBe("2027-01-01");
    expect(somarDias("2024-03-01", -1)).toBe("2024-02-29");
    expect(diasCorridos("2026-01-01", "2026-12-31")).toBe(364);
    expect(diasCorridos("2026-03-10", "2026-03-01")).toBe(-9);
    expect(diaDaSemana("2026-10-11")).toBe(0); // domingo
    expect(diaDaSemana("2026-10-12")).toBe(1);
  });

  it("soma meses sem pular para o mês seguinte", () => {
    expect(somarMeses("2026-01-31", 1)).toBe("2026-02-28");
    expect(somarMeses("2024-01-31", 1)).toBe("2024-02-29");
    expect(somarMeses("2026-11-15", 3)).toBe("2027-02-15");
    expect(somarMeses("2026-03-15", -3)).toBe("2025-12-15");
    expect(mesDe("2026-07-09")).toBe("2026-07");
  });
});

describe("Páscoa (base dos feriados móveis)", () => {
  it.each([
    [2024, "2024-03-31"],
    [2025, "2025-04-20"],
    [2026, "2026-04-05"],
    [2027, "2027-03-28"],
    [2038, "2038-04-25"],
  ])("Páscoa de %i é %s", (ano, dia) => {
    expect(pascoa(ano)).toBe(dia);
  });
});

describe("feriados nacionais (calendário ANBIMA)", () => {
  it("2026 bate com a lista publicada pela ANBIMA", () => {
    expect(feriadosNacionais(2026).map((f) => f.dia)).toEqual([
      "2026-01-01",
      "2026-02-16",
      "2026-02-17",
      "2026-04-03",
      "2026-04-21",
      "2026-05-01",
      "2026-06-04",
      "2026-09-07",
      "2026-10-12",
      "2026-11-02",
      "2026-11-15",
      "2026-11-20",
      "2026-12-25",
    ]);
  });

  it("20 de novembro só é feriado nacional desde 2024 (Lei 14.759/2023)", () => {
    expect(feriadosNacionais(2023).some((f) => f.dia === "2023-11-20")).toBe(false);
    expect(feriadosNacionais(2024).some((f) => f.dia === "2024-11-20")).toBe(true);
  });

  it("a tabela diz de onde veio e quando foi conferida", () => {
    expect(FERIADOS_NACIONAIS.fonte).toMatch(/ANBIMA/);
    expect(FERIADOS_NACIONAIS.verificadoEm).toBe("2026-10-11");
    expect(FERIADOS_NACIONAIS.regras.every((r) => r.base.length > 0)).toBe(true);
  });

  it("fora do intervalo seguro do algoritmo, recusa em vez de chutar", () => {
    expect(() => feriadosNacionais(1899)).toThrow(ErroCalendario);
  });
});

describe("dias úteis (base 252)", () => {
  it("fim de semana e feriado não são úteis", () => {
    expect(ehDiaUtil("2026-10-09")).toBe(true);
    expect(ehDiaUtil("2026-10-10")).toBe(false);
    expect(ehDiaUtil("2026-10-12")).toBe(false);
    expect(ehDiaUtil("2026-02-17")).toBe(false);
  });

  it("setembro de 2026 tem 21 dias úteis, como as 21 publicações do CDI (SGS 12)", () => {
    expect(diasUteis("2026-09-01", "2026-10-01")).toBe(21);
  });

  it("conta [início, fim): o dia da aplicação rende, o do resgate não", () => {
    expect(diasUteis("2026-10-09", "2026-10-13")).toBe(1);
    expect(diasUteis("2026-10-13", "2026-10-13")).toBe(0);
    expect(diasUteis("2026-10-13", "2026-10-09")).toBe(0);
  });

  it("2026 inteiro tem 249 dias úteis (261 dias de semana − 12 feriados)", () => {
    expect(diasUteis("2026-01-01", "2027-01-01")).toBe(249);
  });

  it("anda para o próximo dia útil e soma dias úteis", () => {
    expect(proximoDiaUtil("2026-10-10")).toBe("2026-10-13");
    expect(proximoDiaUtil("2026-10-13")).toBe("2026-10-13");
    expect(somarDiasUteis("2026-10-09", 1)).toBe("2026-10-13");
    expect(somarDiasUteis("2026-10-09", 0)).toBe("2026-10-09");
    expect(() => somarDiasUteis("2026-10-09", -1)).toThrow(ErroCalendario);
  });
});
