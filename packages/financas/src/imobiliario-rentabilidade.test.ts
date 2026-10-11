import { dec } from "@zentrade/dominio";
import { describe, expect, it } from "vitest";
import { simularFii } from "./imobiliario-fii.js";
import { rentabilidadeImovel, type ParametrosRentabilidade } from "./imobiliario-rentabilidade.js";

const base: ParametrosRentabilidade = {
  valorCompra: dec(400000),
  custosAquisicao: dec(0),
  rendaMensal: dec(2000),
  reajusteAnual: 0,
  valorizacaoAnual: 0,
  horizonteAnos: 10,
  taxaDescontoAnual: 0.06,
};

describe("rentabilidade de um imóvel", () => {
  it("aluguel de 0,5% a.m. sem custos nem valorização rende 6% a.a. de TIR", () => {
    const r = rentabilidadeImovel(base);
    expect(r.capitalProprio.toFixed(2)).toBe("400000.00");
    expect(r.tirAnual!).toBeCloseTo(0.06, 9);
    expect(r.capRate!).toBeCloseTo(0.06, 12);
    expect(r.yieldBruto!).toBeCloseTo(0.06, 12);
    expect(r.vpl.abs().toNumber()).toBeLessThan(1e-6);
    expect(r.fluxos).toHaveLength(11);
    expect(r.payback).toBeCloseTo(9 + 184000 / 424000, 9);
  });

  it("custos, vacância e administração reduzem NOI, yield líquido e TIR", () => {
    const r = rentabilidadeImovel({
      ...base,
      custosAquisicao: dec(16000),
      vacancia: 1 / 12,
      taxaAdministracao: 0.1,
      despesasMensais: dec(150),
      custoVenda: 0.05,
    });
    expect(r.rendaLiquidaMensalInicial.toFixed(2)).toBe("1500.00");
    expect(r.noiAnualInicial.toFixed(2)).toBe("18000.00");
    expect(r.yieldLiquido!).toBeCloseTo(18000 / 400000, 12);
    expect(r.tirAnual!).toBeLessThan(0.06);
    expect(r.valorVendaLiquido.toFixed(2)).toBe("380000.00");
  });

  it("valorização e reajuste entram ano a ano", () => {
    const r = rentabilidadeImovel({ ...base, reajusteAnual: 0.1, valorizacaoAnual: 0.05, horizonteAnos: 2 });
    expect(r.anos[1]!.receitaLiquida.toFixed(2)).toBe("26400.00");
    expect(r.anos[1]!.valorImovel.toFixed(2)).toBe("441000.00");
  });

  it("financiamento: capital próprio = entrada + custos; parcelas saem do fluxo", () => {
    const r = rentabilidadeImovel({
      ...base,
      entrada: dec(100000),
      financiamento: { sistema: "SAC", taxaAnual: 0.1, prazoMeses: 360 },
    });
    expect(r.capitalProprio.toFixed(2)).toBe("100000.00");
    expect(r.anos[0]!.parcelas.gt(24000)).toBe(true);
    expect(r.anos[0]!.fluxoCaixa.isNegative()).toBe(true);
    expect(r.cashOnCashAno1!).toBeLessThan(0);
    expect(r.anos[9]!.saldoDevedor.gt(0)).toBe(true);
    expect(r.premissas.length).toBeGreaterThan(2);
  });

  it("valida horizonte e entrada", () => {
    expect(() => rentabilidadeImovel({ ...base, horizonteAnos: 0 })).toThrow(/horizonte/);
    expect(() => rentabilidadeImovel({ ...base, entrada: dec(1000) })).toThrow(/financiamento/);
  });
});

describe("simulador de FII", () => {
  it("renda mensal, DY e investimento para X cotas", () => {
    const r = simularFii({
      cotas: 200,
      precoCota: dec(100),
      rendimentoMensalPorCota: dec("0.85"),
      meses: 12,
    });
    expect(r.investimento.toFixed(2)).toBe("20000.00");
    expect(r.rendaMensal.toFixed(2)).toBe("170.00");
    expect(r.dyMensal).toBeCloseTo(0.0085, 12);
    expect(r.dyAnual).toBeCloseTo(0.102, 12);
    expect(r.meses).toHaveLength(12);
    expect(r.meses[11]!.cotas).toBe(200);
    expect(r.meses[11]!.rendaAcumulada.toFixed(2)).toBe("2040.00");
  });

  it("reinvestindo, compra cotas inteiras e guarda a sobra", () => {
    const r = simularFii({
      cotas: 100,
      precoCota: dec(100),
      rendimentoMensalPorCota: dec(1),
      meses: 3,
      reinvestir: true,
    });
    expect(r.meses.map((m) => m.cotas)).toEqual([101, 102, 103]);
    expect(r.meses[2]!.caixa.toFixed(2)).toBe("3.00");
    expect(r.meses[2]!.patrimonio.toFixed(2)).toBe("10303.00");
  });

  it("calcula as cotas para uma renda alvo", () => {
    const r = simularFii({
      cotas: 1,
      precoCota: dec(100),
      rendimentoMensalPorCota: dec("0.85"),
      meses: 1,
      rendaAlvo: dec(1000),
    });
    expect(r.cotasParaAlvo).toBe(1177);
    expect(r.investimentoParaAlvo!.toFixed(2)).toBe("117700.00");
  });

  it("valida o preço", () => {
    expect(() =>
      simularFii({ cotas: 1, precoCota: dec(0), rendimentoMensalPorCota: dec(1), meses: 1 }),
    ).toThrow(/preço/);
  });
});
