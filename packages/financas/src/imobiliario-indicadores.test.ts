import { dec } from "@zentrade/dominio";
import { describe, expect, it } from "vitest";
import { ErroParametroFinanceiro } from "./fluxo-caixa.js";
import {
  capRate,
  cashOnCash,
  cotasParaRenda,
  dividendYield,
  receitaTemporada,
  rendaFii,
  rendimentoMensalLiquido,
  resultadoFlip,
  taxaValorizacaoAnual,
  valorizacaoComposta,
  yieldBruto,
  yieldLiquido,
} from "./imobiliario-indicadores.js";

describe("cap rate, cash-on-cash e yields", () => {
  it("cap rate = NOI anual / valor do imóvel (24 mil / 400 mil = 6%)", () => {
    expect(capRate(dec(24000), dec(400000))).toBeCloseTo(0.06, 12);
    expect(capRate(dec(1), dec(0))).toBeNull();
  });

  it("cash-on-cash = fluxo de caixa anual / capital próprio", () => {
    expect(cashOnCash(dec(9000), dec(150000))).toBeCloseTo(0.06, 12);
    expect(cashOnCash(dec(-3000), dec(100000))).toBeCloseTo(-0.03, 12);
    expect(cashOnCash(dec(1), dec(0))).toBeNull();
  });

  it("yield bruto = aluguel × 12 / valor (2.000 em 400 mil = 6% a.a.)", () => {
    expect(yieldBruto(dec(2000), dec(400000))).toBeCloseTo(0.06, 12);
  });

  it("yield líquido desconta vacância, administração e despesas", () => {
    const y = yieldLiquido(
      { aluguelMensal: dec(2000), vacancia: 1 / 12, taxaAdministracao: 0.1, despesas: { iptu: dec(100) } },
      dec(400000),
    );
    // 2000 × 11/12 = 1833,33; adm 10% = 183,33; − IPTU 100 → 1550 × 12 / 400000
    expect(y).toBeCloseTo((1550 * 12) / 400000, 6);
  });
});

describe("rendimento mensal líquido de aluguel", () => {
  it("sem vacância nem despesas é o próprio aluguel", () => {
    const r = rendimentoMensalLiquido({ aluguelMensal: dec(1500) });
    expect(r.liquido.toString()).toBe("1500");
    expect(r.perdaVacancia.toString()).toBe("0");
  });

  it("detalha cada desconto", () => {
    const r = rendimentoMensalLiquido({
      aluguelMensal: dec(3000),
      vacancia: 0.1,
      taxaAdministracao: 0.08,
      despesas: {
        condominio: dec(0),
        iptu: dec(120),
        manutencao: dec(80),
        seguro: dec(30),
        outras: dec(10),
      },
    });
    expect(r.perdaVacancia.toFixed(2)).toBe("300.00");
    expect(r.receitaEfetiva.toFixed(2)).toBe("2700.00");
    expect(r.administracao.toFixed(2)).toBe("216.00");
    expect(r.despesas.toFixed(2)).toBe("240.00");
    expect(r.liquido.toFixed(2)).toBe("2244.00");
  });

  it("recusa vacância acima de 100% e aluguel negativo", () => {
    expect(() => rendimentoMensalLiquido({ aluguelMensal: dec(1), vacancia: 1.2 })).toThrow(
      ErroParametroFinanceiro,
    );
    expect(() => rendimentoMensalLiquido({ aluguelMensal: dec(-1) })).toThrow(/negativo/);
  });
});

describe("temporada", () => {
  it("diária × noites ocupadas − plataforma − custo por noite − despesas", () => {
    const r = receitaTemporada({
      diaria: dec(300),
      ocupacao: 0.6,
      taxaPlataforma: 0.15,
      custoPorNoite: dec(40),
      despesasMensais: dec(500),
    });
    expect(r.noitesOcupadas).toBe(18); // 60% de 30
    expect(r.receitaBruta.toFixed(2)).toBe("5400.00");
    expect(r.taxaPlataforma.toFixed(2)).toBe("810.00");
    expect(r.custosVariaveis.toFixed(2)).toBe("720.00");
    expect(r.liquido.toFixed(2)).toBe("3370.00");
  });

  it("aceita meses de outro tamanho e ocupação fracionária de noites", () => {
    const r = receitaTemporada({ diaria: dec(100), ocupacao: 0.5, diasNoMes: 31 });
    expect(r.noitesOcupadas).toBe(15.5);
    expect(r.liquido.toFixed(2)).toBe("1550.00");
  });
});

describe("valorização", () => {
  it("composta: 500 mil a 5% a.a. por 10 anos = 814.447,31", () => {
    expect(valorizacaoComposta(dec(500000), 0.05, 10).toFixed(2)).toBe("814447.31");
  });

  it("fração de ano usa expoente fracionário", () => {
    expect(valorizacaoComposta(dec(100), 0.21, 0.5).toFixed(6)).toBe("110.000000");
  });

  it("taxa anual implícita (CAGR) entre dois valores", () => {
    expect(taxaValorizacaoAnual(dec(500000), dec("814447.31"), 10)).toBeCloseTo(0.05, 8);
    expect(() => taxaValorizacaoAnual(dec(0), dec(1), 1)).toThrow(ErroParametroFinanceiro);
    expect(() => taxaValorizacaoAnual(dec(1), dec(1), 0)).toThrow(/anos/);
  });
});

describe("FII", () => {
  it("renda mensal de 200 cotas a R$ 0,85 = R$ 170,00", () => {
    expect(rendaFii(200, dec("0.85")).toFixed(2)).toBe("170.00");
  });

  it("DY anual = rendimentos de 12 meses por cota / preço", () => {
    expect(dividendYield(dec("10.20"), dec(100))).toBeCloseTo(0.102, 12);
    expect(dividendYield(dec(1), dec(0))).toBeNull();
  });

  it("cotas para uma renda alvo arredondam para cima", () => {
    expect(cotasParaRenda(dec(1000), dec("0.85"))).toBe(1177);
    expect(cotasParaRenda(dec(170), dec("0.85"))).toBe(200);
    expect(() => cotasParaRenda(dec(100), dec(0))).toThrow(/rendimento/);
  });

  it("recusa cotas fracionárias", () => {
    expect(() => rendaFii(1.5, dec(1))).toThrow(/cotas/);
  });
});

describe("revenda (flip)", () => {
  const r = resultadoFlip({
    precoCompra: dec(300000),
    custosAquisicao: dec(12000),
    reforma: dec(40000),
    custosMensais: dec(800),
    prazoMeses: 8,
    precoVenda: dec(420000),
    corretagemVenda: 0.05,
    impostoEstimado: dec(5000),
  });

  it("soma o investido e desconta a corretagem da venda", () => {
    expect(r.investimentoTotal.toFixed(2)).toBe("358400.00");
    expect(r.receitaLiquidaVenda.toFixed(2)).toBe("399000.00");
    expect(r.resultadoBruto.toFixed(2)).toBe("40600.00");
    expect(r.resultadoLiquido.toFixed(2)).toBe("35600.00");
  });

  it("margem e rentabilidade mensal equivalente", () => {
    expect(r.margemSobreInvestido).toBeCloseTo(35600 / 358400, 10);
    expect(r.rentabilidadeMensal).toBeCloseTo(Math.pow(1 + 35600 / 358400, 1 / 8) - 1, 10);
  });

  it("prejuízo aparece negativo", () => {
    const p = resultadoFlip({ ...entradaFlip(), precoVenda: dec(200000) });
    expect(p.resultadoLiquido.isNegative()).toBe(true);
  });
});

function entradaFlip() {
  return {
    precoCompra: dec(300000),
    custosAquisicao: dec(0),
    reforma: dec(0),
    custosMensais: dec(0),
    prazoMeses: 6,
    precoVenda: dec(300000),
    corretagemVenda: 0,
  };
}
