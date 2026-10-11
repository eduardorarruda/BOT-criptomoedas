import { dec } from "@zentrade/dominio";
import { describe, expect, it } from "vitest";
import {
  consolidarPatrimonio,
  converterParaReais,
  situacaoDosItens,
  type ClasseAvaliada,
} from "./patrimonio.js";

const texto = (v: { toFixed(): string } | null) => (v === null ? null : v.toFixed());

describe("situação de uma classe pelos itens", () => {
  it("sem item é vazia; todos com valor, completa; alguns sem, parcial; nenhum com, indisponível", () => {
    expect(situacaoDosItens(0, 0)).toBe("vazia");
    expect(situacaoDosItens(3, 0)).toBe("completa");
    expect(situacaoDosItens(3, 1)).toBe("parcial");
    expect(situacaoDosItens(2, 2)).toBe("indisponivel");
  });
});

describe("conversão para reais", () => {
  it("multiplica pelo câmbio e arredonda aos centavos (meio para o par)", () => {
    expect(converterParaReais(dec("100"), dec("5.4321")).toFixed()).toBe("543.21");
    expect(converterParaReais(dec("0.125"), dec("1")).toFixed()).toBe("0.12");
    expect(converterParaReais(dec("0.135"), dec("1")).toFixed()).toBe("0.14");
  });
});

describe("consolidar o patrimônio", () => {
  const completo: ClasseAvaliada[] = [
    { classe: "cripto", situacao: "completa", valor: dec("2500") },
    { classe: "renda_fixa", situacao: "completa", valor: dec("5000") },
    { classe: "imobiliario", situacao: "completa", valor: dec("2500") },
  ];

  it("soma as classes e diz a fatia de cada uma, na ordem recebida", () => {
    const p = consolidarPatrimonio(completo);
    expect(p.total.toFixed()).toBe("10000");
    expect(p.parcial).toBe(false);
    expect(p.fatias.map((f) => [f.classe, texto(f.fracao)])).toEqual([
      ["cripto", "0.25"],
      ["renda_fixa", "0.5"],
      ["imobiliario", "0.25"],
    ]);
  });

  it("classe indisponível fica fora da soma e marca o total como parcial", () => {
    const p = consolidarPatrimonio([
      { classe: "cripto", situacao: "indisponivel", valor: null },
      { classe: "renda_fixa", situacao: "completa", valor: dec("3000") },
      { classe: "imobiliario", situacao: "completa", valor: dec("1000") },
    ]);
    expect(p.total.toFixed()).toBe("4000");
    expect(p.parcial).toBe(true);
    expect(p.fatias[0]).toMatchObject({ classe: "cripto", valor: null, fracao: null });
    expect(texto(p.fatias[1]!.fracao)).toBe("0.75");
  });

  it("classe parcial entra com o que tem valor e também marca o total como parcial", () => {
    const p = consolidarPatrimonio([
      { classe: "renda_fixa", situacao: "parcial", valor: dec("1000") },
      { classe: "imobiliario", situacao: "completa", valor: dec("1000") },
    ]);
    expect(p.total.toFixed()).toBe("2000");
    expect(p.parcial).toBe(true);
    expect(texto(p.fatias[0]!.fracao)).toBe("0.5");
  });

  it("classe vazia não pesa: sem fatia e sem tornar o total parcial", () => {
    const p = consolidarPatrimonio([
      { classe: "cripto", situacao: "vazia", valor: dec(0) },
      { classe: "renda_fixa", situacao: "completa", valor: dec("800") },
    ]);
    expect(p.total.toFixed()).toBe("800");
    expect(p.parcial).toBe(false);
    expect(p.fatias[0]!.fracao).toBeNull();
    expect(texto(p.fatias[1]!.fracao)).toBe("1");
  });

  it("nada cadastrado: total zero e nenhuma fatia (sem dividir por zero)", () => {
    const p = consolidarPatrimonio([
      { classe: "cripto", situacao: "vazia", valor: dec(0) },
      { classe: "renda_fixa", situacao: "vazia", valor: dec(0) },
    ]);
    expect(p.total.toFixed()).toBe("0");
    expect(p.fatias.every((f) => f.fracao === null)).toBe(true);
  });

  it("valor negativo (dívida maior que o imóvel) reduz o total, mas a composição só divide o que é positivo", () => {
    const p = consolidarPatrimonio([
      { classe: "renda_fixa", situacao: "completa", valor: dec("1000") },
      { classe: "imobiliario", situacao: "completa", valor: dec("-200") },
    ]);
    expect(p.total.toFixed()).toBe("800");
    expect(texto(p.fatias[0]!.fracao)).toBe("1");
    expect(texto(p.fatias[1]!.fracao)).toBe("0");
  });

  it("valor nulo numa classe que se diz completa não entra na soma (defesa contra dado incoerente)", () => {
    const p = consolidarPatrimonio([
      { classe: "cripto", situacao: "completa", valor: null },
      { classe: "renda_fixa", situacao: "completa", valor: dec("10") },
    ]);
    expect(p.total.toFixed()).toBe("10");
    expect(p.fatias[0]!.fracao).toBeNull();
  });
});
