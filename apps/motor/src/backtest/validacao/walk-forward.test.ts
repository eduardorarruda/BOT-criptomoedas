import { describe, expect, it } from "vitest";
import type { ResumoTrecho } from "@zentrade/contratos";
import { eficiencia, estabilidade, janelasWalkForward } from "./walk-forward.js";

describe("janelas do walk-forward", () => {
  it("rolante, 4 janelas, metade dentro: T = 1000 → testes de 200 depois de 200 de referência", () => {
    // fora = 1000 / (4 + 0,5/0,5) = 200; dentro = 200
    const j = janelasWalkForward(0, 1000, { janelas: 4, modo: "rolante", fracaoDentro: 0.5 });
    expect(j).toEqual([
      { indice: 0, dentro: { inicio: 0, fim: 200 }, fora: { inicio: 200, fim: 400 } },
      { indice: 1, dentro: { inicio: 200, fim: 400 }, fora: { inicio: 400, fim: 600 } },
      { indice: 2, dentro: { inicio: 400, fim: 600 }, fora: { inicio: 600, fim: 800 } },
      { indice: 3, dentro: { inicio: 600, fim: 800 }, fora: { inicio: 800, fim: 1000 } },
    ]);
  });

  it("ancorada: o trecho de referência começa sempre no início e cresce", () => {
    const j = janelasWalkForward(0, 1000, { janelas: 4, modo: "ancorada", fracaoDentro: 0.5 });
    expect(j.map((x) => x.dentro)).toEqual([
      { inicio: 0, fim: 200 },
      { inicio: 0, fim: 400 },
      { inicio: 0, fim: 600 },
      { inicio: 0, fim: 800 },
    ]);
    expect(j.map((x) => x.fora.inicio)).toEqual([200, 400, 600, 800]);
  });

  it("70/30 com 5 janelas: testes sem sobreposição e o último termina no fim exato", () => {
    // fora = 7000 / (5 + 7/3) = 954,5…; dentro = 2227,3…
    const j = janelasWalkForward(1_000, 8_000, { janelas: 5, modo: "rolante", fracaoDentro: 0.7 });
    expect(j).toHaveLength(5);
    expect(j[0]?.dentro.inicio).toBe(1_000);
    expect(j[0]?.fora.inicio).toBe(Math.round(1_000 + (7_000 / (5 + 7 / 3)) * (7 / 3)));
    for (let i = 1; i < j.length; i++) expect(j[i]?.fora.inicio).toBe(j[i - 1]?.fora.fim);
    expect(j.at(-1)?.fora.fim).toBe(8_000);
    const larguras = j.map((x) => x.fora.fim - x.fora.inicio);
    expect(Math.max(...larguras) - Math.min(...larguras)).toBeLessThanOrEqual(1);
  });
});

const DIA = 86_400_000;
const trecho = (inicio: number, dias: number, retorno: number, sharpe: number | null = 1): ResumoTrecho => ({
  inicio,
  fim: inicio + dias * DIA,
  retorno,
  sharpe,
  maiorQuedaPercentual: 0,
  operacoes: 1,
  taxaAcerto: 1,
  buyHoldRetorno: 0,
});

describe("eficiência e estabilidade", () => {
  it("eficiência de Pardo: 10% em 20 dias dentro, 3% em 10 dias fora → 0,6", () => {
    expect(eficiencia(trecho(0, 20, 0.1), trecho(20 * DIA, 10, 0.03))).toBeCloseTo(0.6, 12);
    expect(eficiencia(trecho(0, 20, -0.1), trecho(20 * DIA, 10, 0.03))).toBeNull();
    expect(eficiencia(trecho(0, 20, 0.1), trecho(20 * DIA, 0, 0.03))).toBeNull();
  });

  it("média, desvio e fração de janelas no lucro (feito à mão)", () => {
    // fora: 0,04; −0,02; 0,01 → média 0,01; desvio amostral = √((0,0009+0,0009+0)/2) = 0,03
    const janelas = [0.04, -0.02, 0.01].map((r, i) => ({
      indice: i,
      dentro: trecho(0, 10, 0.05),
      fora: trecho(10 * DIA, 10, r, i === 1 ? null : r * 10),
      eficiencia: i === 1 ? null : r / 0.05,
    }));
    const e = estabilidade(janelas);
    expect(e.mediaRetorno).toBeCloseTo(0.01, 12);
    expect(e.desvioRetorno).toBeCloseTo(0.03, 12);
    expect(e.fracaoPositivas).toBeCloseTo(2 / 3, 12);
    expect(e.mediaSharpe).toBeCloseTo(0.25, 12);
    expect(e.eficienciaMedia).toBeCloseTo(0.5, 12);
    expect(estabilidade([])).toMatchObject({ fracaoPositivas: 0, mediaSharpe: null, eficienciaMedia: null });
  });
});
