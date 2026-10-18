import { dec, type Execucao } from "@zentrade/dominio";
import { describe, expect, it } from "vitest";
import { curvaDiaria, DIA_MS, taxasDesde } from "./curva-diaria.js";

const D0 = Date.UTC(2026, 9, 1); // 1º de outubro, 00:00 UTC
const ex = (lado: "COMPRA" | "VENDA", preco: string, taxa: string, em: number): Execucao => ({
  lado,
  preco: dec(preco),
  quantidade: dec("1"),
  taxaCotacao: dec(taxa),
  em,
});

// Compra no dia 1 (taxa 0,1); vende no dia 3 a 110 (taxa 0,11): +9,89 líquido.
const porRobo = new Map([
  [
    "r1",
    [
      ex("COMPRA", "100", "0.1", D0 + DIA_MS + 3_600_000),
      ex("VENDA", "110", "0.11", D0 + 3 * DIA_MS + 60_000),
    ],
  ],
]);
const valores = (pontos: ReturnType<typeof curvaDiaria>) => pontos.map((p) => p.valor.toFixed());

describe("curva diária do resultado realizado", () => {
  it("sem execução não há curva", () => {
    expect(curvaDiaria(new Map(), { inicio: D0, fim: D0 + 5 * DIA_MS }, "UTC")).toEqual([]);
  });

  it("começa em zero no dia anterior à primeira execução e repete dias parados", () => {
    const pontos = curvaDiaria(porRobo, { inicio: D0 - 10 * DIA_MS, fim: D0 + 4 * DIA_MS + 1 }, "UTC");
    expect(pontos.map((p) => (p.em - D0) / DIA_MS)).toEqual([0, 1, 2, 3, 4]);
    expect(valores(pontos)).toEqual(["0", "-0.1", "-0.1", "9.79", "9.79"]);
  });

  it("janela que começa depois da primeira execução carrega o acumulado anterior", () => {
    const pontos = curvaDiaria(porRobo, { inicio: D0 + 2 * DIA_MS + 5, fim: D0 + 3 * DIA_MS }, "UTC");
    expect(pontos.map((p) => p.em)).toEqual([D0 + 2 * DIA_MS, D0 + 3 * DIA_MS]);
    expect(valores(pontos)).toEqual(["-0.1", "9.79"]);
  });

  it("soma os robôs juntos, em ordem de tempo", () => {
    const dois = new Map([...porRobo, ["r2", [ex("COMPRA", "50", "0.05", D0 + 2 * DIA_MS)]]]);
    expect(valores(curvaDiaria(dois, { inicio: D0 + DIA_MS, fim: D0 + 3 * DIA_MS }, "UTC"))).toEqual([
      "-0.1",
      "-0.15",
      "9.74",
    ]);
  });
});

describe("curva diária no fuso da instância", () => {
  const SP = "America/Sao_Paulo";
  const NY = "America/New_York";

  it("a venda das 22:52 de Brasília (já 18/10 em UTC) fica no dia 17/10", () => {
    const vendaNoite = Date.parse("2026-10-18T01:52:00Z");
    const execs = new Map([
      [
        "r1",
        [ex("COMPRA", "100", "0", Date.parse("2026-10-17T13:00:00Z")), ex("VENDA", "90", "0", vendaNoite)],
      ],
    ]);
    const pontos = curvaDiaria(execs, { inicio: vendaNoite - 2 * DIA_MS, fim: vendaNoite }, SP);
    expect(pontos.map((p) => new Date(p.em).toISOString())).toEqual([
      "2026-10-16T03:00:00.000Z",
      "2026-10-17T03:00:00.000Z",
    ]);
    expect(valores(pontos)).toEqual(["0", "-10"]);
  });

  it("dias de 23 e 25 horas (New York): um ponto por dia local, cada um na meia-noite local", () => {
    const execs = new Map([["r1", [ex("COMPRA", "1", "0.5", Date.parse("2026-03-06T15:00:00Z"))]]]);
    const marco = curvaDiaria(
      execs,
      { inicio: Date.parse("2026-03-07T15:00:00Z"), fim: Date.parse("2026-03-09T15:00:00Z") },
      NY,
    );
    expect(marco.map((p) => new Date(p.em).toISOString())).toEqual([
      "2026-03-07T05:00:00.000Z",
      "2026-03-08T05:00:00.000Z",
      "2026-03-09T04:00:00.000Z",
    ]);
    const novembro = curvaDiaria(
      new Map([["r1", [ex("COMPRA", "1", "0.5", Date.parse("2026-10-30T15:00:00Z"))]]]),
      { inicio: Date.parse("2026-10-31T15:00:00Z"), fim: Date.parse("2026-11-02T15:00:00Z") },
      NY,
    );
    expect(novembro.map((p) => new Date(p.em).toISOString())).toEqual([
      "2026-10-31T04:00:00.000Z",
      "2026-11-01T04:00:00.000Z",
      "2026-11-02T05:00:00.000Z",
    ]);
  });
});

describe("taxas pagas", () => {
  it("soma só as execuções a partir do instante pedido", () => {
    expect(taxasDesde(porRobo, D0 + 3 * DIA_MS).toFixed()).toBe("0.11");
    expect(taxasDesde(porRobo, 0).toFixed()).toBe("0.21");
    expect(taxasDesde(new Map(), 0).toFixed()).toBe("0");
  });
});
