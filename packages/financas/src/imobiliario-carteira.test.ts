import { dec } from "@zentrade/dominio";
import { describe, expect, it } from "vitest";
import { ErroParametroFinanceiro } from "./fluxo-caixa.js";
import {
  consolidarCarteiraImobiliaria,
  posicaoCotas,
  resumirFluxos,
  type LancamentoEmReais,
} from "./imobiliario-carteira.js";
import { diaUtc } from "./imobiliario-comum.js";

const l = (
  data: string,
  tipo: LancamentoEmReais["tipo"],
  valor: number,
  extra: Partial<LancamentoEmReais> = {},
) => ({
  data: diaUtc(data),
  tipo,
  categoria: extra.categoria ?? "outros",
  valor: dec(valor),
  ...extra,
});

describe("resumo dos fluxos de um investimento", () => {
  const lancamentos = [
    l("2024-01-01", "aporte", 100000),
    l("2024-07-01", "receita", 3000),
    l("2024-12-01", "despesa", 500),
    l("2025-01-01", "receita", 3000),
    l("2025-01-10", "imposto", 200),
  ];

  it("soma por tipo e calcula resultado bruto e líquido", () => {
    const r = resumirFluxos({ lancamentos, patrimonioLiquido: dec(104000), dataBase: diaUtc("2025-01-01") });
    expect(r.investido.toFixed(2)).toBe("100000.00");
    expect(r.rendaAcumulada.toFixed(2)).toBe("6000.00");
    expect(r.despesas.toFixed(2)).toBe("500.00");
    expect(r.impostos.toString()).toBe("0"); // o imposto é depois da data-base
    expect(r.resultadoBruto.toFixed(2)).toBe("10000.00");
    expect(r.resultadoLiquido.toFixed(2)).toBe("9500.00");
  });

  it("TIR anual realizada pelos fluxos com data e o patrimônio na data-base", () => {
    const r = resumirFluxos({
      lancamentos: [l("2024-01-01", "aporte", 1000)],
      patrimonioLiquido: dec(1100),
      dataBase: diaUtc("2025-01-01"),
    });
    // 366 dias (2024 é bissexto): 1,1^(365/366) − 1
    expect(r.tirAnual!).toBeCloseTo(Math.pow(1.1, 365 / 366) - 1, 8);
  });

  it("compara com o CDI informado: o mesmo dinheiro, nas mesmas datas", () => {
    const r = resumirFluxos({
      lancamentos: [l("2025-01-01", "aporte", 1000), l("2025-07-02", "receita", 50)],
      patrimonioLiquido: dec(1000),
      dataBase: diaUtc("2026-01-01"),
      cdiAnual: 0.1,
    });
    const esperado = 1000 * 1.1 - 50 * Math.pow(1.1, 183 / 365);
    expect(r.cdi!.valorEquivalente.toNumber()).toBeCloseTo(esperado, 6);
    expect(r.cdi!.diferenca.toNumber()).toBeCloseTo(1000 - esperado, 6);
    expect(r.cdi!.taxaAnual).toBe(0.1);
  });

  it("sem CDI informado não compara", () => {
    expect(
      resumirFluxos({ lancamentos, patrimonioLiquido: dec(0), dataBase: diaUtc("2025-02-01") }).cdi,
    ).toBeNull();
  });

  it("parcelas pagas entram como saída de caixa", () => {
    const r = resumirFluxos({
      lancamentos: [l("2024-01-01", "aporte", 20000)],
      parcelas: [{ data: diaUtc("2024-02-01"), valor: dec(1000) }],
      patrimonioLiquido: dec(25000),
      dataBase: diaUtc("2024-03-01"),
    });
    expect(r.parcelasPagas.toFixed(2)).toBe("1000.00");
    expect(r.resultadoBruto.toFixed(2)).toBe("4000.00");
  });

  it("renda mensal média dos últimos 12 meses", () => {
    const r = resumirFluxos({
      lancamentos: [
        l("2024-01-01", "receita", 1200),
        l("2025-06-01", "receita", 1200),
        l("2025-06-01", "despesa", 120),
        l("2025-12-01", "receita", 1200),
      ],
      patrimonioLiquido: dec(0),
      dataBase: diaUtc("2026-01-01"),
    });
    expect(r.rendaMensalMedia.toFixed(2)).toBe("200.00");
    expect(r.rendaMensalLiquidaMedia.toFixed(2)).toBe("190.00");
    expect(r.renda12Meses.toFixed(2)).toBe("2400.00");
  });
});

describe("posição em cotas (preço médio)", () => {
  it("compra, compra de novo e vende pelo preço médio", () => {
    const p = posicaoCotas([
      l("2025-01-01", "aporte", 1000, { quantidade: dec(10) }),
      l("2025-02-01", "aporte", 1200, { quantidade: dec(10) }),
      l("2025-03-01", "resgate", 1300, { quantidade: dec(10) }),
      l("2025-03-15", "receita", 50),
    ]);
    expect(p.quantidade.toString()).toBe("10");
    expect(p.precoMedio!.toFixed(2)).toBe("110.00");
    expect(p.custoTotal.toFixed(2)).toBe("1100.00");
    expect(p.resultadoRealizado.toFixed(2)).toBe("200.00");
  });

  it("zerar a posição deixa o preço médio vazio", () => {
    const p = posicaoCotas([
      l("2025-01-01", "aporte", 1000, { quantidade: dec(10) }),
      l("2025-03-01", "resgate", 900, { quantidade: dec(10) }),
    ]);
    expect(p.quantidade.isZero()).toBe(true);
    expect(p.precoMedio).toBeNull();
    expect(p.resultadoRealizado.toFixed(2)).toBe("-100.00");
  });

  it("vender mais cotas do que há é erro", () => {
    expect(() =>
      posicaoCotas([
        l("2025-01-01", "aporte", 100, { quantidade: dec(1) }),
        l("2025-01-02", "resgate", 300, { quantidade: dec(3) }),
      ]),
    ).toThrow(ErroParametroFinanceiro);
  });
});

describe("carteira consolidada", () => {
  it("soma patrimônio, renda e aloca por tipo", () => {
    const c = consolidarCarteiraImobiliaria([
      {
        tipo: "aluguel",
        patrimonioLiquido: dec(300000),
        investido: dec(250000),
        rendaMensalLiquidaMedia: dec(1500),
        resultadoLiquido: dec(60000),
      },
      {
        tipo: "fii",
        patrimonioLiquido: dec(100000),
        investido: dec(90000),
        rendaMensalLiquidaMedia: dec(800),
        resultadoLiquido: dec(15000),
      },
      {
        tipo: "fii",
        patrimonioLiquido: dec(100000),
        investido: dec(95000),
        rendaMensalLiquidaMedia: dec(700),
        resultadoLiquido: dec(8000),
      },
      {
        tipo: "flip",
        patrimonioLiquido: dec(-5000),
        investido: dec(10000),
        rendaMensalLiquidaMedia: dec(0),
        resultadoLiquido: dec(-5000),
      },
    ]);
    expect(c.patrimonio.toFixed(2)).toBe("495000.00");
    expect(c.rendaMensal.toFixed(2)).toBe("3000.00");
    expect(c.alocacao.map((a) => [a.tipo, a.valor.toFixed(0)])).toEqual([
      ["aluguel", "300000"],
      ["fii", "200000"],
    ]);
    expect(c.alocacao[0]!.fracao).toBeCloseTo(0.6, 12);
    expect(c.quantidade).toBe(4);
  });

  it("carteira vazia", () => {
    const c = consolidarCarteiraImobiliaria([]);
    expect(c.patrimonio.toString()).toBe("0");
    expect(c.alocacao).toEqual([]);
  });
});
