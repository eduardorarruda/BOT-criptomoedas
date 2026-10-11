import { describe, expect, it } from "vitest";
import { arredondarParaBaixo, dec, ehMultiplo, paraTexto } from "./dinheiro.js";

describe("dinheiro", () => {
  it("soma sem o erro do ponto flutuante", () => {
    expect(dec("0.1").plus("0.2").equals("0.3")).toBe(true);
  });

  it("recusa valor que não é número finito", () => {
    expect(() => dec("abc")).toThrow(/valor inválido/);
    expect(() => dec(Number.NaN)).toThrow(/valor inválido/);
    expect(() => dec(Number.POSITIVE_INFINITY)).toThrow(/valor inválido/);
  });

  it("arredonda para baixo no passo do lote", () => {
    expect(paraTexto(arredondarParaBaixo(dec("0.0012345"), dec("0.00001")))).toBe("0.00123");
    expect(paraTexto(arredondarParaBaixo(dec("5"), dec("0.5")))).toBe("5");
  });

  it("recusa passo zero ou negativo", () => {
    expect(() => arredondarParaBaixo(dec("1"), dec("0"))).toThrow(/passo/);
  });

  it("diz se o valor é múltiplo do passo", () => {
    expect(ehMultiplo(dec("0.003"), dec("0.001"))).toBe(true);
    expect(ehMultiplo(dec("0.0035"), dec("0.001"))).toBe(false);
  });

  it("escreve sem notação científica", () => {
    expect(paraTexto(dec("0.00000001"))).toBe("0.00000001");
  });
});
