import { describe, expect, it } from "vitest";
import { quedas, quedasComparadas, reduzir, retornosAcumulados } from "./series";

describe("séries dos gráficos do backtest", () => {
  it("retorno acumulado da estratégia e do buy and hold sobre o capital", () => {
    const curva = [
      { em: 1, patrimonio: "1000", buyHold: "1000" },
      { em: 2, patrimonio: "1100", buyHold: "950" },
      { em: 3, patrimonio: "1050", buyHold: "1200" },
    ];
    const s = retornosAcumulados(curva, 1000);
    expect(s.em).toEqual([1, 2, 3]);
    expect(s.estrategia.map((v) => Number(v.toFixed(4)))).toEqual([0, 0.1, 0.05]);
    expect(s.buyHold?.map((v) => Number(v.toFixed(4)))).toEqual([0, -0.05, 0.2]);
  });

  it("backtest antigo, sem buy and hold: só a estratégia", () => {
    expect(retornosAcumulados([{ em: 1, patrimonio: "1000" }], 1000).buyHold).toBeNull();
    expect(quedasComparadas([{ em: 1, patrimonio: "1000" }]).buyHold).toBeNull();
  });

  it("queda a partir do pico (feito à mão)", () => {
    expect(quedas([100, 120, 90, 130, 117]).map((v) => Number(v.toFixed(4)))).toEqual([0, 0, -0.25, 0, -0.1]);
  });

  it("reduzir mantém o primeiro e o último; a queda reduzida nunca perde o fundo", () => {
    const n = 1000;
    const curva = Array.from({ length: n }, (_, i) => ({
      em: i,
      patrimonio: String(i === 501 ? 500 : 1000 + i),
    }));
    const r = reduzir(curva, 100);
    expect(r).toHaveLength(100);
    expect(r[0]?.em).toBe(0);
    expect(r.at(-1)?.em).toBe(n - 1);
    const q = quedasComparadas(curva, 100);
    expect(q.estrategia).toHaveLength(100);
    expect(Math.min(...q.estrategia)).toBeCloseTo(500 / 1500 - 1, 10);
  });
});
