import { describe, expect, it } from "vitest";
import { naoRealizado, precoMedioExecucoes, taxaTotal, temQuantidade } from "./posicao";

describe("contas de posição", () => {
  it("calcula o resultado não realizado pelo preço atual", () => {
    expect(naoRealizado("1.2", "146.90", "148.40")).toBe("1.80");
    expect(naoRealizado("0.5", "100", "90")).toBe("-5.00");
  });

  it("pondera o preço médio das execuções", () => {
    expect(
      precoMedioExecucoes([
        { preco: "10", quantidade: "1", taxaCotacao: "0" },
        { preco: "20", quantidade: "3", taxaCotacao: "0" },
      ]),
    ).toBe("17.5");
    expect(precoMedioExecucoes([])).toBeNull();
  });

  it("soma as taxas sem erro de float", () => {
    expect(
      taxaTotal([
        { preco: "1", quantidade: "1", taxaCotacao: "0.1" },
        { preco: "1", quantidade: "1", taxaCotacao: "0.2" },
      ]),
    ).toBe("0.3");
  });

  it("diz se há quantidade", () => {
    expect(temQuantidade("0")).toBe(false);
    expect(temQuantidade("0.0001")).toBe(true);
  });
});
