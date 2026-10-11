import { describe, expect, it } from "vitest";
import { erroInteiro, erroValorPositivo, lerDecimalDigitado, paraCampo } from "./entrada";

describe("lerDecimalDigitado", () => {
  it("aceita vírgula e ponto como a pessoa digita", () => {
    expect(lerDecimalDigitado("25,50")).toBe("25.5");
    expect(lerDecimalDigitado("1.234,56")).toBe("1234.56");
    expect(lerDecimalDigitado("10.25")).toBe("10.25");
    expect(lerDecimalDigitado(" US$ 7 ")).toBe("7");
  });

  it("recusa o que não é número", () => {
    expect(lerDecimalDigitado("")).toBeNull();
    expect(lerDecimalDigitado("abc")).toBeNull();
    expect(lerDecimalDigitado("1,2,3")).toBeNull();
  });
});

describe("mensagens de validação", () => {
  it("explica valor inválido ou não positivo", () => {
    expect(erroValorPositivo("x", "a perda diária máxima")).toMatch(/por exemplo 25/);
    expect(erroValorPositivo("0", "a perda diária máxima")).toBe(
      "A perda diária máxima precisa ser maior que zero.",
    );
    expect(erroValorPositivo("10", "a exposição")).toBeNull();
  });

  it("explica inteiro fora da faixa", () => {
    expect(erroInteiro("0", "Ordens por hora", 1, 120)).toMatch(/entre 1 e 120/);
    expect(erroInteiro("2.5", "Ordens por hora", 1, 120)).not.toBeNull();
    expect(erroInteiro("4", "Ordens por hora", 1, 120)).toBeNull();
  });

  it("mostra decimal com vírgula no campo", () => {
    expect(paraCampo("25.5")).toBe("25,5");
  });
});
