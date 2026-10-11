import { describe, expect, it } from "vitest";
import { dec } from "./dinheiro.js";
import { estimarExecucao } from "./livro.js";

const ofertasDeVenda = [
  { preco: dec(100), quantidade: dec(1) },
  { preco: dec(101), quantidade: dec(2) },
  { preco: dec(103), quantidade: dec(5) },
];

describe("estimativa no livro de ofertas", () => {
  it("dentro do primeiro nível não há deslizamento", () => {
    const e = estimarExecucao(ofertasDeVenda, dec("0.5"))!;
    expect(e.precoMedio.equals(100)).toBe(true);
    expect(e.deslizamento.isZero()).toBe(true);
  });

  it("atravessa níveis e calcula o preço médio", () => {
    // 1×100 + 2×101 + 1×103 = 405 / 4
    const e = estimarExecucao(ofertasDeVenda, dec(4))!;
    expect(e.precoMedio.equals("101.25")).toBe(true);
    expect(e.piorPreco.equals(103)).toBe(true);
    expect(e.deslizamento.equals("0.0125")).toBe(true);
  });

  it("livro raso demais devolve nulo", () => {
    expect(estimarExecucao(ofertasDeVenda, dec(9))).toBeNull();
    expect(estimarExecucao([], dec(1))).toBeNull();
  });

  it("recusa quantidade não positiva", () => {
    expect(() => estimarExecucao(ofertasDeVenda, dec(0))).toThrow(/quantidade/);
  });
});
