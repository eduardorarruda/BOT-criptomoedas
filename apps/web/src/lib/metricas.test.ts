import { describe, expect, it } from "vitest";
import { maiorQueda, somar, variacao } from "./metricas";

describe("maiorQueda", () => {
  it("mede a maior distância de um topo até um fundo posterior", () => {
    expect(maiorQueda(["100", "120", "90", "110", "80", "130"])).toBe("-40");
  });

  it("é zero quando só sobe ou quando está vazio", () => {
    expect(maiorQueda(["1", "2", "3"])).toBe("0");
    expect(maiorQueda([])).toBe("0");
  });
});

describe("somar", () => {
  it("soma textos decimais sem erro de float", () => {
    expect(somar(["0.1", "0.2"])).toBe("0.3");
    expect(somar([])).toBe("0");
  });
});

describe("variacao", () => {
  it("dá a diferença e a fração entre o primeiro e o último valor", () => {
    expect(variacao(["1000", "1100"])).toEqual({ absoluta: "100", fracao: "0.1" });
    expect(variacao(["0", "5"])).toEqual({ absoluta: "5", fracao: "0" });
    expect(variacao([])).toEqual({ absoluta: "0", fracao: "0" });
  });
});
