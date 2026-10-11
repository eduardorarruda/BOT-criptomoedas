import { describe, expect, it } from "vitest";
import {
  capitalInicial,
  curvaParaGrafico,
  fracaoSobre,
  maiorQueda,
  metricasDaCurva,
  somar,
  variacao,
} from "./metricas";

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

describe("métricas de backtest", () => {
  const curva = [
    { em: 1, patrimonio: "1000" },
    { em: 2, patrimonio: "1100" },
    { em: 3, patrimonio: "990" },
    { em: 4, patrimonio: "1050" },
  ];

  it("converte a curva para o gráfico", () => {
    expect(curvaParaGrafico(curva)[1]).toEqual({ em: 2, valor: "1100" });
  });

  it("acha o capital inicial pelo patrimônio final ou pela curva", () => {
    expect(capitalInicial({ resultadoLiquido: "50", patrimonioFinal: "1050" }, null)).toBe("1000");
    expect(capitalInicial({ resultadoLiquido: "50" }, curva)).toBe("1000");
    expect(capitalInicial({ resultadoLiquido: "50" }, null)).toBeNull();
    expect(capitalInicial({ resultadoLiquido: "50" }, [])).toBeNull();
  });

  it("fração do resultado sobre o capital", () => {
    expect(fracaoSobre("50", "1000")).toBe("0.05");
    expect(fracaoSobre("50", "0")).toBe("0");
  });

  it("monta as métricas do contrato a partir da curva", () => {
    expect(metricasDaCurva(curva, "3.2", 4, 3)).toEqual({
      resultadoLiquido: "50",
      patrimonioFinal: "1050",
      maiorQueda: "110",
      maiorQuedaPercentual: 0.1,
      operacoes: 4,
      acertos: 3,
      taxaAcerto: 0.75,
      taxasPagas: "3.2",
    });
    expect(metricasDaCurva([], "0", 0, 0)).toMatchObject({ taxaAcerto: 0, maiorQuedaPercentual: 0 });
  });
});
