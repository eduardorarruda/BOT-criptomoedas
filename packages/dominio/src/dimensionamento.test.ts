import { describe, expect, it } from "vitest";
import { dec, paraTexto } from "./dinheiro.js";
import { maiorQuantidade } from "./dimensionamento.js";
import type { FiltrosAtivo } from "./tipos.js";

const filtros: FiltrosAtivo = {
  passoQuantidade: dec("0.00001"),
  quantidadeMinima: dec("0.00001"),
  valorMinimo: dec("5"),
  passoPreco: dec("0.01"),
};

describe("dimensionamento por busca binária", () => {
  it("o risco limita: perder no stop não passa do máximo aceito", () => {
    const q = maiorQuantidade({
      preco: dec(60000),
      stop: dec(58800),
      riscoMaximo: dec(10),
      disponivel: dec(100000),
      filtros,
      taxa: 0.001,
    });
    expect(q).not.toBeNull();
    const perda = (x: ReturnType<typeof dec>) =>
      x
        .times(60000 - 58800)
        .plus(x.times(60000).times(0.001))
        .plus(x.times(58800).times(0.001));
    expect(perda(q!).lte(10)).toBe(true);
    // um passo a mais já estoura o risco: é a MAIOR quantidade
    expect(perda(q!.plus(filtros.passoQuantidade)).gt(10)).toBe(true);
    expect(paraTexto(q!)).toBe("0.00758");
  });

  it("o saldo limita quando o risco permitiria mais", () => {
    const q = maiorQuantidade({
      preco: dec(100),
      stop: dec(99),
      riscoMaximo: dec(1000),
      disponivel: dec(50),
      filtros,
      taxa: 0,
    });
    expect(paraTexto(q!)).toBe("0.5");
  });

  it("devolve nulo quando nem o mínimo da corretora cabe", () => {
    expect(
      maiorQuantidade({
        preco: dec(60000),
        stop: dec(58800),
        riscoMaximo: dec(0.01),
        disponivel: dec(100000),
        filtros,
        taxa: 0.001,
      }),
    ).toBeNull();
    expect(
      maiorQuantidade({
        preco: dec(100),
        stop: dec(99),
        riscoMaximo: dec(1000),
        disponivel: dec(4),
        filtros,
        taxa: 0,
      }),
    ).toBeNull();
  });

  it("respeita a quantidade máxima da corretora", () => {
    const q = maiorQuantidade({
      preco: dec(1),
      stop: dec(0.5),
      riscoMaximo: dec(1e9),
      disponivel: dec(1e9),
      filtros: { ...filtros, quantidadeMaxima: dec(1000) },
      taxa: 0,
    });
    expect(paraTexto(q!)).toBe("1000");
  });

  it("recusa stop acima do preço", () => {
    expect(() =>
      maiorQuantidade({
        preco: dec(100),
        stop: dec(101),
        riscoMaximo: dec(1),
        disponivel: dec(1),
        filtros,
        taxa: 0,
      }),
    ).toThrow(/stop/);
  });
});
