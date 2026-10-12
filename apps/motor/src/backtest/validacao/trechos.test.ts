import { dec } from "@zentrade/dominio";
import { describe, expect, it } from "vitest";
import { compararAmostras, corteDaAmostra, validarAmostra } from "./amostra.js";
import { resumoDoTrecho, type DadosValidacao } from "./trechos.js";

const pontos = (valores: number[]) => valores.map((p, i) => ({ em: (i + 1) * 10, patrimonio: dec(p) }));

const dados = (extra: Partial<DadosValidacao> = {}): DadosValidacao => ({
  saldoInicial: dec(1000),
  // em: 10, 20, …, 80
  curva: pontos([1000, 1010, 1030, 1020, 1050, 1040, 1000, 990]),
  buyHold: pontos([1000, 1020, 1040, 1060, 1080, 1100, 1120, 1140]),
  operacoes: [
    { abertaEm: 10, fechadaEm: 30, resultado: dec(30) },
    { abertaEm: 40, fechadaEm: 50, resultado: dec(30) },
    { abertaEm: 50, fechadaEm: 70, resultado: dec(-50) },
  ],
  porAno: 365,
  ...extra,
});

describe("resumo de um trecho", () => {
  it("retorno sobre o patrimônio de logo antes do trecho; operações pelo fechamento", () => {
    // trecho [30, 60): pontos 1030, 1020, 1050; base = 1010 (em 20)
    const r = resumoDoTrecho(dados(), { inicio: 30, fim: 60 });
    expect(r.retorno).toBeCloseTo(1050 / 1010 - 1, 12);
    expect(r.operacoes).toBe(2);
    expect(r.taxaAcerto).toBe(1);
    expect(r.maiorQuedaPercentual).toBeCloseTo(10 / 1030, 12);
    expect(r.buyHoldRetorno).toBeCloseTo(1080 / 1020 - 1, 12);
    expect(r.sharpe).not.toBeNull();
  });

  it("primeiro trecho usa o saldo inicial como base; trecho vazio dá zero", () => {
    expect(resumoDoTrecho(dados(), { inicio: 0, fim: 25 }).retorno).toBeCloseTo(0.01, 12);
    const vazio = resumoDoTrecho(dados(), { inicio: 1000, fim: 2000 });
    expect(vazio).toMatchObject({ retorno: 0, operacoes: 0, taxaAcerto: null, sharpe: null });
  });
});

describe("dentro × fora da amostra", () => {
  it("corte em 70% do período", () => {
    expect(corteDaAmostra(0, 1000, 0.7)).toBe(700);
    expect(corteDaAmostra(100, 201, 0.5)).toBe(151);
  });

  it("lucro dentro e prejuízo fora: degradou, com o motivo em português claro", () => {
    const a = validarAmostra(dados(), 0, 90, 0.6);
    expect(a.corte).toBe(54);
    expect(a.dentro.retorno).toBeGreaterThan(0);
    expect(a.fora.retorno).toBeLessThan(0);
    expect(a.degradou).toBe(true);
    expect(a.motivo).toMatch(/prejuízo fora/);
  });

  it("Sharpe fora abaixo da metade do de dentro também degrada; manter não degrada", () => {
    const t = { inicio: 0, fim: 1, maiorQuedaPercentual: 0, operacoes: 1, taxaAcerto: 1, buyHoldRetorno: 0 };
    const dentro = { ...t, retorno: 0.1, sharpe: 2 };
    expect(compararAmostras(dentro, { ...t, retorno: 0.01, sharpe: 0.9 })).toEqual({
      degradou: true,
      motivo: "o Sharpe fora da amostra caiu para menos da metade do de dentro",
    });
    expect(compararAmostras(dentro, { ...t, retorno: 0.05, sharpe: 1.5 })).toEqual({
      degradou: false,
      motivo: null,
    });
    expect(
      compararAmostras({ ...dentro, retorno: -0.1, sharpe: -1 }, { ...t, retorno: -0.1, sharpe: -1 })
        .degradou,
    ).toBe(false);
  });
});
