import { describe, expect, it } from "vitest";
import {
  anosMinimosDeBacktest,
  avaliarTentativas,
  momentos,
  normalAcumulada,
  normalInversa,
  percentil,
  sharpeComDesconto,
  sharpeDeflacionado,
  sharpeMaximoEsperado,
  sharpeProbabilistico,
} from "./backtest-estatistica.js";

describe("normal padrão", () => {
  it("acumulada nos pontos de tabela", () => {
    expect(normalAcumulada(0)).toBeCloseTo(0.5, 7);
    expect(normalAcumulada(1.959964)).toBeCloseTo(0.975, 6);
    expect(normalAcumulada(-1.644854)).toBeCloseTo(0.05, 6);
    expect(normalAcumulada(3)).toBeCloseTo(0.9986501, 6);
    expect(normalAcumulada(-8)).toBeLessThan(1e-10);
  });

  it("inversa nos pontos de tabela e ida e volta", () => {
    expect(normalInversa(0.5)).toBeCloseTo(0, 9);
    expect(normalInversa(0.975)).toBeCloseTo(1.959964, 6);
    expect(normalInversa(0.01)).toBeCloseTo(-2.326348, 6);
    expect(normalInversa(0.999)).toBeCloseTo(3.090232, 6);
    for (const p of [0.001, 0.02, 0.3, 0.7, 0.98, 0.9999])
      expect(normalAcumulada(normalInversa(p))).toBeCloseTo(p, 6);
  });

  it("inversa recusa probabilidade fora de (0, 1)", () => {
    expect(() => normalInversa(0)).toThrow(RangeError);
    expect(() => normalInversa(1)).toThrow(RangeError);
    expect(() => normalInversa(Number.NaN)).toThrow(RangeError);
  });
});

describe("momentos e percentis", () => {
  it("média, desvio amostral, assimetria e curtose (não excedente) feitos à mão", () => {
    // [1, 2, 3, 4, 10]: média 4; desvios -3 -2 -1 0 6; m2 = 50/5 = 10; m3 = 180/5 = 36;
    // m4 = 1394/5 = 278,8. Assimetria = 36 / 10^1,5; curtose = 278,8 / 100.
    const m = momentos([1, 2, 3, 4, 10]);
    expect(m.n).toBe(5);
    expect(m.media).toBe(4);
    expect(m.desvio).toBeCloseTo(Math.sqrt(50 / 4), 12);
    expect(m.assimetria).toBeCloseTo(36 / 10 ** 1.5, 12);
    expect(m.curtose).toBeCloseTo(2.788, 12);
  });

  it("série constante ou curta: desvio zero, assimetria 0 e curtose 3 (normal)", () => {
    expect(momentos([2, 2, 2])).toEqual({ n: 3, media: 2, desvio: 0, assimetria: 0, curtose: 3 });
    expect(momentos([])).toEqual({ n: 0, media: 0, desvio: 0, assimetria: 0, curtose: 3 });
  });

  it("percentil com interpolação linear (tipo 7, o padrão do R e do NumPy)", () => {
    const v = [10, 20, 30, 40, 50];
    expect(percentil(v, 0)).toBe(10);
    expect(percentil(v, 0.5)).toBe(30);
    expect(percentil(v, 0.05)).toBeCloseTo(12, 12);
    expect(percentil(v, 0.95)).toBeCloseTo(48, 12);
    expect(percentil(v, 1)).toBe(50);
    expect(percentil([7], 0.3)).toBe(7);
    expect(Number.isNaN(percentil([], 0.5))).toBe(true);
  });
});

describe("Sharpe probabilístico e deflacionado (Bailey & López de Prado)", () => {
  it("PSR feito à mão: SR 0,1 por período, 100 observações, retornos normais", () => {
    // z = 0,1 × √99 / √(1 + (3 − 1)/4 × 0,01) = 0,99499 / 1,00249 = 0,99252
    const p = sharpeProbabilistico({
      sharpe: 0.1,
      referencia: 0,
      observacoes: 100,
      assimetria: 0,
      curtose: 3,
    });
    expect(p).toBeCloseTo(normalAcumulada((0.1 * Math.sqrt(99)) / Math.sqrt(1.005)), 10);
    expect(p).toBeCloseTo(0.8395, 3);
  });

  it("assimetria negativa e cauda gorda baixam a confiança no mesmo Sharpe", () => {
    const base = { sharpe: 0.1, referencia: 0, observacoes: 250 };
    const normal = sharpeProbabilistico({ ...base, assimetria: 0, curtose: 3 });
    const feio = sharpeProbabilistico({ ...base, assimetria: -2, curtose: 12 });
    expect(feio).toBeLessThan(normal);
  });

  it("Sharpe máximo esperado entre N tentativas sem habilidade (zero com uma tentativa)", () => {
    expect(sharpeMaximoEsperado(1, 0.5)).toBe(0);
    expect(sharpeMaximoEsperado(10, 0)).toBe(0);
    // N = 100, V = 1: (1 − γ)·Z⁻¹(0,99) + γ·Z⁻¹(1 − 1/(100e)) ≈ 2,5306
    expect(sharpeMaximoEsperado(100, 1)).toBeCloseTo(2.5306, 3);
    expect(sharpeMaximoEsperado(1000, 1)).toBeGreaterThan(sharpeMaximoEsperado(100, 1));
  });

  it("exemplo numérico publicado: DSR ≈ 0,9004", () => {
    // Bailey, D. H. & López de Prado, M. (2014). "The Deflated Sharpe Ratio: Correcting
    // for Selection Bias, Backtest Overfitting and Non-Normality". Journal of Portfolio
    // Management 40(5), seção "A numerical example": SR anual 2,5 em 5 anos de dados
    // diários (T = 1250, 250 dias/ano), N = 100 tentativas, V[SR anual] = 1/2,
    // assimetria −3 e curtose 10. O artigo chega a SR₀ ≈ 0,1132 (diário) e DSR ≈ 0,9004.
    const r = sharpeDeflacionado({
      sharpe: 2.5 / Math.sqrt(250),
      observacoes: 1250,
      assimetria: -3,
      curtose: 10,
      tentativas: 100,
      variancia: 0.5 / 250,
    });
    expect(r.referencia).toBeCloseTo(0.1132, 4);
    expect(r.probabilidade).toBeCloseTo(0.9004, 3);
  });
});

describe("duração mínima do backtest (MinBTL)", () => {
  it("exemplo publicado: 45 configurações pedem ~5 anos para um Sharpe anual de 1", () => {
    // Bailey, Borwein, López de Prado & Zhu (2014). "Pseudo-Mathematics and Financial
    // Charlatanism". Notices of the AMS 61(5): com 5 anos de dados, no máximo 45
    // configurações independentes antes de um Sharpe anual de 1 aparecer por acaso.
    expect(anosMinimosDeBacktest(45, 1)).toBeCloseTo(5, 1);
    expect(anosMinimosDeBacktest(45, 2)).toBeCloseTo(5 / 4, 1);
  });

  it("sem escolha entre tentativas ou sem Sharpe positivo: não se aplica", () => {
    expect(anosMinimosDeBacktest(1, 1)).toBeNull();
    expect(anosMinimosDeBacktest(10, 0)).toBeNull();
    expect(anosMinimosDeBacktest(10, -1)).toBeNull();
  });
});

describe("Sharpe com desconto por múltiplos testes (Harvey & Liu, Bonferroni)", () => {
  it("feito à mão: SR 1 em 10 anos, 10 tentativas", () => {
    // t = 1 × √10 = 3,1623; p = 2(1 − Φ(t)) = 0,001565; p × 10 = 0,01565;
    // t' = Z⁻¹(1 − 0,01565/2) = 2,4167; SR' = t'/√10 = 0,7642
    expect(sharpeComDesconto({ sharpeAnual: 1, anos: 10, tentativas: 10 })).toBeCloseTo(0.7642, 3);
    expect(sharpeComDesconto({ sharpeAnual: 1, anos: 10, tentativas: 1 })).toBeCloseTo(1, 6);
  });

  it("com tentativas demais o desconto zera o Sharpe", () => {
    expect(sharpeComDesconto({ sharpeAnual: 0.5, anos: 1, tentativas: 50 })).toBe(0);
    expect(sharpeComDesconto({ sharpeAnual: -0.5, anos: 1, tentativas: 5 })).toBeNull();
    expect(sharpeComDesconto({ sharpeAnual: 1, anos: 0, tentativas: 5 })).toBeNull();
  });
});

describe("avaliar as tentativas de uma estratégia", () => {
  const atual = {
    sharpeAnual: 1.5,
    observacoes: 2000,
    assimetria: 0,
    curtose: 3,
    barrasPorAno: 2190,
    anos: 2000 / 2190,
  };

  it("uma tentativa só: DSR igual ao PSR contra zero e sem MinBTL", () => {
    const a = avaliarTentativas(atual, [1.5]);
    expect(a.tentativas).toBe(1);
    expect(a.sharpeMaximoEsperado).toBe(0);
    expect(a.sharpeDeflacionado).toBeCloseTo(a.probabilidadeSharpe ?? -1, 12);
    expect(a.anosMinimos).toBeNull();
  });

  it("mais tentativas com Sharpes espalhados: o DSR cai abaixo do PSR", () => {
    const a = avaliarTentativas(atual, [1.5, -0.4, 0.3, 0.9, -1.2, 0.1]);
    expect(a.tentativas).toBe(6);
    expect(a.sharpeMaximoEsperado).toBeGreaterThan(0);
    expect(a.sharpeDeflacionado).toBeLessThan(a.probabilidadeSharpe ?? 0);
    expect(a.anosMinimos).toBeGreaterThan(0);
    expect(a.sharpeComDesconto).toBeLessThan(1.5);
  });

  it("tentativas sem Sharpe contam no N; sem variância observável usa a do estimador", () => {
    const a = avaliarTentativas(atual, [1.5, null, null]);
    expect(a.tentativas).toBe(3);
    expect(a.sharpeMaximoEsperado).toBeGreaterThan(0);
  });

  it("backtest sem Sharpe (sem volatilidade ou poucas barras): só a contagem", () => {
    const a = avaliarTentativas({ ...atual, sharpeAnual: null }, [null, 1]);
    expect(a).toEqual({
      tentativas: 2,
      probabilidadeSharpe: null,
      sharpeDeflacionado: null,
      sharpeMaximoEsperado: null,
      anosMinimos: null,
      sharpeComDesconto: null,
    });
    expect(avaliarTentativas({ ...atual, observacoes: 1 }, [1.5]).probabilidadeSharpe).toBeNull();
  });
});
