import { describe, expect, it } from "vitest";
import { contextoDeCandles } from "./contexto.js";
import { dec } from "./dinheiro.js";
import { decidir, decidirComSentido, validarEstrategia } from "./estrategia.js";
import { problemasNoMercado } from "./mercados/mercado.js";
import { AVISO_MODELOS, MODELOS, MODELOS_WIN, TODOS_OS_MODELOS } from "./modelos.js";
import { POSICAO_ZERADA } from "./posicao.js";

/** 300 candles com tendência, ciclos e volume variando: história suficiente para a SMA 200. */
const ctx = contextoDeCandles(
  Array.from({ length: 300 }, (_, i) => {
    const fecha = 100 + i * 0.2 + 8 * Math.sin(i / 9);
    return {
      abertura: i,
      fechamento: i + 1,
      abre: dec(fecha - 0.3),
      maxima: dec(fecha + 1.2),
      minima: dec(fecha - 1.1),
      fecha: dec(fecha),
      volume: dec(100 + ((i * 37) % 90)),
    };
  }),
);

describe("modelos de estratégia (exemplos)", () => {
  it("têm ids únicos, nome e um parágrafo de descrição", () => {
    expect(new Set(TODOS_OS_MODELOS.map((m) => m.id)).size).toBe(TODOS_OS_MODELOS.length);
    expect(MODELOS.length).toBeGreaterThanOrEqual(4);
    for (const m of TODOS_OS_MODELOS) {
      expect(m.nome.length).toBeGreaterThan(5);
      expect(m.descricao.length).toBeGreaterThan(200);
      expect(m.descricao).not.toMatch(/\n/);
    }
    expect(AVISO_MODELOS).toMatch(/não é recomendação/i);
  });

  it.each(MODELOS.map((m) => [m.id, m] as const))("%s passa nas validações do domínio e decide", (_, m) => {
    expect(validarEstrategia(m.estrategia)).toEqual([]);
    const s = decidir(m.estrategia, { ...ctx, preco: dec(ctx.fechamentos.at(-1)!) }, POSICAO_ZERADA);
    expect(s.explicacao).not.toMatch(/dados insuficientes/);
  });
});

/**
 * Três pregões de candles de 5 minutos (10:00–16:55 de Brasília), com tendência,
 * ciclos e volume: o que os modelos do mini índice veem no backtest.
 */
const pregoes = contextoDeCandles(
  ["2026-10-14", "2026-10-15", "2026-10-16"].flatMap((dia, d) =>
    Array.from({ length: 84 }, (_, i) => {
      const k = d * 84 + i;
      const fecha = 130_000 + k * 3 + 400 * Math.sin(k / 7);
      const abertura = Date.parse(`${dia}T10:00:00-03:00`) + i * 300_000;
      return {
        abertura,
        fechamento: abertura + 299_999,
        abre: dec(fecha - 20),
        maxima: dec(fecha + 60),
        minima: dec(fecha - 55),
        fecha: dec(fecha),
        volume: dec(1000 + ((k * 37) % 900)),
      };
    }),
  ),
);

describe("modelos do mini índice (WIN)", () => {
  it("são do WIN em 5 minutos, nos dois sentidos, sem taxa (os custos vêm do mercado)", () => {
    expect(MODELOS_WIN.length).toBeGreaterThanOrEqual(3);
    for (const m of MODELOS_WIN) {
      expect(m).toMatchObject({ mercado: "win", intervalo: "5m" });
      expect(m.estrategia.direcao).toBe("ambos");
      expect(m.estrategia.taxa).toBe(0);
      expect(problemasNoMercado(m.estrategia, "win")).toEqual([]);
      expect(problemasNoMercado(m.estrategia, "cripto")).toHaveLength(1);
      expect(m.descricao).not.toMatch(/recomend/i);
    }
    // os de cripto continuam só comprados
    for (const m of MODELOS) expect(problemasNoMercado(m.estrategia, "cripto")).toEqual([]);
  });

  it.each(MODELOS_WIN.map((m) => [m.id, m] as const))("%s passa nas validações e decide", (_, m) => {
    expect(validarEstrategia(m.estrategia)).toEqual([]);
    const s = decidirComSentido(m.estrategia, { ...pregoes, preco: dec(pregoes.fechamentos.at(-1)!) }, null);
    expect(s.explicacao).not.toMatch(/dados insuficientes/);
  });
});
