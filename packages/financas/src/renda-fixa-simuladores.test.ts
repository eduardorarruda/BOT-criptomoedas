import { dec } from "@zentrade/dominio";
import { describe, expect, it } from "vitest";
import { diasUteis, somarDias } from "./calendario.js";
import { taxaDiariaDeAnual } from "./indexadores.js";
import { compararSelicCdbPoupanca, equivalenciaIsento, preVersusIpca } from "./renda-fixa-simuladores.js";

const INICIO = "2026-10-13";

describe("equivalência isento × tributado (LCI/LCA × CDB)", () => {
  it("LCI a 90% do CDI em 365 dias: a regra de bolso dá 90 ÷ (1 − 17,5%)", () => {
    const r = equivalenciaIsento({
      direcao: "isento_para_tributado",
      percentualCdi: dec(90),
      prazoDias: 365,
      cdiAnual: dec("13.65"),
      inicio: INICIO,
    });
    expect(r.aliquotaIr.toFixed()).toBe("0.175");
    expect(r.regraDeBolso.toDecimalPlaces(2).toFixed()).toBe("109.09");
    // Com juros compostos o CDB precisa de um pouco menos que a regra de bolso.
    expect(r.equivalente.lt(r.regraDeBolso)).toBe(true);
    expect(r.equivalente.gt(dec(105))).toBe(true);
  });

  it("ida e volta dá o mesmo percentual", () => {
    const ida = equivalenciaIsento({
      direcao: "isento_para_tributado",
      percentualCdi: dec(92),
      prazoDias: 720,
      cdiAnual: dec(12),
      inicio: INICIO,
    });
    const volta = equivalenciaIsento({
      direcao: "tributado_para_isento",
      percentualCdi: ida.equivalente,
      prazoDias: 720,
      cdiAnual: dec(12),
      inicio: INICIO,
    });
    expect(volta.equivalente.toDecimalPlaces(8).toFixed()).toBe("92");
  });

  it("o rendimento líquido do CDB equivalente bate com o da LCI", () => {
    const r = equivalenciaIsento({
      direcao: "isento_para_tributado",
      percentualCdi: dec(95),
      prazoDias: 200,
      cdiAnual: dec(13),
      inicio: INICIO,
    });
    const du = diasUteis(INICIO, somarDias(INICIO, 200));
    const d = taxaDiariaDeAnual(dec(13)).div(100);
    const lci = dec(1).plus(d.times("0.95")).pow(du).minus(1);
    const cdb = dec(1)
      .plus(d.times(r.equivalente.div(100)))
      .pow(du)
      .minus(1)
      .times(dec(1).minus("0.2"));
    expect(cdb.toDecimalPlaces(12).toFixed()).toBe(lci.toDecimalPlaces(12).toFixed());
  });

  it("traz a curva por prazo para o gráfico, uma por faixa de IR", () => {
    const r = equivalenciaIsento({
      direcao: "isento_para_tributado",
      percentualCdi: dec(90),
      prazoDias: 365,
      cdiAnual: dec(13),
      inicio: INICIO,
    });
    expect(r.curva.map((p) => p.prazoDias)).toEqual([30, 90, 180, 181, 360, 361, 540, 720, 721, 1080, 1800]);
    expect(r.curva[0]!.equivalente.gt(r.curva.at(-1)!.equivalente)).toBe(true);
  });

  it("prazo inválido é erro", () => {
    expect(() =>
      equivalenciaIsento({
        direcao: "isento_para_tributado",
        percentualCdi: dec(90),
        prazoDias: 0,
        cdiAnual: dec(13),
        inicio: INICIO,
      }),
    ).toThrow(/prazo/);
  });
});

describe("Tesouro Selic × CDB × poupança", () => {
  const r = compararSelicCdbPoupanca({
    valor: dec(20000),
    inicio: INICIO,
    prazoDias: 365,
    selicAnual: dec("13.65"),
    cdiAnual: dec("13.65"),
    percentualCdb: dec(100),
    metaSelicAnual: dec("13.75"),
    trMensal: dec(0),
  });

  it("poupança: 0,5% ao mês nos 12 aniversários, isenta", () => {
    expect(r.poupanca.bruto.toFixed()).toBe(
      dec(20000).times(dec("1.005").pow(12)).toDecimalPlaces(2, 1).toFixed(),
    );
    expect(r.poupanca.ir.toFixed()).toBe("0");
  });

  it("Tesouro Selic paga custódia sobre o que passa de R$ 10 mil; CDB não", () => {
    expect(r.tesouroSelic.custodia.gt(0)).toBe(true);
    expect(r.cdb.custodia.toFixed()).toBe("0");
    expect(r.tesouroSelic.bruto.toFixed()).toBe(r.cdb.bruto.toFixed());
    expect(r.tesouroSelic.liquido.lt(r.cdb.liquido)).toBe(true);
  });

  it("IR de 17,5% em 365 dias", () => {
    expect(r.cdb.aliquotaIr.toFixed()).toBe("0.175");
    expect(r.cdb.ir.toFixed()).toBe(r.cdb.bruto.minus(20000).times("0.175").toDecimalPlaces(2, 4).toFixed());
  });

  it("série mensal para o gráfico e premissas por extenso", () => {
    expect(r.serie[0]).toMatchObject({ dia: INICIO });
    expect(r.serie.at(-1)?.dia).toBe(somarDias(INICIO, 365));
    expect(r.premissas.join(" ")).toMatch(/0,20% ao ano/);
    expect(r.premissas.join(" ")).toMatch(/13,75%/);
  });

  it("até R$ 10 mil, Tesouro Selic sem custódia", () => {
    const pequeno = compararSelicCdbPoupanca({
      valor: dec(5000),
      inicio: INICIO,
      prazoDias: 100,
      selicAnual: dec(13),
      cdiAnual: dec(13),
      percentualCdb: dec(100),
      metaSelicAnual: dec(13),
      trMensal: dec(0),
    });
    expect(pequeno.tesouroSelic.custodia.toFixed()).toBe("0");
  });
});

describe("prefixado × IPCA+ (inflação de equilíbrio)", () => {
  const r = preVersusIpca({
    valor: dec(10000),
    inicio: INICIO,
    prazoDias: 1095,
    taxaPre: dec(12),
    taxaReal: dec(6),
    ipcaEsperado: dec(4),
  });

  it("equilíbrio = (1 + pré) ÷ (1 + real) − 1", () => {
    expect(r.inflacaoEquilibrio.toDecimalPlaces(4).toFixed()).toBe("5.6604");
  });

  it("com IPCA abaixo do equilíbrio, o prefixado termina na frente", () => {
    expect(r.prefixado.liquido.gt(r.ipcaMais.liquido)).toBe(true);
  });

  it("a curva cruza no equilíbrio", () => {
    const antes = r.curva.find((p) => p.ipca.eq(5));
    const depois = r.curva.find((p) => p.ipca.eq(6));
    expect(antes!.prefixado.gt(antes!.ipcaMais)).toBe(true);
    expect(depois!.prefixado.lt(depois!.ipcaMais)).toBe(true);
    expect(r.premissas.join(" ")).toMatch(/4% ao ano/);
  });
});
