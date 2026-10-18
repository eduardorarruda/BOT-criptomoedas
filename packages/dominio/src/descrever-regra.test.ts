import { describe, expect, it } from "vitest";
import { MODELOS } from "./modelos.js";
import { descreverRegra, type Regra } from "./regras.js";

describe("descreverRegra (texto da regra, sem valores do momento)", () => {
  it("descreve uma comparação com indicador", () => {
    const donchian = MODELOS.find((m) => m.id === "donchian-20-10");
    expect(descreverRegra(donchian!.estrategia.saida!)).toBe("preço < fundo de Donchian(10)");
  });

  it("descreve grupos E, OU e NÃO", () => {
    const regra: Regra = {
      tipo: "e",
      regras: [
        {
          tipo: "comparar",
          esquerda: { tipo: "indicador", nome: "ema", periodo: 9 },
          comparador: "cruzouAbaixo",
          direita: { tipo: "indicador", nome: "ema", periodo: 21 },
        },
        {
          tipo: "nao",
          regra: {
            tipo: "ou",
            regras: [
              {
                tipo: "comparar",
                esquerda: { tipo: "preco" },
                comparador: ">=",
                direita: { tipo: "numero", valor: 70 },
              },
              {
                tipo: "comparar",
                esquerda: { tipo: "volume" },
                comparador: "<",
                direita: { tipo: "multiplicar", fator: 1.5, operando: { tipo: "numero", valor: 2 } },
              },
            ],
          },
        },
      ],
    };
    expect(descreverRegra(regra)).toBe(
      "(EMA(9) cruzou abaixo de EMA(21)) e (não ((preço ≥ 70) ou (volume < 1,5 × 2)))",
    );
  });
});
