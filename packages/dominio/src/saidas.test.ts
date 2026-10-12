import { describe, expect, it } from "vitest";
import type { ContextoMercado } from "./contexto.js";
import { dec, type Valor } from "./dinheiro.js";
import type { Estrategia } from "./estrategia.js";
import { posicaoDe } from "./posicao.js";
import { precoEmpate } from "./precos.js";
import {
  atualizarStop,
  distanciaDeRisco,
  iniciarAcompanhamento,
  reconstruirAcompanhamento,
  stopDeEntrada,
  type Acompanhamento,
} from "./saidas.js";

const base: Estrategia = {
  entrada: {
    tipo: "comparar",
    esquerda: { tipo: "preco" },
    comparador: ">",
    direita: { tipo: "numero", valor: 0 },
  },
  stop: 0.1,
  alvoLiquido: 0.5,
  taxa: 0.001,
};

/** N candles de amplitude fixa 2 (máxima +1, mínima −1) em torno dos fechamentos: ATR = 2 sem gaps. */
function contexto(fechamentos: readonly number[]): ContextoMercado {
  return {
    fechamentos,
    maximas: fechamentos.map((f) => f + 1),
    minimas: fechamentos.map((f) => f - 1),
  };
}
const plano = contexto(Array<number>(20).fill(100));

const comprado = (preco: number) =>
  posicaoDe([{ lado: "COMPRA", preco: dec(preco), quantidade: dec(1), taxaCotacao: dec(0), em: 0 }]);

describe("stop de entrada", () => {
  it("sem stop por ATR: o stop percentual de sempre", () => {
    expect(stopDeEntrada(base, dec(100), plano)).toEqual({ stop: dec(90), explicacao: null });
  });

  it("por ATR: entrada − k × ATR(n) no candle da entrada", () => {
    const e = { ...base, stopAtr: { periodo: 14, multiplo: 2 } };
    const r = stopDeEntrada(e, dec(100), plano);
    expect(r.stop.toString()).toBe("96");
    expect(r.explicacao).toBe("stop em 96 (preço − 2 × ATR(14) de 2)");
  });

  it("o stop percentual vira o teto da distância", () => {
    const e = { ...base, stop: 0.02, stopAtr: { periodo: 14, multiplo: 2 } };
    const r = stopDeEntrada(e, dec(100), plano);
    expect(r.stop.toString()).toBe("98");
    expect(r.explicacao).toMatch(/passaria do stop máximo de 2%/);
  });

  it("sem máxima e mínima (ou ATR zero), cai no stop percentual e diz por quê", () => {
    const e = { ...base, stopAtr: { periodo: 14, multiplo: 2 } };
    expect(stopDeEntrada(e, dec(100), { fechamentos: plano.fechamentos })).toEqual({
      stop: dec(90),
      explicacao: "sem dados para ATR(14): stop fixo de 10% (90)",
    });
    const parado = { fechamentos: plano.fechamentos, maximas: plano.fechamentos, minimas: plano.fechamentos };
    expect(stopDeEntrada(e, dec(100), parado).stop.toString()).toBe("90");
  });
});

describe("distância de risco por volatilidade", () => {
  it("k × ATR(n) quando pedido; senão null", () => {
    expect(distanciaDeRisco(base, plano)).toBeNull();
    const e = { ...base, tamanhoPorVolatilidade: { periodo: 14, multiplo: 1.5 } };
    expect(distanciaDeRisco(e, plano)?.toString()).toBe("3");
    expect(distanciaDeRisco(e, { fechamentos: [1, 2] })).toBeNull();
  });
});

describe("atualizarStop (stop móvel, empate)", () => {
  const inicial = iniciarAcompanhamento(base, comprado(100));

  it("começa no stop da posição, com a máxima na entrada e zero candles", () => {
    expect(inicial).toEqual({ entrada: dec(100), stop: dec(90), maxima: dec(100), candles: 0 });
  });

  it("sem stop móvel nem empate: só conta candles e guarda a máxima", () => {
    const r = atualizarStop(base, inicial, contexto([...plano.fechamentos, 110]));
    expect(r.novoStop).toBeNull();
    expect(r.explicacao).toBeNull();
    expect(r.acompanhamento).toEqual({ ...inicial, maxima: dec(111), candles: 1 });
  });

  it("stop móvel percentual sobe com a máxima e nunca desce", () => {
    const e: Estrategia = { ...base, stopMovel: { tipo: "percentual", distancia: 0.05 } };
    const subiu = atualizarStop(e, inicial, contexto([...plano.fechamentos, 109]));
    expect(subiu.novoStop?.toString()).toBe("104.5");
    expect(subiu.explicacao).toBe("stop subiu de 90 para 104,5 (stop móvel: 5% abaixo da máxima 110)");
    const caiu = atualizarStop(e, subiu.acompanhamento, contexto([...plano.fechamentos, 109, 100]));
    expect(caiu.novoStop).toBeNull();
    expect(caiu.acompanhamento.stop.toString()).toBe("104.5");
  });

  it("stop móvel por ATR: máxima − k × ATR (saída de candelabro)", () => {
    const e: Estrategia = { ...base, stopMovel: { tipo: "atr", periodo: 14, multiplo: 3 } };
    const r = atualizarStop(e, inicial, contexto([...Array<number>(19).fill(100), 100]));
    // máxima 101, ATR 2: 101 − 6 = 95
    expect(r.novoStop?.toString()).toBe("95");
    expect(r.explicacao).toMatch(/máxima 101 − 3 × ATR\(14\) de 2/);
    expect(atualizarStop(e, inicial, { fechamentos: [100] }).novoStop).toBeNull();
  });

  it("empate: depois de +X%, o stop vai para o preço que zera as duas taxas", () => {
    const e: Estrategia = { ...base, empate: { gatilho: 0.03 } };
    expect(atualizarStop(e, inicial, contexto([...plano.fechamentos, 101.9])).novoStop).toBeNull();
    const r = atualizarStop(e, inicial, contexto([...plano.fechamentos, 102.5]));
    expect(r.novoStop?.equals(precoEmpate(dec(100), 0.001))).toBe(true);
    expect(r.explicacao).toMatch(/o preço subiu 3% e o stop foi para o empate/);
  });

  it("vale o candidato mais alto entre stop móvel e empate", () => {
    const e: Estrategia = {
      ...base,
      empate: { gatilho: 0.03 },
      stopMovel: { tipo: "percentual", distancia: 0.2 },
    };
    const r = atualizarStop(e, inicial, contexto([...plano.fechamentos, 105]));
    expect(r.novoStop?.equals(precoEmpate(dec(100), 0.001))).toBe(true);
  });

  it("contexto vazio não muda nada", () => {
    expect(atualizarStop(base, inicial, { fechamentos: [] })).toEqual({
      acompanhamento: inicial,
      novoStop: null,
      explicacao: null,
    });
  });

  it("reconstrói o acompanhamento depois de um reinício, repassando os candles desde a entrada", () => {
    const e: Estrategia = { ...base, stopMovel: { tipo: "percentual", distancia: 0.05 } };
    const fechamentos = [...plano.fechamentos, 104, 109, 103];
    let passo = inicial;
    for (let i = 3; i >= 1; i--)
      passo = atualizarStop(
        e,
        passo,
        contexto(fechamentos.slice(0, fechamentos.length - i + 1)),
      ).acompanhamento;
    expect(reconstruirAcompanhamento(e, inicial, contexto(fechamentos), 3)).toEqual(passo);
    expect(reconstruirAcompanhamento(e, inicial, contexto(fechamentos), 0)).toEqual(inicial);
    expect(() => reconstruirAcompanhamento(e, inicial, contexto(fechamentos), 99)).toThrow(/candles/);
  });
});

describe("propriedades do stop móvel (séries aleatórias com semente)", () => {
  function aleatorio(semente: number): () => number {
    let a = semente >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // 5 × 40 séries × 120 candles: rápido sozinho (< 0,5 s), mas o turbo roda todos os pacotes juntos.
  const PRAZO_MS = 60_000;
  const configuracoes: readonly Partial<Estrategia>[] = [
    { stopMovel: { tipo: "percentual", distancia: 0.03 } },
    { stopMovel: { tipo: "atr", periodo: 14, multiplo: 2.5 } },
    { empate: { gatilho: 0.02 } },
    { empate: { gatilho: 0.015 }, stopMovel: { tipo: "atr", periodo: 10, multiplo: 1 } },
    { empate: { gatilho: 0.05 }, stopMovel: { tipo: "percentual", distancia: 0.01 } },
  ];

  it.each(configuracoes.map((c, i) => [i, c] as const))(
    "configuração %i: monotônico, nunca acima da máxima, novoStop só quando sobe",
    (_, config) => {
      const e: Estrategia = { ...base, ...config };
      for (let semente = 1; semente <= 40; semente++) {
        const r = aleatorio(semente);
        const f: number[] = [];
        const h: number[] = [];
        const l: number[] = [];
        let preco = 100;
        for (let i = 0; i < 30; i++) {
          f.push(preco);
          h.push(preco * 1.004);
          l.push(preco * 0.996);
        }
        let a: Acompanhamento = iniciarAcompanhamento(e, comprado(preco));
        for (let i = 0; i < 120; i++) {
          preco *= 1 + (r() - 0.48) * 0.03;
          f.push(preco);
          h.push(preco * (1 + r() * 0.01));
          l.push(preco * (1 - r() * 0.01));
          const antes = a;
          const passo = atualizarStop(e, a, { fechamentos: f, maximas: h, minimas: l });
          a = passo.acompanhamento;
          expect(a.stop.gte(antes.stop)).toBe(true);
          expect(a.maxima.gte(antes.maxima)).toBe(true);
          expect(a.stop.lte(a.maxima)).toBe(true);
          expect(a.candles).toBe(antes.candles + 1);
          expect(passo.novoStop === null).toBe(a.stop.equals(antes.stop));
          if (passo.novoStop) expect((passo.novoStop as Valor).equals(a.stop)).toBe(true);
        }
      }
    },
    PRAZO_MS,
  );
});
