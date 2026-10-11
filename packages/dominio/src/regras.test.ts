import { describe, expect, it } from "vitest";
import { avaliar, validarRegra, type Regra } from "./regras.js";

// 15 fechamentos em 100 e o último em 98: SMA(15) ≈ 99,87
const fechamentos = [...Array<number>(14).fill(100), 98];
const preco = { tipo: "preco" } as const;
const sma15 = { tipo: "indicador", nome: "sma", periodo: 15 } as const;

const abaixoDaMedia: Regra = {
  tipo: "comparar",
  esquerda: preco,
  comparador: "<",
  direita: { tipo: "multiplicar", operando: sma15, fator: 0.99 },
};

describe("árvore de regras", () => {
  it("avalia comparação com operando composto e explica com os números", () => {
    const r = avaliar(abaixoDaMedia, { fechamentos });
    expect(r.valor).toBe(true);
    expect(r.explicacao).toMatch(/^preço \(98\) < 0,99 × SMA\(15\) \(98,8\d*\): sim$/);
  });

  it("E, OU e NÃO combinam recursivamente", () => {
    const falso: Regra = {
      tipo: "comparar",
      esquerda: preco,
      comparador: ">",
      direita: { tipo: "numero", valor: 1000 },
    };
    expect(avaliar({ tipo: "e", regras: [abaixoDaMedia, falso] }, { fechamentos }).valor).toBe(false);
    expect(avaliar({ tipo: "ou", regras: [falso, abaixoDaMedia] }, { fechamentos }).valor).toBe(true);
    const nao = avaliar({ tipo: "nao", regra: falso }, { fechamentos });
    expect(nao.valor).toBe(true);
    expect(nao.explicacao).toMatch(/^não \(preço/);
  });

  it("cruzou abaixo compara o candle anterior com o atual", () => {
    const cruzou: Regra = {
      tipo: "comparar",
      esquerda: preco,
      comparador: "cruzouAbaixo",
      direita: { tipo: "numero", valor: 99 },
    };
    expect(avaliar(cruzou, { fechamentos }).valor).toBe(true);
    const cruzouAcima: Regra = { ...cruzou, comparador: "cruzouAcima" };
    expect(avaliar(cruzouAcima, { fechamentos }).valor).toBe(false);
  });

  it("dado insuficiente nunca vira sinal verdadeiro", () => {
    const r = avaliar(abaixoDaMedia, { fechamentos: [100, 99] });
    expect(r.valor).toBe(false);
    expect(r.explicacao).toMatch(/dados insuficientes/);
  });

  it("todos os comparadores", () => {
    const c = (comparador: "<=" | ">=" | ">", valor: number): boolean =>
      avaliar(
        { tipo: "comparar", esquerda: preco, comparador, direita: { tipo: "numero", valor } },
        { fechamentos },
      ).valor;
    expect(c("<=", 98)).toBe(true);
    expect(c(">=", 98)).toBe(true);
    expect(c(">", 98)).toBe(false);
  });

  it("aceita EMA e RSI como operandos", () => {
    const rsiBaixo: Regra = {
      tipo: "comparar",
      esquerda: { tipo: "indicador", nome: "rsi", periodo: 14 },
      comparador: "<",
      direita: { tipo: "numero", valor: 30 },
    };
    expect(avaliar(rsiBaixo, { fechamentos }).valor).toBe(true);
    const emaAcima: Regra = {
      tipo: "comparar",
      esquerda: { tipo: "indicador", nome: "ema", periodo: 5 },
      comparador: ">",
      direita: preco,
    };
    expect(avaliar(emaAcima, { fechamentos }).valor).toBe(true);
  });

  describe("validação (a árvore vem do construtor visual)", () => {
    it("aceita a regra bem formada", () => {
      expect(validarRegra(abaixoDaMedia)).toEqual([]);
    });

    it("recusa grupo vazio, período inválido e fator absurdo", () => {
      expect(validarRegra({ tipo: "e", regras: [] })).toEqual([expect.stringMatching(/pelo menos uma/)]);
      expect(
        validarRegra({ ...abaixoDaMedia, esquerda: { tipo: "indicador", nome: "sma", periodo: 0 } }),
      ).toEqual([expect.stringMatching(/período/)]);
      expect(
        validarRegra({ ...abaixoDaMedia, direita: { tipo: "multiplicar", operando: sma15, fator: -1 } }),
      ).toEqual([expect.stringMatching(/fator/)]);
      expect(validarRegra({ ...abaixoDaMedia, direita: { tipo: "numero", valor: Number.NaN } })).toEqual([
        expect.stringMatching(/número/),
      ]);
    });

    it("limita a profundidade da árvore", () => {
      let r: Regra = abaixoDaMedia;
      for (let i = 0; i < 20; i++) r = { tipo: "nao", regra: r };
      expect(validarRegra(r)).toEqual([expect.stringMatching(/profund/)]);
    });
  });
});
