import { dec } from "@zentrade/dominio";
import { describe, expect, it } from "vitest";
import {
  CATEGORIAS,
  formatarAnos,
  formatarReais,
  formatarTaxa,
  lerPercentualDigitado,
  lerReaisDigitado,
  TIPOS,
} from "./formato";

describe("formatação em reais", () => {
  it("usa R$, milhar com ponto, vírgula decimal e menos tipográfico", () => {
    expect(formatarReais("1234567.891")).toBe("R$ 1.234.567,89");
    expect(formatarReais("-50")).toBe("−R$ 50,00");
    expect(formatarReais(dec("0.005"))).toBe("R$ 0,01");
    expect(formatarReais("10", { sinal: true })).toBe("+R$ 10,00");
    expect(formatarReais("")).toBe("—");
    expect(formatarReais(null)).toBe("—");
  });

  it("forma compacta para eixos de gráfico", () => {
    expect(formatarReais("1250000", { compacto: true })).toBe("R$ 1,25 mi");
    expect(formatarReais("85300", { compacto: true })).toBe("R$ 85,3 mil");
    expect(formatarReais("950", { compacto: true })).toBe("R$ 950");
  });

  it("taxas em percentual e anos", () => {
    expect(formatarTaxa(0.10495)).toBe("10,50%");
    expect(formatarTaxa(null)).toBe("—");
    expect(formatarTaxa(0.0085, 3)).toBe("0,850%");
    expect(formatarAnos(9.434)).toBe("9,4 anos");
    expect(formatarAnos(1)).toBe("1 ano");
    expect(formatarAnos(null)).toBe("não recupera no período");
  });
});

describe("leitura do que a pessoa digita", () => {
  it("reais com R$, milhar e vírgula", () => {
    expect(lerReaisDigitado("R$ 1.234,56")).toBe("1234.56");
    expect(lerReaisDigitado("350000")).toBe("350000");
    expect(lerReaisDigitado("abc")).toBeNull();
    expect(lerReaisDigitado("")).toBeNull();
  });

  it("percentual vira fração", () => {
    expect(lerPercentualDigitado("10,5")).toBeCloseTo(0.105, 12);
    expect(lerPercentualDigitado("10,5%")).toBeCloseTo(0.105, 12);
    expect(lerPercentualDigitado("-2")).toBeCloseTo(-0.02, 12);
    expect(lerPercentualDigitado("x")).toBeNull();
  });
});

describe("rótulos", () => {
  it("cada tipo tem rótulo, descrição e ícone; cada lançamento, categorias", () => {
    for (const t of Object.values(TIPOS)) {
      expect(t.rotulo.length).toBeGreaterThan(2);
      expect(t.descricao.length).toBeGreaterThan(10);
    }
    expect(Object.keys(TIPOS)).toHaveLength(9);
    expect(CATEGORIAS.receita).toContain("aluguel");
  });
});
