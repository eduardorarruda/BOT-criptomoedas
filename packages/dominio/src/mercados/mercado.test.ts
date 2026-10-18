import { describe, expect, it } from "vitest";
import type { Estrategia } from "../estrategia.js";
import type { Regra } from "../regras.js";
import { MERCADOS, problemasNoMercado } from "./mercado.js";

const sempre: Regra = {
  tipo: "comparar",
  esquerda: { tipo: "preco" },
  comparador: ">",
  direita: { tipo: "numero", valor: 0 },
};
const comprada: Estrategia = { entrada: sempre, stop: 0.02, alvoLiquido: 0.03, taxa: 0.001 };

describe("o que cada mercado aceita", () => {
  it("cripto (à vista) só opera comprado; o mini índice opera os dois lados", () => {
    expect(MERCADOS.cripto.direcoes).toEqual(["comprado"]);
    expect(MERCADOS.win.direcoes).toEqual(["comprado", "vendido", "ambos"]);
    expect(problemasNoMercado(comprada, "cripto")).toEqual([]);
    expect(problemasNoMercado({ ...comprada, direcao: "comprado" }, "cripto")).toEqual([]);
    for (const direcao of ["vendido", "ambos"] as const) {
      const p = problemasNoMercado({ ...comprada, direcao, entradaVendida: sempre }, "cripto");
      expect(p).toHaveLength(1);
      expect(p[0]).toMatch(/à vista de cripto só opera comprado/);
      expect(problemasNoMercado({ ...comprada, direcao, entradaVendida: sempre }, "win")).toEqual([]);
    }
  });
});
