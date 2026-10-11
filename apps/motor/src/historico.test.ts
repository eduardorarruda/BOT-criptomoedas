import { dec, type Execucao } from "@zentrade/dominio";
import { describe, expect, it } from "vitest";
import { operacoesFechadas, resultadoDesde, ultimaPerdaEm } from "./historico.js";

const ex = (lado: "COMPRA" | "VENDA", preco: number, em: number, quantidade = 1, taxa = "0"): Execucao => ({
  lado,
  preco: dec(preco),
  quantidade: dec(quantidade),
  taxaCotacao: dec(taxa),
  em,
});

describe("histórico de execuções", () => {
  const execucoes = [
    ex("COMPRA", 100, 1, 1, "0.1"),
    ex("VENDA", 110, 2, 1, "0.11"),
    ex("COMPRA", 100, 3),
    ex("VENDA", 90, 4, 0.5),
    ex("VENDA", 95, 5, 0.5),
    ex("COMPRA", 100, 6),
  ];

  it("operações fechadas: da abertura até a posição zerar, resultado líquido de taxas", () => {
    const ops = operacoesFechadas(execucoes);
    expect(ops).toHaveLength(2);
    expect(ops[0]!.resultado.equals(dec("9.79"))).toBe(true);
    expect(ops[0]!).toMatchObject({ abertaEm: 1, fechadaEm: 2 });
    expect(ops[1]!.resultado.equals(dec(-7.5))).toBe(true);
    expect(ops[1]!.fechadaEm).toBe(5);
  });

  it("resultado realizado desde um instante", () => {
    expect(resultadoDesde(execucoes, 0).equals(dec("2.29"))).toBe(true);
    expect(resultadoDesde(execucoes, 3).equals(dec(-7.5))).toBe(true);
    expect(resultadoDesde([], 0).isZero()).toBe(true);
  });

  it("última perda: quando fechou a última operação perdedora", () => {
    expect(ultimaPerdaEm(execucoes)).toBe(5);
    expect(ultimaPerdaEm(execucoes.slice(0, 2))).toBeNull();
  });
});
