import type { MoedaCarteira } from "@zentrade/contratos/esquemas";
import { describe, expect, it } from "vitest";
import { arco, fatiasDaAlocacao, posicionar } from "./alocacao";

const moeda = (ativo: string, alocacao: string | null, valorSaldo: string | null = "1") =>
  ({ ativo, alocacao, valorSaldo }) as MoedaCarteira;

describe("fatias da alocação", () => {
  it("da maior para a menor; sem preço (alocação desconhecida) fica de fora", () => {
    const f = fatiasDaAlocacao([
      moeda("ETH", "0.25"),
      moeda("BTC", "0.7"),
      moeda("XYZ", null),
      moeda("USDT", "0.05"),
    ]);
    expect(f.map((x) => [x.rotulo, x.fracao])).toEqual([
      ["BTC", "0.7"],
      ["ETH", "0.25"],
      ["USDT", "0.05"],
    ]);
  });

  it("depois do limite, o resto vira 'Outras', somado em decimal exato", () => {
    const moedas = ["A", "B", "C", "D"].map((a) => moeda(a, "0.1")).concat(moeda("E", "0.6"));
    const f = fatiasDaAlocacao(moedas, 3);
    expect(f.map((x) => [x.rotulo, x.fracao])).toEqual([
      ["E", "0.6"],
      ["A", "0.1"],
      ["Outras (3)", "0.3"],
    ]);
  });

  it("alocação zero não vira fatia", () => {
    expect(fatiasDaAlocacao([moeda("A", "0"), moeda("B", "1")]).map((x) => x.rotulo)).toEqual(["B"]);
  });
});

describe("arco do donut", () => {
  it("começa no topo e anda no sentido horário", () => {
    expect(arco(50, 50, 40, 0, 0.25)).toBe("M 50 10 A 40 40 0 0 1 90 50");
  });

  it("arco maior que meia volta usa a flag de arco grande", () => {
    expect(arco(50, 50, 40, 0, 0.75)).toContain(" 0 1 1 ");
  });

  it("volta inteira em duas metades (um arco só não fecha o círculo)", () => {
    expect(arco(50, 50, 40, 0, 1)).toBe("M 50 10 A 40 40 0 1 1 50 90 A 40 40 0 1 1 50 10");
  });
});

describe("fatias posicionadas", () => {
  it("cada uma começa onde a anterior terminou", () => {
    const p = posicionar([
      { rotulo: "A", fracao: "0.5" },
      { rotulo: "B", fracao: "0.25" },
    ]);
    expect(p.map((f) => [f.inicio, f.fim])).toEqual([
      [0, 0.5],
      [0.5, 0.75],
    ]);
  });
});
