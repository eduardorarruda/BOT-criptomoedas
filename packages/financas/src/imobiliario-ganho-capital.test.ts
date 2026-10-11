import { dec } from "@zentrade/dominio";
import { describe, expect, it } from "vitest";
import { ErroParametroFinanceiro } from "./fluxo-caixa.js";
import {
  fatoresReducao,
  ganhoCapitalImovel,
  impostoProgressivo,
  ISENCOES_GANHO_CAPITAL_IMOVEL,
  TABELA_GANHO_CAPITAL_PF,
  type TabelaGanhoCapital,
} from "./imobiliario-ganho-capital.js";

describe("tabela progressiva do ganho de capital (pessoa física)", () => {
  it("é datada, tem fonte e as quatro faixas da Lei 13.259/2016", () => {
    expect(TABELA_GANHO_CAPITAL_PF.vigenteDesde).toBe("2017-01-01");
    expect(TABELA_GANHO_CAPITAL_PF.consultadaEm).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(TABELA_GANHO_CAPITAL_PF.fonte).toMatch(/13\.259/);
    expect(TABELA_GANHO_CAPITAL_PF.faixas.map((f) => f.aliquota)).toEqual([0.15, 0.175, 0.2, 0.225]);
  });

  it("até 5 milhões: 15% sobre tudo", () => {
    const r = impostoProgressivo(dec(100000));
    expect(r.imposto.toFixed(2)).toBe("15000.00");
    expect(r.aliquotaEfetiva).toBeCloseTo(0.15, 12);
  });

  it("acima de 5 milhões cada faixa paga a sua alíquota (só sobre a parcela dela)", () => {
    // 5M × 15% + 1M × 17,5% = 750.000 + 175.000
    expect(impostoProgressivo(dec(6000000)).imposto.toFixed(2)).toBe("925000.00");
    // 750k + 875k + 4M (20% de 20M) + 22,5% de 10M
    const r = impostoProgressivo(dec(40000000));
    expect(r.imposto.toFixed(2)).toBe(String(750000 + 875000 + 4000000 + 2250000) + ".00");
    expect(r.porFaixa).toHaveLength(4);
    expect(r.porFaixa[3]!.base.toFixed(0)).toBe("10000000");
  });

  it("ganho zero ou negativo não paga imposto", () => {
    expect(impostoProgressivo(dec(0)).imposto.toString()).toBe("0");
    expect(impostoProgressivo(dec(-10)).aliquotaEfetiva).toBeNull();
  });

  it("aceita outra tabela (configurável) para quando a lei mudar", () => {
    const nova: TabelaGanhoCapital = {
      vigenteDesde: "2030-01-01",
      consultadaEm: "2030-01-02",
      fonte: "hipotética",
      faixas: [
        { ate: dec(1000), aliquota: 0.1 },
        { ate: null, aliquota: 0.3 },
      ],
    };
    expect(impostoProgressivo(dec(2000), nova).imposto.toFixed(2)).toBe("400.00");
  });

  it("recusa tabela sem faixa final aberta ou fora de ordem", () => {
    const ruim = { ...TABELA_GANHO_CAPITAL_PF, faixas: [{ ate: dec(10), aliquota: 0.1 }] };
    expect(() => impostoProgressivo(dec(1), ruim)).toThrow(ErroParametroFinanceiro);
    const desordem = {
      ...TABELA_GANHO_CAPITAL_PF,
      faixas: [
        { ate: dec(10), aliquota: 0.1 },
        { ate: dec(5), aliquota: 0.1 },
        { ate: null, aliquota: 0.2 },
      ],
    };
    expect(() => impostoProgressivo(dec(1), desordem)).toThrow(/ordem/);
  });
});

describe("fatores de redução (Lei 11.196/2005, art. 40)", () => {
  it("compra depois de 2005: só FR2 = 1/1,0035^m2", () => {
    const f = fatoresReducao("2015-03-10", "2025-03-20");
    expect(f.fr1).toBe(1);
    expect(f.m2).toBe(120);
    expect(f.fr2).toBeCloseTo(1 / Math.pow(1.0035, 120), 12);
  });

  it("compra antes de 1996: FR1 conta a partir de jan/1996 até nov/2005", () => {
    const f = fatoresReducao("1990-06-01", "2006-01-15");
    expect(f.m1).toBe(118);
    expect(f.fr1).toBeCloseTo(1 / Math.pow(1.006, 118), 12);
    expect(f.m2).toBe(1); // dez/2005 → jan/2006
  });

  it("compra em 2000: FR1 desde a compra", () => {
    expect(fatoresReducao("2000-11-20", "2005-12-01").m1).toBe(60);
  });

  it("venda antes da compra é erro", () => {
    expect(() => fatoresReducao("2020-01-01", "2019-01-01")).toThrow(/venda/);
  });
});

const base = {
  valorVenda: dec(800000),
  custosVenda: dec(40000),
  custoAquisicao: dec(500000),
  benfeitorias: dec(60000),
  dataAquisicao: "2018-01-10",
  dataVenda: "2026-01-10",
};

describe("ganho de capital na venda de um imóvel", () => {
  it("ganho = venda − corretagem − (custo + benfeitorias), reduzido por FR2", () => {
    const r = ganhoCapitalImovel(base);
    expect(r.ganhoBruto.toFixed(2)).toBe("200000.00");
    const fr2 = 1 / Math.pow(1.0035, 96);
    expect(r.ganhoTributavel.toNumber()).toBeCloseTo(200000 * fr2, 2);
    expect(r.imposto.toNumber()).toBeCloseTo(200000 * fr2 * 0.15, 2);
    expect(r.isento).toBe(false);
    expect(r.premissas.length).toBeGreaterThan(2);
  });

  it("sem fatores de redução, se pedido", () => {
    const r = ganhoCapitalImovel({ ...base, aplicarFatoresReducao: false });
    expect(r.imposto.toFixed(2)).toBe("30000.00");
  });

  it("prejuízo: sem imposto", () => {
    const r = ganhoCapitalImovel({ ...base, valorVenda: dec(500000) });
    expect(r.ganhoBruto.isNegative()).toBe(true);
    expect(r.imposto.toString()).toBe("0");
  });

  it("isenção declarada: único imóvel vendido por até 440 mil", () => {
    const r = ganhoCapitalImovel({
      ...base,
      valorVenda: dec(440000),
      custoAquisicao: dec(200000),
      unicoImovel: true,
    });
    expect(r.isento).toBe(true);
    expect(r.imposto.toString()).toBe("0");
    expect(r.motivosIsencao[0]).toMatch(/440/);
  });

  it("único imóvel acima de 440 mil não é isento", () => {
    expect(ganhoCapitalImovel({ ...base, unicoImovel: true }).isento).toBe(false);
  });

  it("reinvestimento em residencial em 180 dias isenta na proporção", () => {
    const r = ganhoCapitalImovel({ ...base, aplicarFatoresReducao: false, valorReinvestido: dec(400000) });
    // 400 mil de 800 mil reinvestidos: metade do ganho fica isenta
    expect(r.imposto.toFixed(2)).toBe("15000.00");
    const tudo = ganhoCapitalImovel({ ...base, valorReinvestido: dec(900000) });
    expect(tudo.isento).toBe(true);
  });

  it("bem de pequeno valor (até 35 mil) é isento", () => {
    const r = ganhoCapitalImovel({
      ...base,
      valorVenda: dec(35000),
      custosVenda: dec(0),
      custoAquisicao: dec(10000),
      benfeitorias: dec(0),
    });
    expect(r.isento).toBe(true);
  });

  it("comprado até 1969: isento; entre 1970 e 1988: redução de 5% por ano", () => {
    expect(ganhoCapitalImovel({ ...base, dataAquisicao: "1969-12-31" }).isento).toBe(true);
    const r = ganhoCapitalImovel({ ...base, dataAquisicao: "1980-05-01", aplicarFatoresReducao: false });
    // (1989 − 1980) × 5% = 45% de redução
    expect(r.ganhoTributavel.toFixed(2)).toBe("110000.00");
    expect(r.reducoes[0]!.percentual).toBeCloseTo(0.45, 12);
  });

  it("documenta as isenções conhecidas com a base legal", () => {
    expect(ISENCOES_GANHO_CAPITAL_IMOVEL.length).toBeGreaterThanOrEqual(4);
    for (const i of ISENCOES_GANHO_CAPITAL_IMOVEL) expect(i.baseLegal.length).toBeGreaterThan(5);
  });

  it("valida os valores", () => {
    expect(() => ganhoCapitalImovel({ ...base, valorVenda: dec(-1) })).toThrow(ErroParametroFinanceiro);
    expect(() => ganhoCapitalImovel({ ...base, dataVenda: "2026-02-30" })).toThrow(/data inválida/);
  });
});
