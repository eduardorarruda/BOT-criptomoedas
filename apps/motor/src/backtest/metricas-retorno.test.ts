import { dec } from "@zentrade/dominio";
import { describe, expect, it } from "vitest";
import { barrasPorAno, cagr, calmar, metricasDosRetornos, retornosDaCurva } from "./metricas-retorno.js";

describe("retornos por candle", () => {
  it("cada retorno é o patrimônio sobre o anterior menos 1, começando do saldo inicial", () => {
    const curva = [102, 100.98, 104.0094].map((p, em) => ({ em, patrimonio: dec(p) }));
    const r = retornosDaCurva(dec(100), curva);
    expect(r).toHaveLength(3);
    expect(r[0]).toBeCloseTo(0.02, 12);
    expect(r[1]).toBeCloseTo(-0.01, 12);
    expect(r[2]).toBeCloseTo(0.03, 12);
    expect(retornosDaCurva(dec(100), [])).toEqual([]);
  });

  it("barras por ano em um mercado de 365 dias", () => {
    expect(barrasPorAno("1d")).toBe(365);
    expect(barrasPorAno("1h")).toBe(8760);
    expect(barrasPorAno("15m")).toBe(35_040);
  });
});

describe("volatilidade, Sharpe e Sortino anualizados (feitos à mão)", () => {
  // r = [0,02; −0,01; 0,03; −0,02], candles diários (365 por ano)
  // média μ = 0,005; desvios² = 0,000225 + 0,000225 + 0,000625 + 0,000625 = 0,0017
  // σ amostral = √(0,0017/3) = 0,0238048; Sharpe = μ/σ × √365 = 4,01285
  // desvio para baixo (alvo 0, sobre n) = √((0,0001 + 0,0004)/4) = 0,0111803
  // Sortino = μ/0,0111803 × √365 = 8,54400
  const r = [0.02, -0.01, 0.03, -0.02];

  it("os números da conta", () => {
    const m = metricasDosRetornos(r, 365);
    expect(m.observacoes).toBe(4);
    expect(m.volatilidadeAnual).toBeCloseTo(0.0238048 * Math.sqrt(365), 5);
    expect(m.sharpe).toBeCloseTo(4.01285, 4);
    expect(m.sortino).toBeCloseTo(8.544, 3);
  });

  it("o intervalo entra na anualização: candles de 1h multiplicam por √8760", () => {
    const diario = metricasDosRetornos(r, 365);
    const horario = metricasDosRetornos(r, 8760);
    expect((horario.sharpe ?? 0) / (diario.sharpe ?? 1)).toBeCloseTo(Math.sqrt(8760 / 365), 10);
  });

  it("sem variação, sem perdas ou com um retorno só: não há Sharpe/Sortino para mostrar", () => {
    expect(metricasDosRetornos([0, 0, 0], 365)).toMatchObject({
      sharpe: null,
      sortino: null,
      volatilidadeAnual: 0,
    });
    expect(metricasDosRetornos([0.01, 0.02], 365).sortino).toBeNull();
    expect(metricasDosRetornos([0.01], 365)).toMatchObject({ sharpe: null, volatilidadeAnual: null });
  });
});

describe("CAGR e Calmar", () => {
  it("CAGR só com 1 ano ou mais: 100 → 121 em 2 anos é 10% ao ano", () => {
    expect(cagr(dec(100), dec(121), 2)).toBeCloseTo(0.1, 12);
    expect(cagr(dec(100), dec(110), 1)).toBeCloseTo(0.1, 12);
    expect(cagr(dec(100), dec(150), 0.5)).toBeNull();
    expect(cagr(dec(100), dec(0), 2)).toBe(-1);
  });

  it("Calmar = CAGR ÷ maior queda; sem queda ou sem CAGR, null", () => {
    expect(calmar(0.1, 0.25)).toBeCloseTo(0.4, 12);
    expect(calmar(null, 0.25)).toBeNull();
    expect(calmar(0.1, 0)).toBeNull();
  });
});
