import { describe, expect, it } from "vitest";
import type { InvestimentoPluggyApi } from "./pluggy.js";
import { diaDoProvedor, ehCaixinhaNubank, normalizarInvestimentos } from "./pluggy-normalizacao.js";

const base: InvestimentoPluggyApi = {
  id: "inv-1",
  name: "CDB BANCO X",
  type: "FIXED_INCOME",
  subtype: "CDB",
  status: "ACTIVE",
  balance: 10_350.12,
  amount: 10_420.5,
  amountOriginal: 10_000,
  amountProfit: 350.12,
  taxes: 70.38,
  taxes2: 0,
  rate: 110,
  rateType: "CDI",
  fixedAnnualRate: null,
  issuer: "Banco X S.A.",
  issuerCNPJ: "00.000.000/0001-91",
  purchaseDate: "2026-01-15T00:00:00.000Z",
  dueDate: "2028-01-15T00:00:00.000Z",
  date: "2026-10-10T00:00:00.000Z",
};

const HOJE = "2026-10-11";

describe("datas da Pluggy", () => {
  it("meia-noite UTC é data de calendário; com hora, vira o dia em São Paulo", () => {
    expect(diaDoProvedor("2026-01-15T00:00:00.000Z")).toBe("2026-01-15");
    expect(diaDoProvedor("2026-01-15T02:30:00.000Z")).toBe("2026-01-14");
    expect(diaDoProvedor("lixo")).toBeNull();
    expect(diaDoProvedor(null)).toBeNull();
  });
});

describe("normalização dos investimentos", () => {
  it("CDB pós-fixado: taxa, datas, bruto (amount), líquido (balance), IR e IOF", () => {
    const { titulos, ignorados } = normalizarInvestimentos([base], HOJE);
    expect(ignorados).toBe(0);
    expect(titulos[0]).toEqual({
      externoId: "inv-1",
      grupo: null,
      tipo: "CDB",
      nome: "CDB BANCO X",
      emissor: "Banco X S.A.",
      emissorCnpj: "00000000000191",
      indexador: "CDI",
      percentualIndexador: "110",
      taxaAnual: null,
      dataAplicacao: "2026-01-15",
      vencimento: "2028-01-15",
      valorAplicado: "10000",
      liquidez: "vencimento",
      informadoEm: "2026-10-10",
      bruto: "10420.5",
      liquido: "10350.12",
      ir: "70.38",
      iof: "0",
    });
  });

  it("caixinhas do Nubank: CDBs da Nu Financeira viram lotes de um mesmo grupo, com liquidez diária", () => {
    const lote = {
      ...base,
      name: null,
      issuer: "NU FINANCEIRA",
      issuerCNPJ: "30.680.829/0001-43",
      rate: 100,
      dueDate: null,
    };
    expect(ehCaixinhaNubank(lote)).toBe(true);
    const { titulos } = normalizarInvestimentos(
      [
        { ...lote, id: "a" },
        { ...lote, id: "b", purchaseDate: "2026-05-02T00:00:00Z" },
      ],
      HOJE,
    );
    expect(titulos.map((t) => [t.tipo, t.grupo, t.liquidez, t.nome])).toEqual([
      ["CAIXINHA", "nubank-caixinha:100", "diaria", "Caixinhas Nubank · 100% do CDI"],
      ["CAIXINHA", "nubank-caixinha:100", "diaria", "Caixinhas Nubank · 100% do CDI"],
    ]);
    expect(titulos[1]?.dataAplicacao).toBe("2026-05-02");
  });

  it("Tesouro pelo indexador; prefixado pela taxa fixa; IPCA+ com a taxa real", () => {
    const { titulos } = normalizarInvestimentos(
      [
        { ...base, id: "s", subtype: "TREASURY", rateType: "SELIC", rate: null, fixedAnnualRate: 0.05 },
        { ...base, id: "p", subtype: "TREASURY", rateType: null, rate: null, fixedAnnualRate: 12.5 },
        { ...base, id: "i", subtype: "TREASURY", rateType: "IPCA", rate: null, fixedAnnualRate: 6.1 },
        { ...base, id: "l", subtype: "LCA", rate: 95 },
        { ...base, id: "d", subtype: "DEBENTURES", rateType: "IPCA", fixedAnnualRate: 7 },
      ],
      HOJE,
    );
    expect(titulos.map((t) => [t.tipo, t.indexador, t.percentualIndexador, t.taxaAnual])).toEqual([
      ["TESOURO_SELIC", "SELIC", "100", "0.05"],
      ["TESOURO_PREFIXADO", "PREFIXADO", null, "12.5"],
      ["TESOURO_IPCA", "IPCA", null, "6.1"],
      ["LCA", "CDI", "95", null],
      ["DEBENTURE", "IPCA", null, "7"],
    ]);
  });

  it("deixa de fora fundos, resgatados, IGP-M e sem data, e conta quantos", () => {
    const r = normalizarInvestimentos(
      [
        { ...base, id: "f", type: "MUTUAL_FUND" },
        { ...base, id: "w", status: "TOTAL_WITHDRAWAL" },
        { ...base, id: "g", rateType: "IGPM" },
        { ...base, id: "x", purchaseDate: null, issueDate: null },
        { ...base, id: "z", rateType: null, rate: null, fixedAnnualRate: null },
      ],
      HOJE,
    );
    expect(r).toEqual({ titulos: [], ignorados: 5 });
  });

  it("sem amountOriginal, aplicado = líquido − lucro; sem data de referência, hoje", () => {
    const [t] = normalizarInvestimentos(
      [{ ...base, amountOriginal: null, amount: null, date: null, subtype: "OUTRO_QUALQUER" }],
      HOJE,
    ).titulos;
    expect(t).toMatchObject({ valorAplicado: "10000", bruto: "10350.12", informadoEm: HOJE, tipo: "OUTRO" });
  });
});
