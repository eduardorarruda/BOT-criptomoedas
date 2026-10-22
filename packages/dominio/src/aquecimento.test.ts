import { describe, expect, it } from "vitest";
import { candlesDeAquecimento } from "./aquecimento.js";
import type { Estrategia } from "./estrategia.js";
import { MODELOS } from "./modelos.js";
import type { Operando } from "./regras.js";

const sma = (periodo: number): Operando => ({ tipo: "indicador", nome: "sma", periodo });
const base: Estrategia = {
  entrada: { tipo: "comparar", esquerda: { tipo: "preco" }, comparador: ">", direita: sma(50) },
  stop: 0.05,
  alvoLiquido: 0.1,
  taxa: 0.001,
};

describe("candles de aquecimento que a estratégia pede", () => {
  it("nunca abaixo do mínimo, mesmo com indicadores curtos", () => {
    expect(candlesDeAquecimento(base, 200)).toBe(200);
  });

  it("o maior período entre a entrada, a saída e o ATR do stop, olhando dentro de E, OU e NÃO", () => {
    const e: Estrategia = {
      ...base,
      entrada: { tipo: "e", regras: [base.entrada, { tipo: "nao", regra: base.entrada }] },
      saida: { tipo: "comparar", esquerda: { tipo: "preco" }, comparador: "<", direita: sma(400) },
      stopAtr: { periodo: 450, multiplo: 2 },
    };
    expect(candlesDeAquecimento(e, 200)).toBe(450);
    expect(candlesDeAquecimento({ ...e, stopAtr: { periodo: 14, multiplo: 2 } }, 200)).toBe(400);
  });

  it("MACD pede a média lenta mais a de sinal; o fator de multiplicar não atrapalha", () => {
    const macd: Operando = {
      tipo: "multiplicar",
      fator: 2,
      operando: { tipo: "indicador", nome: "macd", rapida: 12, lenta: 260, periodoSinal: 9, saida: "macd" },
    };
    const e: Estrategia = {
      ...base,
      entrada: { tipo: "comparar", esquerda: macd, comparador: ">", direita: { tipo: "numero", valor: 0 } },
    };
    expect(candlesDeAquecimento(e, 200)).toBe(269);
  });

  it("o cofre pede 400 velas (a SMA 400) e os outros modelos de cripto continuam nos 200 de sempre", () => {
    for (const m of MODELOS)
      expect(candlesDeAquecimento(m.estrategia, 200)).toBe(m.id === "cofre-tendencia-sma400" ? 400 : 200);
  });
});
