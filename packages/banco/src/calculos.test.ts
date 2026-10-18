import { dec, type Execucao } from "@zentrade/dominio";
import { describe, expect, it } from "vitest";
import { deltasRealizados, maiorQueda, resultadoDesde, resumirCarteira, ultimaPerdaEm } from "./calculos.js";

const ex = (lado: "COMPRA" | "VENDA", preco: string, q: string, taxa: string, em: number): Execucao => ({
  lado,
  preco: dec(preco),
  quantidade: dec(q),
  taxaCotacao: dec(taxa),
  em,
});

// compra 1 a 100 (taxa 0,1), vende 0,5 a 120 (taxa 0,06), vende 0,5 a 90 (taxa 0,045)
const historico = [
  ex("COMPRA", "100", "1", "0.1", 1_000),
  ex("VENDA", "120", "0.5", "0.06", 2_000),
  ex("VENDA", "90", "0.5", "0.045", 3_000),
];

describe("resultado realizado a partir das execuções", () => {
  it("cada execução tem o seu efeito no resultado, já líquido de taxa", () => {
    const deltas = deltasRealizados(historico).map((d) => d.delta.toFixed());
    expect(deltas).toEqual(["-0.1", "9.94", "-5.045"]);
  });

  it("soma só o que aconteceu a partir do instante pedido", () => {
    expect(resultadoDesde(historico, 2_000).toFixed()).toBe("4.895");
    expect(resultadoDesde(historico, 0).toFixed()).toBe("4.795");
    expect(resultadoDesde([], 0).isZero()).toBe(true);
  });

  it("a última perda é a última venda que perdeu dinheiro (a taxa da compra não conta)", () => {
    expect(ultimaPerdaEm(historico)).toBe(3_000);
    expect(ultimaPerdaEm(historico.slice(0, 2))).toBeNull();
  });
});

describe("maior queda", () => {
  it("mede do pico ao vale do resultado acumulado", () => {
    const deltas = ["5", "-3", "-4", "2", "-1"].map((d, i) => ({ em: i, delta: dec(d) }));
    // acumulado: 5, 2, -2, 0, -1 → pico 5, vale -2
    expect(maiorQueda(deltas).toFixed()).toBe("7");
  });

  it("começa do zero: perder logo de início também é queda", () => {
    expect(maiorQueda([{ em: 0, delta: dec("-2") }]).toFixed()).toBe("2");
    expect(maiorQueda([{ em: 0, delta: dec("3") }]).isZero()).toBe(true);
  });
});

describe("resumo da carteira", () => {
  it("junta resultado do dia, exposição e maior queda de todos os robôs", () => {
    const porRobo = new Map([
      ["a", historico],
      ["b", [ex("COMPRA", "10", "2", "0", 2_500)]],
    ]);
    const r = resumirCarteira(porRobo, { inicioDia: 2_000, inicioJanela: 0 });
    expect(r.resultadoHoje.toFixed()).toBe("4.895");
    expect(r.exposicao.toFixed()).toBe("20");
    // acumulado: -0,1; 9,84; 4,795 → pico 9,84
    expect(r.maiorQueda.toFixed()).toBe("5.045");
  });
});
