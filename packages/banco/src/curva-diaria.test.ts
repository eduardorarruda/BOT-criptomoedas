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
    expect(curvaDiaria(new Map(), { inicio: D0, fim: D0 + 5 * DIA_MS })).toEqual([]);
  });

  it("começa em zero no dia anterior à primeira execução e repete dias parados", () => {
    const pontos = curvaDiaria(porRobo, { inicio: D0 - 10 * DIA_MS, fim: D0 + 4 * DIA_MS + 1 });
    expect(pontos.map((p) => (p.em - D0) / DIA_MS)).toEqual([0, 1, 2, 3, 4]);
    expect(valores(pontos)).toEqual(["0", "-0.1", "-0.1", "9.79", "9.79"]);
  });

  it("janela que começa depois da primeira execução carrega o acumulado anterior", () => {
    const pontos = curvaDiaria(porRobo, { inicio: D0 + 2 * DIA_MS + 5, fim: D0 + 3 * DIA_MS });
    expect(pontos.map((p) => p.em)).toEqual([D0 + 2 * DIA_MS, D0 + 3 * DIA_MS]);
    expect(valores(pontos)).toEqual(["-0.1", "9.79"]);
  });

  it("soma os robôs juntos, em ordem de tempo", () => {
    const dois = new Map([...porRobo, ["r2", [ex("COMPRA", "50", "0.05", D0 + 2 * DIA_MS)]]]);
    expect(valores(curvaDiaria(dois, { inicio: D0 + DIA_MS, fim: D0 + 3 * DIA_MS }))).toEqual([
      "-0.1",
      "-0.15",
      "9.74",
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
