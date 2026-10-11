import { dec } from "@zentrade/dominio";
import { describe, expect, it } from "vitest";
import {
  aliquotaIof,
  aliquotaIr,
  estimarImpostos,
  IOF_REGRESSIVO,
  IR_RENDA_FIXA,
  isentoDeIr,
  REGRAS_TRIBUTARIAS_VIGENTES,
  type RegrasTributarias,
} from "./impostos.js";

const texto = (v: { toFixed(): string }) => v.toFixed();

describe("IR regressivo da renda fixa (Lei 11.033/2004, art. 1º)", () => {
  it.each([
    [1, "0.225"],
    [180, "0.225"],
    [181, "0.2"],
    [360, "0.2"],
    [361, "0.175"],
    [720, "0.175"],
    [721, "0.15"],
    [5000, "0.15"],
  ])("aplicação de %i dias corridos paga %s", (dias, aliquota) => {
    expect(texto(aliquotaIr(dias))).toBe(aliquota);
  });

  it("a tabela traz fonte, vigência e a data em que foi conferida", () => {
    expect(IR_RENDA_FIXA.fonte).toMatch(/11\.033/);
    expect(IR_RENDA_FIXA.vigenteDesde).toBe("2005-01-01");
    expect(REGRAS_TRIBUTARIAS_VIGENTES.verificadoEm).toBe("2026-10-11");
    expect(REGRAS_TRIBUTARIAS_VIGENTES.notas.join(" ")).toMatch(/1\.303/);
  });
});

describe("IOF regressivo (Decreto 6.306/2007, art. 32 e Anexo)", () => {
  it.each([
    [0, "0.96"],
    [1, "0.96"],
    [10, "0.66"],
    [15, "0.5"],
    [29, "0.03"],
    [30, "0"],
    [400, "0"],
  ])("resgate com %i dias corridos: %s do rendimento", (dias, aliquota) => {
    expect(texto(aliquotaIof(dias))).toBe(aliquota);
  });

  it("a tabela tem os 29 dias do anexo", () => {
    expect(IOF_REGRESSIVO.percentuais).toHaveLength(29);
  });
});

describe("isenções para pessoa física", () => {
  it.each([
    ["LCI", true],
    ["LCA", true],
    ["CRI", true],
    ["CRA", true],
    ["DEBENTURE_INCENTIVADA", true],
    ["POUPANCA", true],
    ["CDB", false],
    ["CAIXINHA", false],
    ["TESOURO_SELIC", false],
    ["DEBENTURE", false],
  ] as const)("%s isento de IR: %s", (tipo, isento) => {
    expect(isentoDeIr(tipo)).toBe(isento);
  });
});

describe("estimarImpostos", () => {
  it("CDB de R$ 10.000 que vale R$ 10.500 com 200 dias: IR de 20% sobre R$ 500", () => {
    const r = estimarImpostos({ tipo: "CDB", aplicado: dec(10000), bruto: dec(10500), diasCorridos: 200 });
    expect(texto(r.iof)).toBe("0");
    expect(texto(r.ir)).toBe("100");
    expect(texto(r.liquido)).toBe("10400");
    expect(texto(r.aliquotaIr)).toBe("0.2");
  });

  it("resgate em 10 dias: IOF de 66% primeiro, IR de 22,5% sobre o que sobra", () => {
    const r = estimarImpostos({ tipo: "CDB", aplicado: dec(1000), bruto: dec(1100), diasCorridos: 10 });
    expect(texto(r.iof)).toBe("66");
    expect(texto(r.ir)).toBe("7.65");
    expect(texto(r.liquido)).toBe("1026.35");
  });

  it("LCI não paga IR mas paga IOF nos primeiros 30 dias", () => {
    const r = estimarImpostos({ tipo: "LCI", aplicado: dec(1000), bruto: dec(1010), diasCorridos: 20 });
    expect(r.isentoIr).toBe(true);
    expect(texto(r.ir)).toBe("0");
    expect(texto(r.iof)).toBe("3.3");
  });

  it("poupança não paga IR nem IOF", () => {
    const r = estimarImpostos({ tipo: "POUPANCA", aplicado: dec(1000), bruto: dec(1005), diasCorridos: 3 });
    expect(texto(r.iof)).toBe("0");
    expect(texto(r.liquido)).toBe("1005");
  });

  it("sem rendimento (ou com perda) não há imposto", () => {
    const r = estimarImpostos({ tipo: "CDB", aplicado: dec(1000), bruto: dec(990), diasCorridos: 100 });
    expect(texto(r.ir)).toBe("0");
    expect(texto(r.liquido)).toBe("990");
  });

  it("arredonda os impostos para centavos", () => {
    const r = estimarImpostos({ tipo: "CDB", aplicado: dec(1000), bruto: dec("1000.07"), diasCorridos: 100 });
    expect(texto(r.ir)).toBe("0.02"); // 0,07 × 22,5% = 0,01575
  });

  it("aceita outra tabela (configurável) no lugar da vigente", () => {
    const aliquotaUnica: RegrasTributarias = {
      ...REGRAS_TRIBUTARIAS_VIGENTES,
      ir: { ...IR_RENDA_FIXA, faixas: [{ ateDias: null, aliquota: dec("0.175") }] },
    };
    const r = estimarImpostos(
      { tipo: "CDB", aplicado: dec(1000), bruto: dec(1100), diasCorridos: 800 },
      aliquotaUnica,
    );
    expect(texto(r.ir)).toBe("17.5");
  });

  it("dias negativos são erro", () => {
    expect(() => aliquotaIr(-1)).toThrow(/dias/);
  });
});
