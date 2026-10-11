import { describe, expect, it } from "vitest";
import { dec } from "./dinheiro.js";
import { aplicarExecucao, POSICAO_ZERADA, posicaoDe } from "./posicao.js";
import type { Execucao } from "./tipos.js";

const compra = (preco: string, q: string, taxa = "0"): Execucao => ({
  lado: "COMPRA",
  preco: dec(preco),
  quantidade: dec(q),
  taxaCotacao: dec(taxa),
  em: 0,
});
const venda = (preco: string, q: string, taxa = "0"): Execucao => ({
  ...compra(preco, q, taxa),
  lado: "VENDA",
});

describe("posição a partir das execuções", () => {
  it("preço médio ponderado em compras sucessivas", () => {
    const p = posicaoDe([compra("100", "1"), compra("200", "1")]);
    expect(p.quantidade.equals(2)).toBe(true);
    expect(p.precoMedio.equals(150)).toBe(true);
  });

  it("venda realiza resultado líquido de taxas e zera o preço médio no fim", () => {
    const p = posicaoDe([compra("100", "2", "0.2"), venda("110", "1", "0.11"), venda("90", "1", "0.09")]);
    // -0,2 (taxa compra) + (10 - 0,11) + (-10 - 0,09) = -0,4
    expect(p.resultadoRealizado.equals("-0.4")).toBe(true);
    expect(p.taxasPagas.equals("0.4")).toBe(true);
    expect(p.quantidade.isZero()).toBe(true);
    expect(p.precoMedio.isZero()).toBe(true);
  });

  it("não deixa vender mais do que tem (spot não fica vendido)", () => {
    expect(() => posicaoDe([compra("100", "1"), venda("100", "2")])).toThrow(/mais do que/);
  });

  it("não altera a posição recebida", () => {
    const antes = POSICAO_ZERADA;
    const depois = aplicarExecucao(antes, compra("100", "1"));
    expect(antes.quantidade.isZero()).toBe(true);
    expect(depois).not.toBe(antes);
  });
});
