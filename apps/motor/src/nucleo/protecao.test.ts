import { dec, precoAlvo, type FiltrosAtivo } from "@zentrade/dominio";
import { describe, expect, it } from "vitest";
import { ajusteDaPosicao, protecaoConservadora, quantidadeCompra, quantidadeVenda } from "./protecao.js";

const filtros: FiltrosAtivo = {
  passoQuantidade: dec("0.001"),
  quantidadeMinima: dec("0.001"),
  valorMinimo: dec(5),
  passoPreco: dec("0.01"),
};

describe("stop e alvo conservadores", () => {
  const preco = dec(100);
  const sinal = { stop: dec(98), alvo: dec(101) };

  it("sem proposta ou sem stop/alvo do agente: os do sinal", () => {
    expect(protecaoConservadora(sinal, undefined, preco, 0.001)).toEqual(sinal);
    expect(protecaoConservadora(sinal, {}, preco, 0.001)).toEqual(sinal);
  });

  it("stop do agente mais alto e abaixo do preço vence; acima do preço é ignorado", () => {
    expect(protecaoConservadora(sinal, { stop: "99" }, preco, 0.001).stop.equals(dec(99))).toBe(true);
    expect(protecaoConservadora(sinal, { stop: "97" }, preco, 0.001).stop.equals(dec(98))).toBe(true);
    expect(protecaoConservadora(sinal, { stop: "100" }, preco, 0.001).stop.equals(dec(98))).toBe(true);
  });

  it("alvo do agente menor vale só se cobrir as duas taxas (o bot antigo vendia abaixo da taxa)", () => {
    const empate = precoAlvo(preco, 0, 0.001);
    expect(protecaoConservadora(sinal, { alvo: "100.5" }, preco, 0.001).alvo.equals(dec("100.5"))).toBe(true);
    expect(protecaoConservadora(sinal, { alvo: "100.1" }, preco, 0.001).alvo.equals(dec(101))).toBe(true);
    expect(empate.gt(dec("100.1"))).toBe(true);
    expect(protecaoConservadora(sinal, { alvo: "105" }, preco, 0.001).alvo.equals(dec(101))).toBe(true);
  });

  it("ajuste da posição em frações a partir do preço de referência", () => {
    const a = ajusteDaPosicao({ stop: dec(99), alvo: dec("100.5") }, preco, 0.001);
    expect(a.stop).toBeCloseTo(0.01, 10);
    expect(precoAlvo(preco, a.alvoLiquido, 0.001).toDecimalPlaces(8).toNumber()).toBeCloseTo(100.5, 6);
  });
});

describe("quantidade", () => {
  it("compra: maior quantidade pelo risco, vezes o tamanho relativo, arredondada no passo", () => {
    const base = {
      preco: dec(100),
      stop: dec(98),
      riscoMaximo: dec(10),
      disponivel: dec(1000),
      filtros,
      taxa: 0.001,
    };
    const cheia = quantidadeCompra(base, 1);
    expect(cheia.gt(0)).toBe(true);
    const metade = quantidadeCompra(base, 0.5);
    expect(metade.lte(cheia.div(2))).toBe(true);
    expect(metade.mod(filtros.passoQuantidade).isZero()).toBe(true);
  });

  it("compra sem espaço (nem o mínimo cabe) ou com tamanho zero: zero", () => {
    const base = {
      preco: dec(100),
      stop: dec(98),
      riscoMaximo: dec(10),
      disponivel: dec(1),
      filtros,
      taxa: 0.001,
    };
    expect(quantidadeCompra(base, 1).isZero()).toBe(true);
    expect(quantidadeCompra({ ...base, disponivel: dec(1000) }, 0).isZero()).toBe(true);
  });

  it("venda: a posição inteira arredondada para baixo no passo", () => {
    expect(quantidadeVenda(dec("1.23456"), filtros).equals(dec("1.234"))).toBe(true);
  });
});
