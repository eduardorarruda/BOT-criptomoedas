import { describe, expect, it } from "vitest";
import {
  metricasEmTexto,
  simulacaoFinanciamentoEmTexto,
  tabelaEmTexto,
  visaoEmTexto,
  type InvestimentoEmTexto,
  type LancamentoEmTexto,
} from "./imobiliario-texto.js";

const vazio: InvestimentoEmTexto = {
  tipo: "aluguel",
  moeda: "BRL",
  valorAtual: null,
  cambioAtual: null,
  valorizacaoAnual: null,
  prazoMeses: null,
  valorCarta: null,
  taxaAdministracao: null,
  fundoReserva: null,
  contempladoEm: null,
  financiamento: null,
};

const lanc = (
  data: string,
  tipo: LancamentoEmTexto["tipo"],
  valor: string,
  extra: Partial<LancamentoEmTexto> = {},
) => ({
  data,
  tipo,
  categoria: "outros",
  valor,
  quantidade: null,
  cambio: null,
  ...extra,
});

describe("métricas em texto (contrato da API)", () => {
  it("converte e arredonda dinheiro aos centavos", () => {
    const m = metricasEmTexto(
      { ...vazio, valorAtual: "450000" },
      [
        lanc("2025-01-10", "aporte", "400000"),
        lanc("2025-06-10", "receita", "2000"),
        lanc("2025-07-10", "receita", "1000"),
      ],
      { dataBase: "2025-12-31", cdiAnual: 0.1 },
    );
    expect(m.investido).toBe("400000");
    expect(m.rendaMensalMedia).toBe("250");
    expect(m.patrimonioLiquido).toBe("450000");
    expect(m.resultadoBruto).toBe("53000");
    expect(m.fonteValorAtual).toBe("manual");
    expect(m.cdi!.taxaAnual).toBe(0.1);
    expect(m.cdi!.valorEquivalente).toMatch(/^\d+(\.\d{1,2})?$/);
    expect(m.cotas).toBeNull();
    expect(m.premissas.length).toBeGreaterThan(0);
    expect(typeof m.tirAnual).toBe("number");
  });

  it("FII com cotação automática e consórcio", () => {
    const fii = metricasEmTexto(
      { ...vazio, tipo: "fii" },
      [lanc("2025-01-02", "aporte", "1000", { quantidade: "10" })],
      { dataBase: "2025-02-01", precoCotacao: "101.234" },
    );
    expect(fii.fonteValorAtual).toBe("cotacao");
    expect(fii.valorAtual).toBe("1012.34");
    expect(fii.cotas).toEqual({
      quantidade: "10",
      precoMedio: "100",
      custoTotal: "1000",
      resultadoRealizado: "0",
    });
    const consorcio = metricasEmTexto(
      {
        ...vazio,
        tipo: "consorcio",
        valorCarta: "100000",
        prazoMeses: 100,
        taxaAdministracao: 0.15,
        fundoReserva: 0.05,
      },
      [lanc("2025-01-02", "aporte", "1200", { categoria: "parcela" })],
      { dataBase: "2025-02-01" },
    );
    expect(consorcio.consorcio).toMatchObject({
      parcelaEstimada: "1200",
      parcelasPagas: 1,
      saldoEstimado: "118800",
    });
  });

  it("financiamento e REIT em dólar", () => {
    const m = metricasEmTexto(
      {
        ...vazio,
        valorAtual: "500000",
        financiamento: {
          sistema: "PRICE",
          valorFinanciado: "300000",
          taxaAnual: 0.1,
          prazoMeses: 240,
          primeiraParcela: "2025-02-10",
          seguroFixoMensal: "40",
        },
      },
      [lanc("2025-01-10", "aporte", "200000")],
      { dataBase: "2025-04-10" },
    );
    expect(m.financiamento!.parcelasPagas).toBe(3);
    const reit = metricasEmTexto(
      { ...vazio, tipo: "reit", moeda: "USD", valorAtual: "55", cambioAtual: "5.4" },
      [lanc("2025-01-02", "aporte", "500", { quantidade: "10", cambio: "5" })],
      { dataBase: "2025-02-01" },
    );
    expect(reit.valorAtual).toBe("2970");
    expect(reit.valorAtualMoeda).toBe("550");
  });

  it("tabela com vencimentos e simulação SAC × Price", () => {
    const t = tabelaEmTexto({
      sistema: "SAC",
      valorFinanciado: "120000",
      taxaAnual: 0.12682503013197,
      prazoMeses: 12,
      primeiraParcela: "2025-01-31",
    });
    expect(t.linhas[0]).toMatchObject({
      mes: 1,
      vencimento: "2025-01-31",
      juros: "1200",
      parcelaTotal: "11200",
    });
    expect(t.linhas[1]!.vencimento).toBe("2025-02-28");
    expect(t.totalJuros).toBe("7800");
    const s = simulacaoFinanciamentoEmTexto({
      valorFinanciado: "100000",
      taxaAnual: 0.12682503013197,
      prazoMeses: 12,
    });
    expect(s.price.primeiraParcela).toBe("8884.88");
    expect(s.sac.linhas[0]!.vencimento).toBeNull();
  });

  it("visão consolidada", () => {
    const v = visaoEmTexto(
      [
        {
          tipo: "aluguel",
          metricas: {
            patrimonioLiquido: "300000",
            investido: "250000",
            rendaMensalLiquidaMedia: "1500",
            resultadoLiquido: "50000",
          },
        },
        { tipo: "fii", metricas: null },
      ],
      { dataBase: "2026-01-01", cdiAnual: null },
    );
    expect(v).toMatchObject({ patrimonio: "300000", rendaMensal: "1500", quantidade: 2, cdiAnual: null });
    expect(v.alocacao).toEqual([{ tipo: "aluguel", valor: "300000", fracao: 1 }]);
  });
});
