import { dec, type Candle } from "@zentrade/dominio";
import { describe, expect, it } from "vitest";
import { niveisDaPosicao, saidaNoCaminho, saidaNoCandle, type NiveisSaida } from "./intrabar.js";

const vela = (abre: number, maxima: number, minima: number, fecha: number, abertura = 0): Candle => ({
  abertura,
  fechamento: abertura + 59_999,
  abre: dec(abre),
  maxima: dec(maxima),
  minima: dec(minima),
  fecha: dec(fecha),
  volume: dec(1),
});

const niveis: NiveisSaida = { stop: dec(98), alvo: dec(103) };

describe("saída dentro do candle (stop e alvo pela mínima e pela máxima)", () => {
  it("nada tocado: segue aberta", () => {
    expect(saidaNoCandle(vela(100, 102, 99, 101), niveis)).toBeNull();
  });

  it("mínima abaixo do stop: sai NO stop, mesmo que o candle feche acima dele", () => {
    expect(saidaNoCandle(vela(100, 101, 97, 100.5), niveis)).toEqual({
      preco: dec(98),
      motivo: "stop",
      ambiguo: false,
    });
  });

  it("máxima acima do alvo: sai no alvo, mesmo que o candle feche abaixo dele", () => {
    expect(saidaNoCandle(vela(100, 104, 99, 100), niveis)).toEqual({
      preco: dec(103),
      motivo: "alvo",
      ambiguo: false,
    });
  });

  it("stop E alvo no mesmo candle: pior caso, conta o stop (e marca como ambíguo)", () => {
    expect(saidaNoCandle(vela(100, 105, 96, 104), niveis)).toEqual({
      preco: dec(98),
      motivo: "stop",
      ambiguo: true,
    });
  });

  it("abertura com salto: abaixo do stop sai na abertura (pior que o stop); acima do alvo, na abertura", () => {
    expect(saidaNoCandle(vela(95, 99, 94, 97), niveis)).toEqual({
      preco: dec(95),
      motivo: "stop",
      ambiguo: false,
    });
    expect(saidaNoCandle(vela(105, 106, 97, 104), niveis)).toEqual({
      preco: dec(105),
      motivo: "alvo",
      ambiguo: false,
    });
  });

  it("encostar exatamente no nível conta", () => {
    expect(saidaNoCandle(vela(100, 101, 98, 100), niveis)?.motivo).toBe("stop");
    expect(saidaNoCandle(vela(100, 103, 99, 100), niveis)?.motivo).toBe("alvo");
  });
});

describe("caminho de 1 minuto", () => {
  it("o primeiro minuto que toca decide: aqui o alvo veio antes do stop", () => {
    const minutos = [
      vela(100, 101, 99, 100, 0),
      vela(100, 103.5, 99.5, 103, 60_000),
      vela(103, 103, 96, 97, 120_000),
    ];
    expect(saidaNoCaminho(minutos, niveis)).toEqual({
      preco: dec(103),
      motivo: "alvo",
      ambiguo: false,
      em: 60_000 + 59_999,
    });
  });

  it("sem toque em nenhum minuto: null; ambíguo dentro do minuto continua pior caso", () => {
    expect(saidaNoCaminho([vela(100, 101, 99, 100)], niveis)).toBeNull();
    expect(saidaNoCaminho([], niveis)).toBeNull();
    expect(saidaNoCaminho([vela(100, 104, 97, 100, 0)], niveis)?.motivo).toBe("stop");
  });
});

describe("níveis da posição", () => {
  it("stop e alvo líquido a partir do preço médio, como o robô calcula", () => {
    const n = niveisDaPosicao(dec(100), { stop: 0.02, alvoLiquido: 0.01, taxa: 0.001 });
    expect(n.stop.toFixed()).toBe("98");
    // 100 × 1,001 × 1,01 / 0,999
    expect(n.alvo.toNumber()).toBeCloseTo((100 * 1.001 * 1.01) / 0.999, 10);
  });
});
