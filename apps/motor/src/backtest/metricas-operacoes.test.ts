import { dec } from "@zentrade/dominio";
import { describe, expect, it } from "vitest";
import type { OperacaoFechada } from "../historico.js";
import { estatisticasDasOperacoes } from "./metricas-operacoes.js";

const ops = (...resultados: number[]): OperacaoFechada[] =>
  resultados.map((r, i) => ({ abertaEm: i, fechadaEm: i + 1, resultado: dec(r) }));

describe("estatísticas das operações (feitas à mão)", () => {
  it("+30, −10, +20, −20, +5", () => {
    // ganhos 55, perdas 30: fator de lucro 55/30 = 1,8333; expectativa 25/5 = 5;
    // ganho médio 55/3 = 18,333; perda média −15; payoff 18,333/15 = 1,2222
    const e = estatisticasDasOperacoes(ops(30, -10, 20, -20, 5));
    expect(e.fatorLucro).toBeCloseTo(55 / 30, 12);
    expect(e.expectativa.toFixed()).toBe("5");
    expect(e.ganhoMedio?.toNumber()).toBeCloseTo(55 / 3, 12);
    expect(e.perdaMedia?.toFixed()).toBe("-15");
    expect(e.payoff).toBeCloseTo(55 / 3 / 15, 12);
  });

  it("sem perdas: fator de lucro e payoff indefinidos (null), não infinitos", () => {
    const e = estatisticasDasOperacoes(ops(10, 5));
    expect(e).toMatchObject({ fatorLucro: null, payoff: null, perdaMedia: null });
    expect(e.ganhoMedio?.toFixed()).toBe("7.5");
  });

  it("sem operações: expectativa zero, o resto null", () => {
    const e = estatisticasDasOperacoes([]);
    expect(e.expectativa.isZero()).toBe(true);
    expect(e).toMatchObject({ fatorLucro: null, ganhoMedio: null, perdaMedia: null, payoff: null });
  });

  it("só perdas: fator de lucro zero", () => {
    expect(estatisticasDasOperacoes(ops(-1, -2)).fatorLucro).toBe(0);
  });
});
