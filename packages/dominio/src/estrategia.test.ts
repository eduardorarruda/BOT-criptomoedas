import { describe, expect, it } from "vitest";
import { dec } from "./dinheiro.js";
import { decidir, precoAlvo, validarEstrategia, type Estrategia } from "./estrategia.js";
import { posicaoDe } from "./posicao.js";
import { POSICAO_ZERADA } from "./posicao.js";

const fechamentos = [...Array<number>(14).fill(100), 98];
const estrategia: Estrategia = {
  entrada: {
    tipo: "comparar",
    esquerda: { tipo: "preco" },
    comparador: "<",
    direita: { tipo: "multiplicar", operando: { tipo: "indicador", nome: "sma", periodo: 15 }, fator: 0.99 },
  },
  stop: 0.02,
  alvoLiquido: 0.005,
  taxa: 0.001,
};

describe("estratégia", () => {
  it("o alvo cobre as duas taxas e o lucro líquido pedido", () => {
    const alvo = precoAlvo(dec(100), 0.005, 0.001);
    // 100 × 1,001 × 1,005 / 0,999
    expect(alvo.toDecimalPlaces(6).toString()).toBe("100.701201");
    // vendendo no alvo, sobra exatamente 0,5% depois das taxas
    const liquido = alvo
      .times(1 - 0.001)
      .div(dec(100).times(1 + 0.001))
      .minus(1);
    expect(liquido.toDecimalPlaces(10).toNumber()).toBeCloseTo(0.005, 10);
  });

  it("sem posição e com a regra de entrada verdadeira: compra com stop e alvo", () => {
    const s = decidir(estrategia, { fechamentos, preco: dec(98) }, POSICAO_ZERADA);
    expect(s.acao).toBe("COMPRAR");
    if (s.acao !== "COMPRAR") return;
    expect(s.stop.equals(dec(98).times(0.98))).toBe(true);
    expect(s.alvo.gt(98)).toBe(true);
    expect(s.explicacao).toMatch(/preço/);
  });

  it("sem posição e regra falsa: aguarda", () => {
    expect(
      decidir(estrategia, { fechamentos: Array<number>(15).fill(100), preco: dec(100) }, POSICAO_ZERADA).acao,
    ).toBe("AGUARDAR");
  });

  const comprado = posicaoDe([
    { lado: "COMPRA", preco: dec(100), quantidade: dec(1), taxaCotacao: dec(0), em: 0 },
  ]);

  it("comprado: vende no stop, no alvo, e aguarda no meio", () => {
    expect(decidir(estrategia, { fechamentos, preco: dec(97.9) }, comprado)).toMatchObject({
      acao: "VENDER",
      motivo: "stop",
    });
    expect(decidir(estrategia, { fechamentos, preco: dec(101) }, comprado)).toMatchObject({
      acao: "VENDER",
      motivo: "alvo",
    });
    expect(decidir(estrategia, { fechamentos, preco: dec(100.2) }, comprado).acao).toBe("AGUARDAR");
  });

  it("comprado: a regra de saída também encerra", () => {
    const comSaida: Estrategia = {
      ...estrategia,
      saida: {
        tipo: "comparar",
        esquerda: { tipo: "preco" },
        comparador: "<",
        direita: { tipo: "numero", valor: 99 },
      },
    };
    expect(decidir(comSaida, { fechamentos, preco: dec(99.5) }, comprado)).toMatchObject({
      acao: "VENDER",
      motivo: "regra de saída",
    });
  });

  it("valida os parâmetros", () => {
    expect(validarEstrategia(estrategia)).toEqual([]);
    expect(validarEstrategia({ ...estrategia, stop: 0 })).toEqual([expect.stringMatching(/stop/)]);
    expect(validarEstrategia({ ...estrategia, alvoLiquido: 0 })).toEqual([expect.stringMatching(/alvo/)]);
    expect(validarEstrategia({ ...estrategia, taxa: 0.5 })).toEqual([expect.stringMatching(/taxa/)]);
  });
});
