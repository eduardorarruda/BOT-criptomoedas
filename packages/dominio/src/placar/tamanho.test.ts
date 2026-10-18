import { describe, expect, it } from "vitest";
import { dec } from "../dinheiro.js";
import type { Estrategia } from "../estrategia.js";
import type { Regra } from "../regras.js";
import { tamanhoDeReferenciaCripto } from "./tamanho.js";

const sempre: Regra = {
  tipo: "comparar",
  esquerda: { tipo: "preco" },
  comparador: ">",
  direita: { tipo: "numero", valor: 0 },
};
const e: Estrategia = { entrada: sempre, stop: 0.02, alvoLiquido: 0.03, taxa: 0 };

describe("tamanho de referência de uma entrada que não foi feita (cripto)", () => {
  it("pelo risco por operação: perder no stop exatamente o risco", () => {
    // stop 2% de 100 = 98; perda por unidade 2 → 10 ÷ 2 = 5 unidades (cabem em 1000 de exposição)
    const q = tamanhoDeReferenciaCripto({
      estrategia: e,
      preco: dec(100),
      contexto: { fechamentos: [100] },
      riscoPorOperacao: dec(10),
      exposicaoMaxima: dec(1000),
    });
    expect(q?.toString()).toBe("5");
  });

  it("limitado pela exposição máxima do robô", () => {
    const q = tamanhoDeReferenciaCripto({
      estrategia: e,
      preco: dec(100),
      contexto: { fechamentos: [100] },
      riscoPorOperacao: dec(10),
      exposicaoMaxima: dec(300),
    });
    expect(q?.toString()).toBe("3");
  });

  it("com a taxa: a perda no stop inclui as duas pontas", () => {
    const q = tamanhoDeReferenciaCripto({
      estrategia: { ...e, taxa: 0.001 },
      preco: dec(100),
      contexto: { fechamentos: [100] },
      riscoPorOperacao: dec(10),
      exposicaoMaxima: dec(10_000),
    });
    // perda por unidade = 2 + 0,1 + 0,098 = 2,198 → 10 ÷ 2,198
    expect(q!.toNumber()).toBeCloseTo(10 / 2.198, 6);
    expect(q!.times(2.198).lte(10)).toBe(true);
  });

  it("sem risco ou sem exposição, não há tamanho", () => {
    const pedido = {
      estrategia: e,
      preco: dec(100),
      contexto: { fechamentos: [100] },
      riscoPorOperacao: dec(0),
      exposicaoMaxima: dec(1000),
    };
    expect(tamanhoDeReferenciaCripto(pedido)).toBeNull();
    expect(
      tamanhoDeReferenciaCripto({ ...pedido, riscoPorOperacao: dec(10), exposicaoMaxima: dec(0) }),
    ).toBeNull();
  });
});
