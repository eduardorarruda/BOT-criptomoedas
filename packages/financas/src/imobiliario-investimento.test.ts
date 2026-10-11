import { dec } from "@zentrade/dominio";
import { describe, expect, it } from "vitest";
import { ErroParametroFinanceiro } from "./fluxo-caixa.js";
import {
  parcelasDoFinanciamento,
  resumirInvestimentoImobiliario,
  type InvestimentoParaResumo,
  type LancamentoImobiliario,
} from "./imobiliario-investimento.js";

const lanc = (
  data: string,
  tipo: LancamentoImobiliario["tipo"],
  valor: number | string,
  categoria = "outros",
  extra: Partial<LancamentoImobiliario> = {},
): LancamentoImobiliario => ({ data, tipo, categoria, valor: dec(valor), ...extra });

const aluguel: InvestimentoParaResumo = {
  tipo: "aluguel",
  moeda: "BRL",
  lancamentos: [
    lanc("2024-01-10", "aporte", 400000, "compra"),
    lanc("2024-01-10", "aporte", 12000, "itbi"),
    lanc("2024-03-01", "receita", 2000, "aluguel"),
    lanc("2024-03-05", "despesa", 150, "iptu"),
  ],
};

describe("imóvel para renda", () => {
  it("sem valor atual nem valorização: vale o custo, e diz isso", () => {
    const r = resumirInvestimentoImobiliario(aluguel, { dataBase: "2024-04-01" });
    expect(r.fonteValorAtual).toBe("custo");
    expect(r.valorAtual.toFixed(2)).toBe("412000.00");
    expect(r.resultadoBruto.toFixed(2)).toBe("2000.00");
    expect(r.resultadoLiquido.toFixed(2)).toBe("1850.00");
    expect(r.encerrado).toBe(false);
  });

  it("valor atual informado tem prioridade", () => {
    const r = resumirInvestimentoImobiliario(
      { ...aluguel, valorAtual: dec(450000) },
      { dataBase: "2024-04-01" },
    );
    expect(r.fonteValorAtual).toBe("manual");
    expect(r.patrimonioLiquido.toFixed(2)).toBe("450000.00");
  });

  it("valorização estimada a partir do custo e da primeira compra", () => {
    const r = resumirInvestimentoImobiliario(
      { ...aluguel, valorizacaoAnual: 0.05 },
      { dataBase: "2025-01-09" },
    );
    expect(r.fonteValorAtual).toBe("valorizacao");
    expect(r.valorAtual.toNumber()).toBeCloseTo(412000 * Math.pow(1.05, 365 / 365), 0);
  });

  it("vendido: patrimônio zero e o resultado vem da venda", () => {
    const r = resumirInvestimentoImobiliario(
      { ...aluguel, lancamentos: [...aluguel.lancamentos, lanc("2024-12-01", "resgate", 480000, "venda")] },
      { dataBase: "2025-01-01", cdiAnual: 0.1 },
    );
    expect(r.encerrado).toBe(true);
    expect(r.fonteValorAtual).toBe("vendido");
    expect(r.patrimonioLiquido.toString()).toBe("0");
    expect(r.resultadoBruto.toFixed(2)).toBe("70000.00");
    expect(r.tirAnual!).toBeGreaterThan(0.1);
    expect(r.cdi).not.toBeNull();
  });
});

describe("financiamento cadastrado", () => {
  const financiado: InvestimentoParaResumo = {
    tipo: "aluguel",
    moeda: "BRL",
    valorAtual: dec(500000),
    lancamentos: [lanc("2025-01-05", "aporte", 100000, "entrada")],
    financiamento: {
      sistema: "SAC",
      valorFinanciado: dec(400000),
      taxaAnual: 0.1,
      prazoMeses: 360,
      primeiraParcela: "2025-02-05",
    },
  };

  it("parcelas vencidas até a data-base contam como pagas; o saldo vira dívida", () => {
    const r = resumirInvestimentoImobiliario(financiado, { dataBase: "2025-05-05" });
    expect(r.financiamento!.parcelasPagas).toBe(4);
    expect(r.dividaAtual.gt(dec(395000))).toBe(true);
    expect(r.dividaAtual.lt(dec(400000))).toBe(true);
    expect(r.patrimonioLiquido.toFixed(2)).toBe(dec(500000).minus(r.dividaAtual).toFixed(2));
    expect(r.parcelasPagas.gt(0)).toBe(true);
    expect(r.financiamento!.jurosPagos.gt(0)).toBe(true);
  });

  it("datas das parcelas mês a mês, presas ao fim do mês", () => {
    const p = parcelasDoFinanciamento({ ...financiado.financiamento!, primeiraParcela: "2025-01-31" });
    expect(p.slice(0, 3).map((x) => x.vencimento)).toEqual(["2025-01-31", "2025-02-28", "2025-03-31"]);
  });
});

describe("FII", () => {
  const fii: InvestimentoParaResumo = {
    tipo: "fii",
    moeda: "BRL",
    lancamentos: [
      lanc("2025-01-02", "aporte", "1000", "compra", { quantidade: dec(10) }),
      lanc("2025-02-02", "aporte", "1200", "compra", { quantidade: dec(10) }),
      lanc("2025-02-15", "receita", "17", "provento"),
      lanc("2025-03-15", "receita", "17", "provento"),
    ],
  };

  it("sem cotação: posição pelo preço médio", () => {
    const r = resumirInvestimentoImobiliario(fii, { dataBase: "2025-04-01" });
    expect(r.cotas!.quantidade.toString()).toBe("20");
    expect(r.cotas!.precoMedio!.toFixed(2)).toBe("110.00");
    expect(r.fonteValorAtual).toBe("custo");
    expect(r.valorAtual.toFixed(2)).toBe("2200.00");
  });

  it("cotação automática tem prioridade sobre o preço manual", () => {
    const r = resumirInvestimentoImobiliario(
      { ...fii, valorAtual: dec(100), precoCotacao: dec(120) },
      { dataBase: "2025-04-01" },
    );
    expect(r.fonteValorAtual).toBe("cotacao");
    expect(r.valorAtual.toFixed(2)).toBe("2400.00");
    expect(r.dividendYield!).toBeCloseTo(34 / 2400, 10);
  });

  it("preço manual por cota quando não há cotação", () => {
    const r = resumirInvestimentoImobiliario({ ...fii, valorAtual: dec(105) }, { dataBase: "2025-04-01" });
    expect(r.fonteValorAtual).toBe("manual");
    expect(r.valorAtual.toFixed(2)).toBe("2100.00");
  });
});

describe("REIT em dólar", () => {
  const reit: InvestimentoParaResumo = {
    tipo: "reit",
    moeda: "USD",
    valorAtual: dec(60),
    cambioAtual: dec("5.5"),
    lancamentos: [
      lanc("2025-01-02", "aporte", "500", "compra", { quantidade: dec(10), cambio: dec(5) }),
      lanc("2025-03-02", "receita", "10", "dividendo", { cambio: dec("5.2") }),
    ],
  };

  it("converte cada lançamento pelo câmbio do dia e o valor atual pelo câmbio atual", () => {
    const r = resumirInvestimentoImobiliario(reit, { dataBase: "2025-04-01" });
    expect(r.investido.toFixed(2)).toBe("2500.00");
    expect(r.rendaAcumulada.toFixed(2)).toBe("52.00");
    expect(r.valorAtual.toFixed(2)).toBe("3300.00");
    expect(r.valorAtualMoeda!.toFixed(2)).toBe("600.00");
  });

  it("lançamento em dólar sem câmbio é erro", () => {
    const sem = {
      ...reit,
      lancamentos: [lanc("2025-01-02", "aporte", "500", "compra", { quantidade: dec(1) })],
    };
    expect(() => resumirInvestimentoImobiliario(sem, { dataBase: "2025-04-01" })).toThrow(
      ErroParametroFinanceiro,
    );
  });

  it("sem câmbio atual usa o do último lançamento", () => {
    const r = resumirInvestimentoImobiliario({ ...reit, cambioAtual: null }, { dataBase: "2025-04-01" });
    expect(r.valorAtual.toFixed(2)).toBe("3120.00");
  });
});

describe("consórcio", () => {
  const consorcio: InvestimentoParaResumo = {
    tipo: "consorcio",
    moeda: "BRL",
    consorcio: { valorCarta: dec(300000), prazoMeses: 200, taxaAdministracao: 0.18, fundoReserva: 0.02 },
    lancamentos: [
      lanc("2025-01-10", "aporte", 1800, "parcela"),
      lanc("2025-02-10", "aporte", 1800, "parcela"),
      lanc("2025-02-20", "aporte", 30000, "lance"),
    ],
  };

  it("parcela estimada, parcelas pagas, lances e saldo", () => {
    const r = resumirInvestimentoImobiliario(consorcio, { dataBase: "2025-03-01" });
    const c = r.consorcio!;
    expect(c.parcelaEstimada.toFixed(2)).toBe("1800.00");
    expect(c.parcelasPagas).toBe(2);
    expect(c.lances.toFixed(2)).toBe("30000.00");
    expect(c.parcelasRestantes).toBe(198);
    expect(c.saldoEstimado.toFixed(2)).toBe("356400.00");
    expect(c.contemplado).toBe(false);
    expect(r.dividaAtual.toString()).toBe("0");
  });

  it("contemplado: o saldo a pagar vira dívida", () => {
    const r = resumirInvestimentoImobiliario(
      {
        ...consorcio,
        valorAtual: dec(300000),
        consorcio: { ...consorcio.consorcio!, contempladoEm: "2025-02-20" },
      },
      { dataBase: "2025-03-01" },
    );
    expect(r.consorcio!.contemplado).toBe(true);
    expect(r.dividaAtual.toFixed(2)).toBe("356400.00");
  });
});

describe("crowdfunding e na planta", () => {
  it("crowdfunding sem valor atual: capital ainda aplicado", () => {
    const r = resumirInvestimentoImobiliario(
      {
        tipo: "crowdfunding",
        moeda: "BRL",
        lancamentos: [
          lanc("2025-01-01", "aporte", 10000),
          lanc("2025-06-01", "resgate", 4000, "amortizacao"),
          lanc("2025-06-01", "receita", 600, "juros"),
        ],
      },
      { dataBase: "2025-07-01" },
    );
    expect(r.valorAtual.toFixed(2)).toBe("6000.00");
    expect(r.resultadoBruto.toFixed(2)).toBe("600.00");
  });

  it("na planta: aportes no tempo e premissas visíveis", () => {
    const r = resumirInvestimentoImobiliario(
      {
        tipo: "planta",
        moeda: "BRL",
        valorizacaoAnual: 0.08,
        lancamentos: [
          lanc("2025-01-01", "aporte", 50000, "sinal"),
          lanc("2025-07-01", "aporte", 20000, "parcela"),
        ],
      },
      { dataBase: "2026-01-01" },
    );
    expect(r.investido.toFixed(2)).toBe("70000.00");
    expect(r.premissas.join(" ")).toMatch(/valoriza/);
  });

  it("data-base inválida é erro", () => {
    expect(() => resumirInvestimentoImobiliario(aluguel, { dataBase: "ontem" })).toThrow(/data inválida/);
  });
});
