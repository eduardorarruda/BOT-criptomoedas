import { describe, expect, it } from "vitest";
import { financiamentoPorAno, fluxoPorMes, rotuloMes } from "./series";

const linha = (mes: number) => ({
  mes,
  juros: "10.5",
  amortizacao: "100",
  parcelaTotal: "110.5",
  saldoFinal: String(2500 - mes * 100),
});

describe("séries dos gráficos", () => {
  it("agrupa a tabela por ano do contrato", () => {
    const anos = financiamentoPorAno(Array.from({ length: 25 }, (_, i) => linha(i + 1)));
    expect(anos).toHaveLength(3);
    expect(anos[0]).toEqual({ ano: 1, juros: 126, amortizacao: 1200, pago: 1326, saldoFinal: 1300 });
    expect(anos[2]).toMatchObject({ ano: 3, juros: 10.5, saldoFinal: 0 });
  });

  it("entradas e saídas por mês, com câmbio", () => {
    const base = {
      id: "x",
      investimentoId: "i",
      quantidade: null,
      descricao: null,
      criadoEm: 0,
      categoria: "c",
    };
    const f = fluxoPorMes([
      { ...base, data: "2026-02-10", tipo: "receita", valor: "100", cambio: null },
      { ...base, data: "2026-01-05", tipo: "aporte", valor: "1000", cambio: null },
      { ...base, data: "2026-02-15", tipo: "despesa", valor: "30", cambio: null },
      { ...base, data: "2026-02-20", tipo: "receita", valor: "10", cambio: "5.5" },
    ]);
    expect(f).toEqual([
      { mes: "2026-01", entradas: 0, saidas: -1000 },
      { mes: "2026-02", entradas: 155, saidas: -30 },
    ]);
    expect(rotuloMes("2026-03")).toBe("mar/26");
  });
});
