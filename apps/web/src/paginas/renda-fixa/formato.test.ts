import { data, fracaoPct, pct, reais, reaisCurto, rentabilidadeContratada, tomDe } from "./formato";

describe("formatação da renda fixa", () => {
  it("reais em pt-BR, com sinal tipográfico", () => {
    expect(reais("10420.5")).toBe("R$ 10.420,50");
    expect(reais("-3.456")).toBe("−R$ 3,46");
    expect(reais("12.3", { sinal: true })).toBe("+R$ 12,30");
    expect(reais(null)).toBe("—");
    expect(reais("abc")).toBe("—");
  });

  it("percentuais e frações", () => {
    expect(pct("13.6522")).toBe("13,65%");
    expect(pct("0.5", { sinal: true })).toBe("+0,50%");
    expect(fracaoPct("0.256")).toBe("25,6%");
    expect(fracaoPct("x")).toBe("—");
  });

  it("datas e tom", () => {
    expect(data("2026-10-13")).toBe("13/10/2026");
    expect(data(null)).toBe("—");
    expect(tomDe("-1")).toBe("perda");
    expect(tomDe("0")).toBe("");
    expect(tomDe("2")).toBe("ganho");
  });

  it("rentabilidade contratada por extenso", () => {
    expect(rentabilidadeContratada({ indexador: "CDI", percentualIndexador: "110", taxaAnual: null })).toBe(
      "110% do CDI",
    );
    expect(
      rentabilidadeContratada({ indexador: "SELIC", percentualIndexador: null, taxaAnual: "0.05" }),
    ).toBe("100% da Selic + 0,05% a.a.");
    expect(rentabilidadeContratada({ indexador: "IPCA", percentualIndexador: null, taxaAnual: "6.1" })).toBe(
      "IPCA + 6,10% a.a.",
    );
    expect(
      rentabilidadeContratada({ indexador: "PREFIXADO", percentualIndexador: null, taxaAnual: "12.5" }),
    ).toBe("12,50% a.a.");
    expect(
      rentabilidadeContratada({ indexador: "POUPANCA", percentualIndexador: null, taxaAnual: null }),
    ).toBe("Regra da poupança");
  });
});

describe("reaisCurto (eixos dos gráficos)", () => {
  it("arredonda e agrupa o milhar em pt-BR", () => {
    expect(reaisCurto(1234.56)).toBe("R$ 1.235");
    expect(reaisCurto(0)).toBe("R$ 0");
  });
});
