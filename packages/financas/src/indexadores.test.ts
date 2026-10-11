import { dec, type Valor } from "@zentrade/dominio";
import { describe, expect, it } from "vitest";
import {
  ErroIndiceFaltando,
  fatorDiario,
  fatorIpca,
  fatorPoupanca,
  fatorPrefixado,
  FONTES_INDICES,
  aniversarioPoupanca,
  remuneracaoPoupancaMensal,
  taxaAnualDeDiaria,
  taxaAnualDeMensal,
  taxaDiariaDeAnual,
  taxaMensalDeAnual,
} from "./indexadores.js";

const serie = (pares: Record<string, string>): ReadonlyMap<string, Valor> =>
  new Map(Object.entries(pares).map(([k, v]) => [k, dec(v)]));

const casas = (v: Valor, n: number) => v.toDecimalPlaces(n).toFixed(n);

describe("conversão de taxas (base 252 e meses)", () => {
  it("CDI de 0,050788% ao dia é 13,65% ao ano (SGS 12 × SGS 4389, outubro de 2026)", () => {
    expect(casas(taxaAnualDeDiaria(dec("0.050788")), 2)).toBe("13.65");
    expect(casas(taxaDiariaDeAnual(dec("13.65")), 5)).toBe("0.05079");
  });

  it("anual ↔ mensal por juros compostos", () => {
    expect(casas(taxaMensalDeAnual(dec("12.682503")), 4)).toBe("1.0000");
    expect(casas(taxaAnualDeMensal(dec(1)), 4)).toBe("12.6825");
  });

  it("prefixado: 10% a.a. em 252 dias úteis é 10%; em 126, a raiz", () => {
    expect(fatorPrefixado(dec(10), 252).toFixed()).toBe("1.1");
    expect(casas(fatorPrefixado(dec(10), 126), 10)).toBe("1.0488088482");
  });
});

describe("fatorDiario (CDI e Selic, dia a dia)", () => {
  const cdi = serie({ "2026-10-07": "0.050788", "2026-10-08": "0.050788", "2026-10-09": "0.050788" });

  it("100% do CDI em 3 dias úteis compõe as 3 taxas", () => {
    const r = fatorDiario(cdi, "CDI", "2026-10-07", "2026-10-10", dec(100));
    expect(r.diasUteis).toBe(3);
    expect(r.ate).toBe("2026-10-10");
    expect(r.parcial).toBe(false);
    expect(casas(r.fator, 12)).toBe(casas(dec("1.00050788").pow(3), 12));
  });

  it("110% do CDI multiplica a taxa do dia antes de compor", () => {
    const r = fatorDiario(cdi, "CDI", "2026-10-07", "2026-10-10", dec(110));
    expect(casas(r.fator, 12)).toBe(casas(dec("1.000558668").pow(3), 12));
  });

  it("o fator de cada dia é truncado em 16 casas, como na B3", () => {
    const r = fatorDiario(
      serie({ "2026-10-09": "0.0333333333333333333" }),
      "CDI",
      "2026-10-09",
      "2026-10-10",
    );
    expect(r.fator.toFixed()).toBe("1.0003333333333333");
  });

  it("taxa ainda não publicada no fim: calcula até o último dia que existe e avisa", () => {
    const r = fatorDiario(cdi, "CDI", "2026-10-07", "2026-10-15");
    expect(r.parcial).toBe(true);
    expect(r.ate).toBe("2026-10-13");
    expect(r.diasUteis).toBe(3);
  });

  it("buraco no meio da série é erro: nunca inventa taxa", () => {
    const furada = serie({ "2026-10-07": "0.05", "2026-10-09": "0.05" });
    expect(() => fatorDiario(furada, "CDI", "2026-10-07", "2026-10-10")).toThrow(ErroIndiceFaltando);
    try {
      fatorDiario(furada, "CDI", "2026-10-07", "2026-10-10");
    } catch (e) {
      expect((e as ErroIndiceFaltando).faltando).toEqual(["2026-10-08"]);
      expect((e as Error).message).toMatch(/CDI/);
    }
  });

  it("sem nenhum dado do período também é erro", () => {
    expect(() => fatorDiario(new Map(), "SELIC", "2026-10-07", "2026-10-10")).toThrow(/Selic/);
  });

  it("período vazio dá fator 1", () => {
    const r = fatorDiario(cdi, "CDI", "2026-10-10", "2026-10-10");
    expect(r.fator.toFixed()).toBe("1");
    expect(r.diasUteis).toBe(0);
  });
});

describe("fatorIpca (mês a mês, pro rata por dias corridos)", () => {
  const ipca = serie({ "2026-01": "0.5", "2026-02": "0.4" });

  it("meses cheios multiplicam as variações", () => {
    const r = fatorIpca(ipca, "2026-01-01", "2026-03-01");
    expect(r.fator.toFixed()).toBe("1.00902");
    expect(r.mesesProjetados).toEqual([]);
  });

  it("mês quebrado entra pela fração de dias corridos", () => {
    const r = fatorIpca(ipca, "2026-01-16", "2026-02-01");
    expect(casas(r.fator, 12)).toBe(casas(dec("1.005").pow(dec(16).div(31)), 12));
  });

  it("mês sem IPCA publicado usa a projeção informada e diz qual mês foi projetado", () => {
    const r = fatorIpca(ipca, "2026-02-01", "2026-04-01", dec(4));
    expect(r.mesesProjetados).toEqual(["2026-03"]);
    const mensal = dec("1.04").pow(dec(1).div(12));
    expect(casas(r.fator, 12)).toBe(casas(dec("1.004").times(mensal), 12));
  });

  it("sem IPCA e sem projeção: erro que lista os meses que faltam", () => {
    expect(() => fatorIpca(ipca, "2026-02-01", "2026-05-01")).toThrow(/2026-03, 2026-04/);
  });
});

describe("poupança (Lei 8.177/1991, art. 12, com a Lei 12.703/2012)", () => {
  it("Selic acima de 8,5%: 0,5% ao mês + TR (bate com a SGS 195 de 01/09/2026)", () => {
    const r = remuneracaoPoupancaMensal(dec("13.75"), dec("0.1690"));
    expect(casas(r, 4)).toBe("0.6698");
  });

  it("Selic de até 8,5%: 70% da meta, mensalizada, + TR", () => {
    const r = remuneracaoPoupancaMensal(dec("6"), dec(0));
    expect(casas(r, 6)).toBe(casas(taxaMensalDeAnual(dec("4.2")), 6));
  });

  it("depósitos nos dias 29, 30 e 31 fazem aniversário no dia 1º", () => {
    expect(aniversarioPoupanca("2026-01-30")).toBe("2026-02-01");
    expect(aniversarioPoupanca("2026-01-28")).toBe("2026-01-28");
  });

  it("só rende em aniversário completo", () => {
    const rent = serie({ "2026-01-10": "0.6", "2026-02-10": "0.5", "2026-03-10": "0.7" });
    const r = fatorPoupanca(rent, "2026-01-10", "2026-03-15");
    expect(r.fator.toFixed()).toBe("1.01103");
    expect(r.periodos).toBe(2);
    expect(r.ultimoAniversario).toBe("2026-03-10");
  });

  it("período sem rentabilidade publicada é erro", () => {
    expect(() => fatorPoupanca(new Map(), "2026-01-10", "2026-03-15")).toThrow(ErroIndiceFaltando);
  });
});

describe("fontes", () => {
  it("cada índice diz a série do Banco Central de onde vem", () => {
    expect(FONTES_INDICES.CDI.serie).toBe(12);
    expect(FONTES_INDICES.SELIC.serie).toBe(11);
    expect(FONTES_INDICES.SELIC_META.serie).toBe(432);
    expect(FONTES_INDICES.IPCA.serie).toBe(433);
    expect(FONTES_INDICES.POUPANCA.serie).toBe(195);
    expect(FONTES_INDICES.TR.serie).toBe(226);
  });
});
