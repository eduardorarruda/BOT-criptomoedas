import { dec } from "@zentrade/dominio";
import { describe, expect, it } from "vitest";
import { saldoDevedorApos, tabelaAmortizacao, type ParametrosFinanciamento } from "./amortizacao.js";
import { ErroParametroFinanceiro, taxaAnualDeMensalFracao } from "./fluxo-caixa.js";

const UM_POR_CENTO_AM = taxaAnualDeMensalFracao(0.01);

const price: ParametrosFinanciamento = {
  sistema: "PRICE",
  valorFinanciado: dec(100000),
  taxaAnual: UM_POR_CENTO_AM,
  prazoMeses: 12,
};

describe("Tabela Price", () => {
  const t = tabelaAmortizacao(price);

  it("converte a taxa anual efetiva para 1% a.m.", () => {
    expect(t.taxaMensal).toBeCloseTo(0.01, 14);
  });

  it("prestação constante de R$ 8.884,88 (100 mil, 1% a.m., 12 meses)", () => {
    expect(t.linhas).toHaveLength(12);
    expect(t.linhas[0]!.prestacao.toFixed(2)).toBe("8884.88");
    expect(t.linhas[5]!.prestacao.toFixed(2)).toBe("8884.88");
  });

  it("primeira linha: juros de 1.000,00 e amortização de 7.884,88", () => {
    const l = t.linhas[0]!;
    expect([l.mes, l.saldoInicial.toFixed(2), l.juros.toFixed(2), l.amortizacao.toFixed(2)]).toEqual([
      1,
      "100000.00",
      "1000.00",
      "7884.88",
    ]);
    expect(l.saldoFinal.toFixed(2)).toBe("92115.12");
  });

  it("a última parcela zera o saldo (ajuste dos centavos fica nela)", () => {
    const u = t.linhas[11]!;
    expect(u.saldoFinal.toString()).toBe("0");
    expect(u.amortizacao.toFixed(2)).toBe("8796.88");
    expect(u.prestacao.toFixed(2)).toBe("8884.85");
  });

  it("totais batem: amortizado = financiado; juros = 6.618,53", () => {
    expect(t.totalAmortizado.toFixed(2)).toBe("100000.00");
    expect(t.totalJuros.toFixed(2)).toBe("6618.53");
    expect(t.totalPago.toFixed(2)).toBe("106618.53");
  });

  it("sem seguros nem tarifas, o CET é a própria taxa (dentro dos centavos)", () => {
    expect(t.cetMensal!).toBeCloseTo(0.01, 6);
    expect(t.cetAnual!).toBeCloseTo(UM_POR_CENTO_AM, 5);
  });

  it("juros caem e amortização sobe mês a mês", () => {
    for (let i = 1; i < 11; i++) {
      expect(t.linhas[i]!.juros.lt(t.linhas[i - 1]!.juros)).toBe(true);
      expect(t.linhas[i]!.amortizacao.gt(t.linhas[i - 1]!.amortizacao)).toBe(true);
    }
  });

  it("taxa zero divide o valor em parcelas iguais", () => {
    const z = tabelaAmortizacao({ ...price, taxaAnual: 0, valorFinanciado: dec(1000), prazoMeses: 3 });
    expect(z.linhas.map((l) => l.prestacao.toFixed(2))).toEqual(["333.33", "333.33", "333.34"]);
    expect(z.totalJuros.toString()).toBe("0");
  });
});

describe("Tabela SAC", () => {
  const t = tabelaAmortizacao({ ...price, sistema: "SAC", valorFinanciado: dec(120000) });

  it("amortização constante de 10.000 e juros sobre o saldo", () => {
    expect(t.linhas.every((l) => l.amortizacao.toFixed(2) === "10000.00")).toBe(true);
    expect(t.primeiraParcela.toFixed(2)).toBe("11200.00");
    expect(t.ultimaParcela.toFixed(2)).toBe("10100.00");
  });

  it("juros totais de 7.800,00 (1% sobre 120+110+…+10 mil)", () => {
    expect(t.totalJuros.toFixed(2)).toBe("7800.00");
  });

  it("parcelas decrescem e o saldo termina em zero", () => {
    expect(t.linhas[11]!.saldoFinal.toString()).toBe("0");
    for (let i = 1; i < 12; i++) expect(t.linhas[i]!.prestacao.lt(t.linhas[i - 1]!.prestacao)).toBe(true);
  });

  it("amortização que não divide exato deixa o resto na última parcela", () => {
    const r = tabelaAmortizacao({ ...price, sistema: "SAC", valorFinanciado: dec(1000), prazoMeses: 3 });
    expect(r.linhas.map((l) => l.amortizacao.toFixed(2))).toEqual(["333.33", "333.33", "333.34"]);
  });

  it("SAC paga menos juros que Price nas mesmas condições", () => {
    const p = tabelaAmortizacao({ ...price, valorFinanciado: dec(120000) });
    expect(t.totalJuros.lt(p.totalJuros)).toBe(true);
  });
});

describe("seguros, taxa de administração e CET", () => {
  const t = tabelaAmortizacao({
    ...price,
    sistema: "SAC",
    valorFinanciado: dec(120000),
    seguroTaxaMensalSaldo: 0.0003,
    seguroFixoMensal: dec("25.50"),
    taxaAdministracaoMensal: dec(25),
    custosIniciais: dec(3000),
  });

  it("seguro MIP sobre o saldo + seguro fixo + taxa entram na parcela total", () => {
    const l = t.linhas[0]!;
    expect(l.seguros.toFixed(2)).toBe("61.50"); // 0,03% de 120.000 = 36,00 + 25,50
    expect(l.taxaAdministracao.toFixed(2)).toBe("25.00");
    expect(l.parcelaTotal.toFixed(2)).toBe("11286.50");
  });

  it("CET fica acima da taxa de juros", () => {
    expect(t.cetMensal!).toBeGreaterThan(0.01);
    expect(t.cetAnual!).toBeGreaterThan(UM_POR_CENTO_AM);
  });

  it("totais de seguros e taxas somam as linhas", () => {
    const seguros = t.linhas.reduce((s, l) => s.plus(l.seguros), dec(0));
    expect(t.totalSeguros.eq(seguros)).toBe(true);
    expect(t.totalTaxas.toFixed(2)).toBe("300.00");
  });
});

describe("financiamento longo (30 anos)", () => {
  const t = tabelaAmortizacao({
    sistema: "PRICE",
    valorFinanciado: dec(300000),
    taxaAnual: 0.09,
    prazoMeses: 360,
  });

  it("parcela de R$ 2.338,45 a 9% a.a. efetivos", () => {
    expect(t.primeiraParcela.toFixed(2)).toBe("2338.45");
    expect(t.linhas[359]!.saldoFinal.toString()).toBe("0");
  });

  it("saldo devedor depois de N parcelas", () => {
    expect(saldoDevedorApos(t, 0).toFixed(2)).toBe("300000.00");
    expect(saldoDevedorApos(t, 360).toString()).toBe("0");
    expect(saldoDevedorApos(t, 999).toString()).toBe("0");
    expect(saldoDevedorApos(t, 120).eq(t.linhas[119]!.saldoFinal)).toBe(true);
  });
});

describe("validação", () => {
  it("recusa valor, prazo e taxas inválidos", () => {
    expect(() => tabelaAmortizacao({ ...price, valorFinanciado: dec(0) })).toThrow(ErroParametroFinanceiro);
    expect(() => tabelaAmortizacao({ ...price, prazoMeses: 0 })).toThrow(/prazo/);
    expect(() => tabelaAmortizacao({ ...price, prazoMeses: 2.5 })).toThrow(/prazo/);
    expect(() => tabelaAmortizacao({ ...price, prazoMeses: 1000 })).toThrow(/prazo/);
    expect(() => tabelaAmortizacao({ ...price, taxaAnual: -0.5 })).toThrow(/taxa/);
    expect(() => tabelaAmortizacao({ ...price, seguroTaxaMensalSaldo: -0.1 })).toThrow(/seguro/);
    expect(() => tabelaAmortizacao({ ...price, seguroFixoMensal: dec(-1) })).toThrow(/negativo/);
  });
});
