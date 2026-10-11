import { describe, expect, it } from "vitest";
import {
  formatarDinheiro,
  formatarPercentual,
  formatarPreco,
  formatarQuantidade,
  formatarCustoIa,
  sinalDe,
} from "./formatar";

describe("formatarDinheiro", () => {
  it("agrupa milhares com ponto e usa vírgula decimal, sem passar por float", () => {
    expect(formatarDinheiro("1234567.891")).toBe("US$ 1.234.567,89");
  });

  it("não perde precisão em valores que o float erraria", () => {
    expect(formatarDinheiro("0.1")).toBe("US$ 0,10");
    expect(formatarDinheiro("9007199254740993.005")).toBe("US$ 9.007.199.254.740.993,00");
  });

  it("arredonda meio para o par, como o domínio", () => {
    expect(formatarDinheiro("2.345")).toBe("US$ 2,34");
    expect(formatarDinheiro("2.355")).toBe("US$ 2,36");
  });

  it("mostra perda com o sinal de menos tipográfico", () => {
    expect(formatarDinheiro("-12.3")).toBe("−US$ 12,30");
  });

  it("mostra o sinal de mais quando pedido, e nunca em zero", () => {
    expect(formatarDinheiro("8.5", { sinal: true })).toBe("+US$ 8,50");
    expect(formatarDinheiro("0", { sinal: true })).toBe("US$ 0,00");
    expect(formatarDinheiro("-0.001", { sinal: true })).toBe("US$ 0,00");
  });

  it("aceita número de casas", () => {
    expect(formatarDinheiro("3.14159", { casas: 4 })).toBe("US$ 3,1416");
  });

  it("devolve um traço quando o texto não é decimal", () => {
    expect(formatarDinheiro("abc")).toBe("—");
    expect(formatarDinheiro("")).toBe("—");
  });
});

describe("formatarQuantidade", () => {
  it("tira zeros à direita e mantém até 8 casas", () => {
    expect(formatarQuantidade("0.00123000")).toBe("0,00123");
    expect(formatarQuantidade("1500.5")).toBe("1.500,5");
    expect(formatarQuantidade("0.123456789")).toBe("0,12345679");
    expect(formatarQuantidade("2")).toBe("2");
  });

  it("devolve traço para texto inválido", () => {
    expect(formatarQuantidade("x")).toBe("—");
  });
});

describe("formatarPreco", () => {
  it("usa 2 casas acima de 1 e mais casas em preços pequenos", () => {
    expect(formatarPreco("64250.5")).toBe("64.250,50");
    expect(formatarPreco("1.23456")).toBe("1,2346");
    expect(formatarPreco("0.000123456")).toBe("0,00012346");
  });

  it("devolve traço para texto inválido", () => {
    expect(formatarPreco("--")).toBe("—");
  });
});

describe("formatarPercentual", () => {
  it("converte fração em percentual", () => {
    expect(formatarPercentual(0.025)).toBe("2,5%");
    expect(formatarPercentual("-0.1234", { casas: 2 })).toBe("−12,34%");
    expect(formatarPercentual(0.05, { sinal: true })).toBe("+5,0%");
  });

  it("devolve traço para valor inválido", () => {
    expect(formatarPercentual(Number.NaN)).toBe("—");
  });
});

describe("formatarCustoIa", () => {
  it("mostra centavos de dólar com 4 casas", () => {
    expect(formatarCustoIa("0.0123")).toBe("US$ 0,0123");
    expect(formatarCustoIa("1.5")).toBe("US$ 1,5000");
  });
});

describe("sinalDe", () => {
  it("classifica ganho, perda e neutro", () => {
    expect(sinalDe("1.2")).toBe("ganho");
    expect(sinalDe("-0.01")).toBe("perda");
    expect(sinalDe("0")).toBe("neutro");
    expect(sinalDe("lixo")).toBe("neutro");
  });
});
