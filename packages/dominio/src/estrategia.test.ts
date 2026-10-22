import { describe, expect, it } from "vitest";
import { dec } from "./dinheiro.js";
import { decidir, validarEstrategia, type Estrategia } from "./estrategia.js";
import { precoAlvo } from "./precos.js";
import type { Acompanhamento } from "./saidas.js";
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

  describe("saídas novas", () => {
    // 20 candles parados em 100 com máxima 101 e mínima 99: ATR(14) = 2.
    const velas = {
      fechamentos: Array<number>(20).fill(100),
      maximas: Array<number>(20).fill(101),
      minimas: Array<number>(20).fill(99),
    };
    const sempre: Estrategia = {
      ...estrategia,
      entrada: {
        tipo: "comparar",
        esquerda: { tipo: "preco" },
        comparador: ">",
        direita: { tipo: "numero", valor: 0 },
      },
      stop: 0.1,
      alvoLiquido: 0.5,
    };

    it("compra com stop por ATR, explicado, e a distância de risco para o tamanho", () => {
      const e: Estrategia = {
        ...sempre,
        stopAtr: { periodo: 14, multiplo: 2 },
        tamanhoPorVolatilidade: { periodo: 14, multiplo: 1 },
      };
      const s = decidir(e, { ...velas, preco: dec(100) }, POSICAO_ZERADA);
      expect(s).toMatchObject({ acao: "COMPRAR" });
      if (s.acao !== "COMPRAR") return;
      expect(s.stop.toString()).toBe("96");
      expect(s.distanciaRisco?.toString()).toBe("2");
      expect(s.explicacao).toBe("preço (100) > 0: sim; stop em 96 (preço − 2 × ATR(14) de 2)");
      const semTamanho = decidir(sempre, { ...velas, preco: dec(100) }, POSICAO_ZERADA);
      expect(semTamanho).not.toHaveProperty("distanciaRisco");
    });

    const acompanhamento = (stop: number, candles = 0): Acompanhamento => ({
      entrada: dec(100),
      stop: dec(stop),
      maxima: dec(110),
      candles,
    });

    it("com acompanhamento, vale o stop efetivo (o que subiu)", () => {
      const ctx = { ...velas, preco: dec(104), acompanhamento: acompanhamento(104.5) };
      expect(decidir(sempre, ctx, comprado)).toEqual({
        acao: "VENDER",
        motivo: "stop",
        explicacao: "preço 104 chegou ao stop efetivo 104,5",
      });
      const aguarda = decidir(sempre, { ...ctx, preco: dec(105) }, comprado);
      expect(aguarda.explicacao).toMatch(/^posição aberta: stop efetivo em 104,5, alvo em/);
      // acompanhamento abaixo do stop fixo não afrouxa nada
      expect(
        decidir(sempre, { ...ctx, preco: dec(91), acompanhamento: acompanhamento(80) }, comprado).acao,
      ).toBe("AGUARDAR");
    });

    it("saída por tempo depois da regra de saída, antes de aguardar", () => {
      const e: Estrategia = { ...sempre, tempoMaximo: 5 };
      const ctx = { ...velas, preco: dec(101), acompanhamento: acompanhamento(90, 4) };
      expect(decidir(e, ctx, comprado).explicacao).toMatch(/, 4 de 5 candles$/);
      expect(decidir(e, { ...ctx, acompanhamento: acompanhamento(90, 5) }, comprado)).toEqual({
        acao: "VENDER",
        motivo: "tempo",
        explicacao: "a posição completou 5 candles sem chegar ao alvo (limite de 5)",
      });
      // sem acompanhamento não há relógio: segue aguardando
      expect(decidir(e, { ...velas, preco: dec(101) }, comprado).acao).toBe("AGUARDAR");
      const comSaida: Estrategia = {
        ...e,
        saida: {
          tipo: "comparar",
          esquerda: { tipo: "preco" },
          comparador: ">",
          direita: { tipo: "numero", valor: 0 },
        },
      };
      expect(decidir(comSaida, { ...ctx, acompanhamento: acompanhamento(90, 5) }, comprado)).toMatchObject({
        motivo: "regra de saída",
      });
    });

    it("valida os campos de saída", () => {
      const v = (parcial: Partial<Estrategia>) => validarEstrategia({ ...estrategia, ...parcial });
      expect(
        v({
          stopAtr: { periodo: 14, multiplo: 2 },
          stopMovel: { tipo: "atr", periodo: 22, multiplo: 3 },
          empate: { gatilho: 0.02 },
          tempoMaximo: 48,
          tamanhoPorVolatilidade: { periodo: 20, multiplo: 2 },
        }),
      ).toEqual([]);
      expect(v({ stopAtr: { periodo: 0, multiplo: 2 } })).toEqual([
        expect.stringMatching(/período do ATR do stop/),
      ]);
      expect(v({ stopAtr: { periodo: 14, multiplo: 0 } })).toEqual([
        expect.stringMatching(/múltiplo do ATR do stop/),
      ]);
      expect(v({ stopMovel: { tipo: "percentual", distancia: 0.5 } })).toEqual([
        expect.stringMatching(/distância do stop móvel/),
      ]);
      expect(v({ stopMovel: { tipo: "atr", periodo: 14, multiplo: 21 } })).toEqual([
        expect.stringMatching(/stop móvel/),
      ]);
      expect(v({ empate: { gatilho: 0.001 } })).toEqual([
        expect.stringMatching(/custo das duas taxas \(0,2002%\)/),
      ]);
      expect(v({ tempoMaximo: 0 })).toEqual([expect.stringMatching(/tempo máximo/)]);
      expect(v({ tempoMaximo: 2.5 })).toHaveLength(1);
      expect(v({ tamanhoPorVolatilidade: { periodo: 14, multiplo: -1 } })).toEqual([
        expect.stringMatching(/ATR do tamanho/),
      ]);
    });

    const v = (parcial: Partial<Estrategia>) => validarEstrategia({ ...estrategia, ...parcial });

    it("tamanho por alocação: fração entre 0 e 100%, e não junto com o tamanho pela volatilidade", () => {
      expect(v({ tamanhoPorAlocacao: { fracao: 1 } })).toEqual([]);
      expect(v({ tamanhoPorAlocacao: { fracao: 0.5 } })).toEqual([]);
      expect(v({ tamanhoPorAlocacao: { fracao: 0 } })).toEqual([expect.stringMatching(/alocação/)]);
      expect(v({ tamanhoPorAlocacao: { fracao: 1.2 } })).toEqual([expect.stringMatching(/alocação/)]);
      expect(
        v({
          tamanhoPorAlocacao: { fracao: 1 },
          tamanhoPorVolatilidade: { periodo: 14, multiplo: 2 },
        }),
      ).toEqual([expect.stringMatching(/um só jeito de definir o tamanho/)]);
    });

    it("aceita o stop de catástrofe mais largo permitido (49%) com alvo distante", () => {
      expect(v({ stop: 0.49, alvoLiquido: 0.99 })).toEqual([]);
    });
  });
});
