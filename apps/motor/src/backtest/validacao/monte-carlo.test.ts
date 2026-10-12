import { dec } from "@zentrade/dominio";
import { describe, expect, it } from "vitest";
import { geradorComSemente, retornosDasOperacoes, simularMonteCarlo } from "./monte-carlo.js";

const opcoes = { simulacoes: 1000, semente: 42, limiteRuina: 0.3 };

describe("gerador com semente", () => {
  it("mesma semente, mesma sequência; outra semente, outra sequência; uniforme em [0, 1)", () => {
    const a = geradorComSemente(7);
    const b = geradorComSemente(7);
    const c = geradorComSemente(8);
    const sa = Array.from({ length: 5 }, a);
    expect(Array.from({ length: 5 }, b)).toEqual(sa);
    expect(Array.from({ length: 5 }, c)).not.toEqual(sa);
    const g = geradorComSemente(1);
    const muitos = Array.from({ length: 20_000 }, g);
    expect(Math.min(...muitos)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...muitos)).toBeLessThan(1);
    expect(muitos.reduce((s, x) => s + x, 0) / muitos.length).toBeCloseTo(0.5, 2);
  });
});

describe("Monte Carlo das operações", () => {
  const retornos = [0.03, -0.01, 0.02, -0.02, 0.05, -0.015, 0.01, -0.03, 0.04, 0.0];

  it("é determinístico com a semente", () => {
    expect(simularMonteCarlo(retornos, opcoes)).toEqual(simularMonteCarlo(retornos, opcoes));
    expect(simularMonteCarlo(retornos, opcoes)).not.toEqual(
      simularMonteCarlo(retornos, { ...opcoes, semente: 43 }),
    );
  });

  it("percentis em ordem, histograma soma as simulações e o leque vai do 0 ao fim", () => {
    const m = simularMonteCarlo(retornos, opcoes)!;
    expect(m.operacoes).toBe(10);
    expect(m.retornoFinal.p5).toBeLessThanOrEqual(m.retornoFinal.p50);
    expect(m.retornoFinal.p50).toBeLessThanOrEqual(m.retornoFinal.p95);
    expect(m.maiorQueda.p5).toBeGreaterThanOrEqual(0);
    expect(m.histograma.reduce((s, b) => s + b.quantidade, 0)).toBe(1000);
    expect(m.histograma).toHaveLength(20);
    expect(m.leque[0]).toEqual({ operacao: 0, p5: 1, p50: 1, p95: 1 });
    expect(m.leque.at(-1)?.operacao).toBe(10);
    expect(m.leque.at(-1)?.p50).toBeCloseTo(1 + m.retornoFinal.p50, 12);
  });

  it("retornos iguais: toda simulação dá (1 + r)^n − 1, sem queda nem ruína", () => {
    const m = simularMonteCarlo(Array<number>(6).fill(0.01), opcoes)!;
    const esperado = 1.01 ** 6 - 1;
    expect(m.retornoFinal.p5).toBeCloseTo(esperado, 12);
    expect(m.retornoFinal.p95).toBeCloseTo(esperado, 12);
    expect(m.maiorQueda.p95).toBe(0);
    expect(m.probabilidadeRuina).toBe(0);
    expect(m.histograma).toEqual([{ de: m.retornoFinal.p50, ate: m.retornoFinal.p50, quantidade: 1000 }]);
  });

  it("ruína feita à mão", () => {
    // Toda operação perde 50% e o limite é 50%: arruína na primeira, sempre.
    const sempre = simularMonteCarlo(Array<number>(5).fill(-0.5), { ...opcoes, limiteRuina: 0.5 });
    expect(sempre?.probabilidadeRuina).toBe(1);
    // Metade −60% e metade +10% (6 operações, logo 6 sorteios de chance 1/2): a chance
    // exata de ruína a −50% vem de enumerar as 2⁶ sequências igualmente prováveis.
    const valores = [-0.6, 0.1];
    let arruinadas = 0;
    for (let mascara = 0; mascara < 64; mascara++) {
      let p = 1;
      let caiu = false;
      for (let j = 0; j < 6; j++) {
        p *= 1 + valores[(mascara >> j) & 1]!;
        if (p <= 0.5) caiu = true;
      }
      if (caiu) arruinadas++;
    }
    const m = simularMonteCarlo([-0.6, 0.1, -0.6, 0.1, -0.6, 0.1], {
      simulacoes: 5000,
      semente: 3,
      limiteRuina: 0.5,
    });
    expect(m?.probabilidadeRuina).toBeCloseTo(arruinadas / 64, 1);
  });

  it("poucas operações: não simula", () => {
    expect(simularMonteCarlo([0.01, 0.02, 0.03, 0.04], opcoes)).toBeNull();
  });

  it("retorno de cada operação sobre o patrimônio de antes da compra", () => {
    const curva = [
      { em: 10, patrimonio: dec(1000) },
      { em: 20, patrimonio: dec(1000) },
      { em: 30, patrimonio: dec(1100) },
    ];
    const ops = [
      { abertaEm: 20, fechadaEm: 30, resultado: dec(100) },
      { abertaEm: 5, fechadaEm: 9, resultado: dec(-50) },
    ];
    expect(retornosDasOperacoes(ops, curva, dec(500))).toEqual([0.1, -0.1]);
  });
});
